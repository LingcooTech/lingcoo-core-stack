#!/usr/bin/env python3
"""Private daily backups of owned managed Retail projects; shares the deployment lock."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid


def main():
    config_path = Path(sys.argv[1])
    if config_path.stat().st_mode & 0o077:
        raise ValueError('Private node config required')
    config = json.loads(config_path.read_text())
    workspace = Path(config['workspace'])
    root = Path(config['backupRoot'])
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    with (workspace / '.agent.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for journal in workspace.glob('*/execution.json'):
            deployment_id = str(uuid.UUID(journal.parent.name))
            if json.loads(journal.read_text())['phase'] != 'runtime_ready':
                continue
            project = 'retail-' + deployment_id.replace('-', '')
            ids = subprocess.check_output(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=' + project, '--filter', 'label=com.docker.compose.service=api'], text=True).strip()
            if not ids:
                continue
            backup = root / (deployment_id + '-' + stamp)
            subprocess.run(['sh', str(Path(config['retailBundle']) / 'deploy/scripts/backup.sh'), str(journal.parent), project, str(backup)], check=True, timeout=900)
            # Preserve hosting-specific limits and execution ownership alongside the application backup.
            for name in ('limits.json', 'execution.json'):
                shutil.copyfile(journal.parent / name, backup / name)
                os.chmod(backup / name, 0o600)
                with (backup / 'SHA256SUMS').open('a') as stream:
                    stream.write(hashlib.sha256((backup / name).read_bytes()).hexdigest() + '  ' + name + '\n')
            (backup / 'HOSTING_COMPLETE').touch(mode=0o600)
            print('Verified backup created for ' + deployment_id)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Hosting backup failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
