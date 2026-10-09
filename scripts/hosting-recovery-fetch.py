#!/usr/bin/env python3
"""Fetch one explicitly pinned encrypted snapshot without executing its contents."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import subprocess
import time

spec = importlib.util.spec_from_file_location('recover', Path(__file__).with_name('hosting-node-recover.py'))
recover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recover)


def fetch(config, plan, snapshot_id, source, destination):
    recover.validate_plan(plan, config)
    if not re.fullmatch(r'[a-f0-9]{64}', snapshot_id):
        raise ValueError('Full immutable Restic snapshot ID required')
    expected = plan['deploymentId'] + '-exit-' + plan['sourceOperationId']
    if not source.startswith('/') or '..' in Path(source).parts or Path(source).name != expected or str(Path(source)) != source:
        raise ValueError('Exact cold backup path required')
    recover.private_directory(destination.parent)
    if shutil.disk_usage(destination.parent).free < plan['maxBytes'] + 256 * 1024**2:
        raise ValueError('Insufficient download disk headroom')
    if destination.exists() or destination.is_symlink():
        raise ValueError('Download destination must be new')
    options = config['offsite']
    password = Path(options['passwordFile'])
    if password.is_symlink() or password.stat().st_mode & 0o077:
        raise ValueError('Private Restic password required')
    env = {**os.environ, 'RESTIC_REPOSITORY': options['repository'], 'RESTIC_PASSWORD_FILE': str(password), 'GOMEMLIMIT': '256MiB', 'GOGC': '50'}
    command = [options['binary'], '--no-cache', '-o', 'sftp.command=' + options['sftpCommand']]
    records = json.loads(subprocess.check_output(command + ['snapshots', '--json', snapshot_id], env=env, stderr=subprocess.DEVNULL, timeout=60))
    if len(records) != 1 or records[0]['id'] != snapshot_id or records[0]['paths'] != [source] or 'deployment:' + plan['deploymentId'] not in records[0].get('tags', []):
        raise ValueError('Snapshot identity or ownership mismatch')
    destination.mkdir(mode=0o700)
    started = time.monotonic()
    total = 0

    def download(name, budget):
        path = destination / name
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        process = subprocess.Popen(command + ['dump', snapshot_id, source + '/' + name], env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
        count = 0
        try:
            with os.fdopen(fd, 'wb') as stream, selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while True:
                    if time.monotonic() - started > 1800:
                        raise ValueError('Snapshot download deadline exceeded')
                    if not selector.select(timeout=1):
                        continue
                    chunk = os.read(process.stdout.fileno(), 1024 * 1024)
                    if not chunk:
                        break
                    count += len(chunk)
                    if count > budget:
                        raise ValueError('Snapshot download exceeds capacity')
                    stream.write(chunk)
                stream.flush()
                os.fsync(stream.fileno())
            if process.wait(timeout=10):
                raise ValueError('Snapshot artifact download failed')
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()
        return count

    download('SHA256SUMS', 256 * 1024)
    checksum = destination / 'SHA256SUMS'
    if recover.digest(checksum) != plan['manifestSha256']:
        raise ValueError('Downloaded snapshot trust anchor mismatch')
    entries = recover.checksum_entries(checksum.read_bytes())
    for name, expected_digest in entries.items():
        total += download(name, min(plan['maxBytes'] - total, plan['maxBytes'] if name.endswith('.tar') else 1024 * 1024))
        if recover.digest(destination / name) != expected_digest:
            raise ValueError('Downloaded artifact checksum mismatch')
    recover.inspect_backup(config, plan, destination)
    evidence = {'snapshotId': snapshot_id, 'deploymentId': plan['deploymentId'], 'recoveryId': plan['id'],
                'manifestSha256': plan['manifestSha256'], 'downloadedBytes': total,
                'durationSeconds': round(time.monotonic() - started, 3)}
    # Kept alongside the download: not an additional untrusted backup artifact.
    recover.store(destination.with_name(destination.name + '-source.json'), evidence)
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    for path in (args.config, args.plan):
        if path.is_symlink() or path.stat().st_mode & 0o077:
            raise ValueError('Private input required')
    print(json.dumps(fetch(json.loads(args.config.read_text()), json.loads(args.plan.read_text()), args.snapshot, args.source, args.destination)))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Recovery download failed: ' + type(error).__name__, file=__import__('sys').stderr)
        raise SystemExit(1)
