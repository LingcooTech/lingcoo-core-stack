#!/usr/bin/env python3
"""Restore cold snapshots into quarantined volumes. Never starts a customer application."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import uuid

from hosting_adapter import project_name, resolve_adapter

LABEL = 'com.lingcoo.recovery'
DIGEST = re.compile(r'[a-f0-9]{64}')


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def private_directory(path):
    if not path.is_absolute() or any(p.is_symlink() for p in [path, *path.parents]):
        raise ValueError('Absolute non-symlink recovery directory required')
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not path.is_dir() or path.stat().st_mode & 0o077:
        raise ValueError('Private recovery directory required')


def store(path, value):
    if path.is_symlink():
        raise ValueError('Symlink state refused')
    fd, temporary = tempfile.mkstemp(dir=path.parent)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def canonical(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or '\\' in name or '\x00' in name:
        raise ValueError('Unsafe snapshot path')
    return str(path)


def validate_plan(plan, config):
    expected = {'id', 'deploymentId', 'sourceOperationId', 'targetNodeId', 'manifestSha256', 'maxBytes'}
    if set(plan) != expected:
        raise ValueError('Unexpected recovery plan fields')
    for key in ['id', 'deploymentId', 'sourceOperationId', 'targetNodeId']:
        if str(uuid.UUID(plan[key])) != plan[key]:
            raise ValueError('Canonical UUID required')
    if plan['targetNodeId'] != config['nodeId'] or not DIGEST.fullmatch(plan['manifestSha256']):
        raise ValueError('Recovery binding mismatch')
    if type(plan['maxBytes']) is not int or not 1 <= plan['maxBytes'] <= 1024**4:
        raise ValueError('Invalid recovery capacity limit')


def checksum_entries(data):
    entries = {}
    if len(data) > 256 * 1024:
        raise ValueError('Oversized checksum manifest')
    for line in data.decode('utf-8').splitlines():
        match = re.fullmatch(r'([a-f0-9]{64})  (.+)', line)
        if not match:
            raise ValueError('Invalid checksum line')
        name = canonical(match[2])
        if name != match[2] or name in entries or name in ('.', 'SHA256SUMS'):
            raise ValueError('Ambiguous checksum path')
        entries[name] = match[1]
    if not entries:
        raise ValueError('Empty checksum manifest')
    return entries


def inventory(path, limit):
    """No devices/FIFOs, traversal, escaping links or extraction through a link."""
    result = {}
    expanded = 0
    with tarfile.open(path, 'r:') as archive:
        for index, member in enumerate(archive):
            if index >= 250000:
                raise ValueError('Too many archive entries')
            name = canonical(member.name)
            if name == '.':
                if not member.isdir():
                    raise ValueError('Invalid archive root')
            if name in result or not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
                raise ValueError('Unsupported archive entry')
            entry = {'uid': member.uid, 'gid': member.gid, 'mode': member.mode,
                     'type': 'file' if member.isfile() else 'dir' if member.isdir() else 'symlink' if member.issym() else 'hardlink'}
            if member.mode & 0o6000:
                raise ValueError('Set-ID archive entry refused')
            if member.isfile():
                expanded += member.size
                if expanded > limit:
                    raise ValueError('Expanded archive exceeds capacity')
                value = hashlib.sha256()
                stream = archive.extractfile(member)
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    value.update(chunk)
                entry.update(size=member.size, sha256=value.hexdigest())
            elif member.issym() or member.islnk():
                # Conservative: only relative links without parent traversal are supported.
                target = canonical(member.linkname)
                entry['target'] = target
            result[name] = entry
    for name, entry in result.items():
        for parent in PurePosixPath(name).parents:
            if str(parent) in result and result[str(parent)]['type'] != 'dir':
                raise ValueError('Archive extracts through a non-directory')
        if entry['type'] == 'hardlink':
            target = result.get(entry['target'])
            if not target or target['type'] != 'file':
                raise ValueError('Hardlink target must be a regular file')
    return result, expanded


def normalized_inventory(entries):
    # tar may select a different first name for the same hard-linked inode.
    result = {}
    for name, entry in entries.items():
        if entry['type'] == 'hardlink':
            target = entries[entry['target']]
            entry = {**entry, 'type': 'file', 'size': target['size'], 'sha256': target['sha256']}
            entry.pop('target')
        result[name] = entry
    return result


def inspect_backup(config, plan, backup):
    validate_plan(plan, config)
    if not backup.is_absolute() or any(p.is_symlink() for p in [backup, *backup.parents]):
        raise ValueError('Unsafe backup directory')
    checksum = backup / 'SHA256SUMS'
    if checksum.is_symlink() or not checksum.is_file() or checksum.stat().st_size > 256 * 1024 or digest(checksum) != plan['manifestSha256']:
        raise ValueError('Snapshot trust anchor mismatch')
    entries = checksum_entries(checksum.read_bytes())
    total = 0
    for name, expected in entries.items():
        path = backup / name
        if any(p.is_symlink() for p in [path, *path.parents]) or not path.is_file():
            raise ValueError('Missing or symlink snapshot artifact')
        total += path.stat().st_size
        if not name.endswith('.tar') and path.stat().st_size > 1024 * 1024:
            raise ValueError('Oversized snapshot metadata')
        if total > plan['maxBytes'] or digest(path) != expected:
            raise ValueError('Snapshot size or checksum mismatch')
    manifest = json.loads((backup / 'manifest.json').read_text())
    execution = json.loads((backup / 'execution.json').read_text())
    descriptor = resolve_adapter(config, manifest['appCode'], verify=True)
    expected_files = {'.env', 'limits.json', 'execution.json', 'manifest.json', *descriptor['files'],
                      *(v + '.tar' for v in descriptor['volumes'])}
    if set(entries) != expected_files:
        raise ValueError('Snapshot file inventory mismatch')
    project = project_name(descriptor, plan['deploymentId'])
    if (manifest['format'] != 'lingcoo-cold-volumes-v1' or manifest['deploymentId'] != plan['deploymentId']
            or manifest['operationId'] != plan['sourceOperationId'] or manifest['project'] != project
            or manifest['volumes'] != descriptor['volumes'] or execution['project'] != project
            or execution['appCode'] != manifest['appCode'] or execution['phase'] != 'retiring'
            or execution.get('exitOperation') != plan['sourceOperationId']):
        raise ValueError('Snapshot identity mismatch')
    stopped = datetime.datetime.fromisoformat(manifest['stoppedAt'])
    if stopped.tzinfo is None or stopped > datetime.datetime.now(datetime.timezone.utc):
        raise ValueError('Invalid cold snapshot timestamp')
    for name in descriptor['files']:
        if entries[name] != descriptor['hashes'][name]:
            raise ValueError('Target adapter differs from snapshot')
    if set(manifest['images']) != set(descriptor['weights']):
        raise ValueError('Snapshot service inventory mismatch')
    for image in manifest['images'].values():
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', image['id']) or not image['digests'] or any(not re.fullmatch(r'[^\s]+@sha256:[a-f0-9]{64}', item) for item in image['digests']):
            raise ValueError('Snapshot has no immutable image reference')
    inventories = {}
    expanded = 0
    for volume in descriptor['volumes']:
        entries_for_volume, size = inventory(backup / (volume + '.tar'), plan['maxBytes'] - expanded)
        inventories[volume] = entries_for_volume
        expanded += size
    return manifest, inventories, total, expanded


def docker(args, **kwargs):
    return subprocess.check_output(['docker', *args], stderr=subprocess.DEVNULL, timeout=1800, **kwargs)


def volume_name(plan, name):
    return 'lc-recovery-' + plan['id'].replace('-', '') + '_' + name


def volume_exists(name):
    return name in docker(['volume', 'ls', '-q'], text=True).splitlines()


def owned_volume(name, plan):
    meta = json.loads(docker(['volume', 'inspect', name]))[0]
    labels = meta.get('Labels') or {}
    if labels.get(LABEL) != plan['id'] or labels.get(LABEL + '.deployment') != plan['deploymentId'] or labels.get(LABEL + '.target') != plan['targetNodeId']:
        raise ValueError('Foreign recovery volume')
    if docker(['ps', '-aq', '--filter', 'volume=' + name]).strip():
        raise ValueError('Recovery volume is in use')


def restore(config, plan, backup, root):
    validate_plan(plan, config)
    private_directory(root)
    if (root / '.lock').is_symlink():
        raise ValueError('Symlink recovery lock')
    with (root / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return restore_locked(config, plan, backup, root)


def restore_locked(config, plan, backup, root):
    started = time.monotonic()
    manifest, inventories, archived, expanded = inspect_backup(config, plan, backup)
    image = config.get('snapshotImage', '')
    if not re.fullmatch(r'[^\s]+@sha256:[a-f0-9]{64}', image):
        raise ValueError('Pinned restore helper required')
    docker(['image', 'inspect', image])
    # Restoring a volume never fetches/runs customer images, but verifies all are available unchanged.
    for source in manifest['images'].values():
        if not any(json.loads(docker(['image', 'inspect', item]))[0]['Id'] == source['id'] for item in source['digests']):
            raise ValueError('Target image differs from snapshot')
    directory = root / plan['id']
    private_directory(directory)
    record = directory / 'recovery.json'
    if record.is_symlink():
        raise ValueError('Symlink recovery record')
    state = json.loads(record.read_text()) if record.exists() else None
    if state and state['plan'] != plan:
        raise ValueError('Frozen recovery plan changed')
    if state and state['phase'] == 'cleaned':
        raise ValueError('Recovery already cleaned; use a new recovery ID')
    if state and state['phase'] != 'verified':
        raise ValueError('Incomplete recovery requires explicit cleanup and a new recovery ID')
    names = {v: volume_name(plan, v) for v in inventories}
    if state:
        for name in names.values():
            owned_volume(name, plan)
    else:
        if any(volume_exists(name) for name in names.values()):
            raise ValueError('Recovery volume already exists')
        docker_root = json.loads(docker(['info', '--format', '{{json .DockerRootDir}}']))
        # Budget includes archive verification scratch space and volume filesystem overhead.
        needed = 2 * max(archived, expanded) + 256 * 1024**2
        if min(shutil.disk_usage(root).free, shutil.disk_usage(docker_root).free) < needed:
            raise ValueError('Insufficient recovery disk headroom')
        state = {'plan': plan, 'phase': 'restoring', 'volumes': names}
        store(record, state)
    helper = ['run', '--rm', '--network', 'none', '--read-only', '--memory', '128m', '--cpus', '0.5',
              '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', '--cap-add', 'CHOWN',
              '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'FOWNER', '--user', '0:0']
    for volume, name in names.items():
        if state['phase'] == 'restoring':
            docker(['volume', 'create', '--label', LABEL + '=' + plan['id'], '--label', LABEL + '.deployment=' + plan['deploymentId'], '--label', LABEL + '.target=' + plan['targetNodeId'], name])
            with (backup / (volume + '.tar')).open('rb') as stream:
                docker(helper + ['-i', '-v', name + ':/restore', '--entrypoint', 'tar', image, '-C', '/restore', '-xpf', '-'], stdin=stream)
        owned_volume(name, plan)
        fd, temporary = tempfile.mkstemp(dir=directory, suffix='.tar')
        try:
            with os.fdopen(fd, 'wb') as stream:
                subprocess.run(['docker', *helper, '-v', name + ':/restore:ro', '--entrypoint', 'tar', image, '-C', '/restore', '-cpf', '-', '.'], stdout=stream, stderr=subprocess.DEVNULL, check=True, timeout=1800)
            actual, _ = inventory(Path(temporary), plan['maxBytes'])
            if normalized_inventory(actual) != normalized_inventory(inventories[volume]):
                raise ValueError('Restored volume content or metadata differs')
        finally:
            Path(temporary).unlink(missing_ok=True)
    if state['phase'] == 'verified':
        return state['evidence']
    evidence = {'recoveryId': plan['id'], 'deploymentId': plan['deploymentId'], 'targetNodeId': plan['targetNodeId'],
                'manifestSha256': plan['manifestSha256'], 'snapshotStoppedAt': manifest['stoppedAt'],
                'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'durationSeconds': round(time.monotonic() - started, 3), 'archivedBytes': archived,
                'expandedBytes': expanded, 'volumes': names, 'applicationStarted': False, 'trafficChanged': False}
    store(record, {**state, 'phase': 'verified', 'evidence': evidence})
    return evidence


def cleanup(plan, config, root):
    validate_plan(plan, config)
    private_directory(root)
    if (root / '.lock').is_symlink():
        raise ValueError('Symlink recovery lock')
    with (root / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        directory = root / plan['id']
        private_directory(directory)
        path = directory / 'recovery.json'
        if path.is_symlink():
            raise ValueError('Symlink recovery record')
        state = json.loads(path.read_text())
        if state['plan'] != plan:
            raise ValueError('Frozen recovery plan changed')
        names = state['volumes']
        if any(name != volume_name(plan, key) for key, name in names.items()):
            raise ValueError('Recovery journal volume mismatch')
        # Preflight all references before any removal. A partial deletion is retryable.
        for name in names.values():
            if volume_exists(name):
                owned_volume(name, plan)
        for name in names.values():
            if volume_exists(name):
                docker(['volume', 'rm', name])
        store(path, {**state, 'phase': 'cleaned', 'cleanedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
        return {'recoveryId': plan['id'], 'cleaned': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['inspect', 'restore', 'cleanup'])
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--backup', type=Path)
    parser.add_argument('--root', type=Path, required=True)
    args = parser.parse_args()
    for path in (args.config, args.plan):
        if path.is_symlink() or path.stat().st_mode & 0o077:
            raise ValueError('Private config and plan required')
    config = json.loads(args.config.read_text())
    plan = json.loads(args.plan.read_text())
    if args.action == 'cleanup':
        result = cleanup(plan, config, args.root)
    elif args.action == 'restore':
        result = restore(config, plan, args.backup, args.root)
    else:
        _, _, archived, expanded = inspect_backup(config, plan, args.backup)
        result = {'verified': True, 'archivedBytes': archived, 'expandedBytes': expanded}
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No artifact content, credentials, raw provider or Docker output in public logs.
        print('Recovery failed: ' + type(error).__name__, file=__import__('sys').stderr)
        raise SystemExit(1)
