#!/usr/bin/env python3
"""Cold snapshots of platform-owned Compose volumes, restored only into new identities.

Private job on stdin; snapshots contain application data and must be encrypted by
an offsite transport before leaving the node. Original configuration is supplied
separately by the caller, never written into this snapshot. This is not a release
publication gate, production takeover or an online database backup.
"""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import resource
import subprocess
import sys
import signal
import tarfile
import uuid

spec = importlib.util.spec_from_file_location('compose_kernel', Path(__file__).with_name('compose-install.py'))
kernel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kernel)
ARCHIVE_IMAGE = 'docker.io/library/busybox@sha256:bdf57e528e45e4433820e045b29b4597825a1c9e38353532d90a01445013f82e'
PROTOCOL = 'compose_cold_snapshot_v1'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def configuration_digest(job):
    value = json.loads(json.dumps(job))
    for key in ('instanceId', 'project', 'healthUrl', 'mode'):
        value.pop(key)
    value['compose']['services'][job['entrypoint']['service']].pop('ports')
    return digest(value)


def sha_file(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def private_directory(path, create=False):
    path = Path(path)
    kernel.require(not path.is_symlink(), 'Symlink directory refused')
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    kernel.require(path.is_dir() and path.stat().st_uid == os.geteuid() and path.stat().st_mode & 0o077 == 0, 'Private owned directory required')
    return path.resolve()


def private_file(path):
    kernel.require(not path.is_symlink() and path.is_file() and path.stat().st_uid == os.geteuid() and path.stat().st_mode & 0o077 == 0, 'Private owned file required')


@contextmanager
def locked(workspace):
    root = private_directory(workspace, create=True)
    fd = os.open(root / '.install.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield root
    finally:
        os.close(fd)


class Runtime:
    def __init__(self, job, directory):
        self.job, self.directory = job, directory
        self.fingerprint = digest(job)
        self.env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': str(directory), 'DOCKER_CONFIG': str(directory / '.snapshot-docker')}
        self.prefix = ['docker', 'compose'] if self.run(['docker', 'compose', 'version'], missing=True) is not None else ['docker-compose']

    def run(self, args, content=None, missing=False, timeout=90):
        result = subprocess.run(args, input=content, env=self.env, cwd=self.directory, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout)
        if result.returncode and not missing:
            raise RuntimeError('Snapshot Docker operation failed')
        return result.stdout.decode() if result.returncode == 0 else None

    def compose(self, args):
        # Stop/start only existing containers; restart does not recreate configuration.
        model = {'services': {key: {'image': value['image']} for key, value in self.job['compose']['services'].items()}}
        return self.run(self.prefix + ['-p', self.job['project'], '-f', '-'] + args, json.dumps(model).encode())

    def owner(self, kind, name, missing=False):
        template = '.Config.Labels' if kind == 'container' else '.Labels'
        args = ['docker'] + ([] if kind == 'container' else [kind]) + ['inspect', '-f', '{{index ' + template + ' "' + kernel.OWNER + '"}}', name]
        owner = self.run(args, missing=missing)
        kernel.require(owner is None or owner.strip() == self.fingerprint, 'Resource ownership mismatch')
        return owner

    def containers(self):
        ids = self.run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + self.job['project']]).split()
        for identifier in ids:
            self.owner('container', identifier)
        return ids

    def helper(self, volume, archive, restoring=False, limit=None):
        name = 'stack-snapshot-' + uuid.uuid4().hex
        command = ['docker', 'run', '--name', name, '--rm', '-i', '--network', 'none', '--read-only', '--user', '0',
                   '--cap-drop', 'ALL', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'CHOWN', '--cap-add', 'FOWNER',
                   '--security-opt', 'no-new-privileges:true', '--pids-limit', '64', '--memory', '128m', '--memory-swap', '128m', '--cpus', '0.25',
                   '--label', kernel.OWNER + '=' + self.fingerprint, '--mount', 'type=volume,src=' + volume + ',dst=/data' + ('' if restoring else ',readonly'),
                   ARCHIVE_IMAGE, 'tar', '-C', '/data', '-xpf' if restoring else '-cpf', '-'] + ([] if restoring else ['.'])
        def bounds():
            resource.setrlimit(resource.RLIMIT_FSIZE, (limit, limit))
        try:
            with archive.open('rb' if restoring else 'xb') as stream:
                if not restoring:
                    os.chmod(archive, 0o600)
                result = subprocess.run(command, stdin=stream if restoring else subprocess.DEVNULL,
                                        stdout=subprocess.DEVNULL if restoring else stream, stderr=subprocess.DEVNULL,
                                        env=self.env, timeout=900, preexec_fn=bounds if limit else None)
                kernel.require(result.returncode == 0, 'Archive operation failed')
                if not restoring:
                    stream.flush()
                    os.fsync(stream.fileno())
        finally:
            if self.owner('container', name, missing=True) is not None:
                self.run(['docker', 'rm', '-f', name])


def backup(job, workspace, destination):
    kernel.validate(job)
    kernel.require(bool(job['volumes']), 'No persistent volumes declared')
    destination = Path(destination)
    kernel.require(not destination.exists() and not destination.is_symlink(), 'New snapshot directory required')
    with locked(workspace) as root:
        directory = private_directory(root / job['instanceId'])
        journal = directory / 'installation.json'
        private_file(journal)
        state = json.loads(journal.read_text())
        kernel.require(state['fingerprint'] == digest(job) and state['phase'] == 'runtime_ready', 'Ready matching installation required')
        rt = Runtime(job, directory)
        containers = rt.containers()
        kernel.require(len(containers) == len(job['services']), 'Exactly one container per service required')
        names = []
        for container in containers:
            name = rt.run(['docker', 'inspect', '-f', '{{index .Config.Labels "com.docker.compose.service"}}', container]).strip()
            kernel.require(name in job['compose']['services'] and name not in names, 'Unexpected service')
            kernel.require(rt.run(['docker', 'inspect', '-f', '{{.State.Running}}', container]).strip() == 'true', 'All services must be running before backup')
            names.append(name)
        for name in job['volumes']:
            volume = job['project'] + '_' + name
            rt.owner('volume', volume)
            attached = rt.run(['docker', 'ps', '-aq', '--filter', 'volume=' + volume]).split()
            kernel.require(set(attached) <= set(containers), 'Volume shared outside owned instance')
        rt.run(['docker', 'pull', ARCHIVE_IMAGE], timeout=120)
        destination.mkdir(mode=0o700)
        private_directory(destination)
        status = directory / 'snapshot-status.json'
        kernel.private_json(status, {'phase': 'stopping', 'snapshot': destination.name})
        archives = []
        try:
            rt.compose(['stop', '-t', '45'])
            kernel.require(all(rt.run(['docker', 'inspect', '-f', '{{.State.Running}}', c]).strip() == 'false' for c in containers), 'Writers did not stop')
            kernel.private_json(status, {'phase': 'copying', 'snapshot': destination.name})
            remaining = job['resources']['diskMb'] * 1024 * 1024
            for index, name in enumerate(job['volumes']):
                kernel.require(remaining > 0, 'Snapshot exceeds disk budget')
                path = destination / f'volume-{index}.tar'
                rt.helper(job['project'] + '_' + name, path, limit=remaining)
                remaining -= path.stat().st_size
                archives.append({'volume': name, 'file': path.name, 'size': path.stat().st_size, 'sha256': sha_file(path)})
        finally:
            # start preserves original configuration and cannot recreate a container.
            try:
                rt.compose(['start', *names])
                kernel.require(all(rt.run(['docker', 'inspect', '-f', '{{.State.Running}}', c]).strip() == 'true' for c in containers), 'Source restart failed')
                kernel.private_json(status, {'phase': 'source_restarted', 'snapshot': destination.name})
            except Exception:
                kernel.private_json(status, {'phase': 'restart_failed', 'snapshot': destination.name})
                raise
        manifest = {'protocol': PROTOCOL, 'snapshotId': str(uuid.uuid4()), 'sourceInstanceId': job['instanceId'],
                    'releaseId': job['releaseId'], 'releaseDigest': job['releaseDigest'], 'configurationDigest': configuration_digest(job),
                    'archiveImage': ARCHIVE_IMAGE, 'completed': state['completed'], 'archives': archives}
        kernel.private_json(destination / 'snapshot.json', manifest)
        return {'protocol': PROTOCOL, 'snapshotId': manifest['snapshotId'], 'manifestSha256': sha_file(destination / 'snapshot.json'), 'volumeCount': len(archives)}


def restore(job, workspace, snapshot, expected_manifest):
    kernel.validate(job)
    kernel.require(re.fullmatch(r'[a-f0-9]{64}', expected_manifest or ''), 'Trusted manifest digest required')
    snapshot = private_directory(snapshot)
    private_file(snapshot / 'snapshot.json')
    kernel.require(sha_file(snapshot / 'snapshot.json') == expected_manifest, 'Snapshot manifest mismatch')
    manifest = json.loads((snapshot / 'snapshot.json').read_text())
    kernel.require(manifest['protocol'] == PROTOCOL and manifest['archiveImage'] == ARCHIVE_IMAGE, 'Unsupported snapshot')
    uuid.UUID(manifest['snapshotId'])
    kernel.require(manifest['sourceInstanceId'] != job['instanceId'], 'Restore must use a new instance identity')
    kernel.require(manifest['releaseId'] == job['releaseId'] and manifest['releaseDigest'] == job['releaseDigest'] and manifest['configurationDigest'] == configuration_digest(job), 'Snapshot release or configuration mismatch')
    kernel.require([a['volume'] for a in manifest['archives']] == job['volumes'], 'Volume coverage mismatch')
    completed = [f'{phase}:{index}' for phase in ('migrate', 'initialize') for index in range(len(job['lifecycle'][phase]))]
    kernel.require(manifest['completed'] == completed, 'Snapshot lifecycle incomplete')
    total = 0
    for index, archive in enumerate(manifest['archives']):
        kernel.require(archive['file'] == f'volume-{index}.tar', 'Invalid archive path')
        path = snapshot / archive['file']
        private_file(path)
        total += path.stat().st_size
        kernel.require(path.stat().st_size == archive['size'] and sha_file(path) == archive['sha256'], 'Archive integrity mismatch')
    kernel.require(total <= job['resources']['diskMb'] * 1024 * 1024, 'Snapshot exceeds disk budget')
    expanded = 0
    for archive in manifest['archives']:
        with tarfile.open(snapshot / archive['file'], 'r:') as stream:
            for entry in stream:
                parts = Path(entry.name).parts
                kernel.require(not entry.name.startswith('/') and '..' not in parts, 'Archive path escape refused')
                kernel.require(entry.isfile() or entry.isdir() or entry.issym() or entry.islnk(), 'Special archive entry refused')
                if entry.issym() or entry.islnk():
                    kernel.require(not entry.linkname.startswith('/') and '..' not in Path(entry.linkname).parts, 'Archive link escape refused')
                expanded += entry.size
                kernel.require(expanded <= job['resources']['diskMb'] * 1024 * 1024, 'Expanded snapshot exceeds budget')
    with locked(workspace) as root:
        directory = root / job['instanceId']
        kernel.require(not directory.exists() and not directory.is_symlink(), 'Restore target must be new; interrupted restores require a fresh target')
        directory.mkdir(mode=0o700)
        rt = Runtime(job, directory)
        kernel.require(not rt.containers(), 'Existing target containers refused')
        for name in job['volumes']:
            kernel.require(rt.owner('volume', job['project'] + '_' + name, missing=True) is None, 'Existing target volume refused')
        for name in set(job['compose'].get('networks', {})) | {'default'}:
            kernel.require(rt.owner('network', job['project'] + '_' + name, missing=True) is None, 'Existing target network refused')
        rt.run(['docker', 'pull', ARCHIVE_IMAGE], timeout=120)
        kernel.private_json(directory / 'restore-status.json', {'phase': 'restoring', 'fingerprint': rt.fingerprint, 'snapshotId': manifest['snapshotId'], 'manifestSha256': expected_manifest})
        for archive in manifest['archives']:
            volume = job['project'] + '_' + archive['volume']
            rt.run(['docker', 'volume', 'create', '--label', kernel.OWNER + '=' + rt.fingerprint,
                    '--label', 'com.docker.compose.project=' + job['project'], '--label', 'com.docker.compose.volume=' + archive['volume'], volume])
            rt.helper(volume, snapshot / archive['file'], restoring=True)
        kernel.private_json(directory / 'installation.json', {'protocol': kernel.PROTOCOL, 'runnerVersion': kernel.RUNNER_VERSION,
            'instanceId': job['instanceId'], 'releaseId': job['releaseId'], 'releaseDigest': job['releaseDigest'], 'project': job['project'],
            'fingerprint': rt.fingerprint, 'phase': 'restored', 'completed': completed, 'snapshotManifestSha256': expected_manifest})
        kernel.private_json(directory / 'restore-status.json', {'phase': 'restored_not_started', 'fingerprint': rt.fingerprint, 'snapshotId': manifest['snapshotId'], 'manifestSha256': expected_manifest})
        return {'protocol': PROTOCOL, 'instanceId': job['instanceId'], 'snapshotId': manifest['snapshotId'], 'phase': 'restored_not_started'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['backup', 'restore'])
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--manifest-sha256')
    args = parser.parse_args()
    def interrupted(_signal, _frame):
        raise RuntimeError('Snapshot interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        raw = sys.stdin.buffer.read(1024 * 1024 + 1)
        kernel.require(len(raw) <= 1024 * 1024, 'Job exceeds size limit')
        job = json.loads(raw)
        result = backup(job, args.workspace, args.snapshot) if args.operation == 'backup' else restore(job, args.workspace, args.snapshot, args.manifest_sha256)
        print(json.dumps(result))
    except Exception:
        print(json.dumps({'error': 'Snapshot operation rejected or failed; inspect private status'}), file=sys.stderr)
        sys.exit(1)
