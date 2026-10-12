#!/usr/bin/env python3
"""Install an operator-staged, checksummed platform agent update under the node lock."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time

FILES = {'compose-install.py', 'hosting_compose.py', 'hosting-node-agent.py',
         'hosting-node-backup.py', 'hosting-node-ingress.py', 'hosting-node-report.py'}


def atomic(path, content):
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def upgrade(config_path, staging):
    config_path, staging = Path(config_path), Path(staging)
    if config_path.is_symlink() or config_path.stat().st_mode & 0o077 or config_path.stat().st_uid != os.geteuid():
        raise ValueError('Private non-symlink node configuration required')
    original_config = config_path.read_bytes()
    config = json.loads(original_config)
    directory = config_path.parent.resolve()
    if directory.stat().st_mode & 0o022 or directory.stat().st_uid != os.geteuid():
        raise ValueError('Trusted agent directory required')
    workspace = Path(config['workspace'])
    if not workspace.is_absolute() or workspace.is_symlink() or not workspace.is_dir():
        raise ValueError('Existing private workspace required')
    if workspace.stat().st_mode & 0o022 or workspace.stat().st_uid != os.geteuid():
        raise ValueError('Trusted workspace required')
    manifest = json.loads((staging / 'checksums.json').read_text())
    if set(manifest) != FILES:
        raise ValueError('Unexpected platform update file set')
    updates = {}
    for name in sorted(FILES):
        source, target = staging / name, directory / name
        if source.is_symlink() or target.is_symlink():
            raise ValueError('Symlink update refused')
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != manifest[name]:
            raise ValueError('Platform update checksum mismatch')
        compile(data, name, 'exec')
        updates[name] = data
    lock_fd = os.open(workspace / '.agent.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if config_path.read_bytes() != original_config:
            raise ValueError('Node configuration changed; retry')
        backup = Path(tempfile.mkdtemp(prefix='compose-update-' + str(int(time.time())) + '-', dir=directory))
        previous = {name: (directory / name).read_bytes() if (directory / name).exists() else None for name in FILES}
        atomic(backup / 'node.json', original_config)
        for name, content in previous.items():
            if content is not None:
                atomic(backup / name, content)
        try:
            for name, content in updates.items():
                atomic(directory / name, content)
            config['composeRunnerSha256'] = manifest['compose-install.py']
            atomic(config_path, json.dumps(config).encode())
            # Remove only Python bytecode for replaced platform modules, not customer data.
            for cache in (directory / '__pycache__').glob('*.pyc'):
                if cache.name.split('.')[0] + '.py' in FILES:
                    cache.unlink()
        except Exception:
            for name, content in previous.items():
                if content is None:
                    (directory / name).unlink(missing_ok=True)
                else:
                    atomic(directory / name, content)
            atomic(config_path, original_config)
            raise
        return {'installed': sorted(FILES), 'runnerSha256': config['composeRunnerSha256'], 'monitorOnly': config.get('monitorOnly', True)}
    finally:
        os.close(lock_fd)


if __name__ == '__main__':
    try:
        print(json.dumps(upgrade(sys.argv[1], sys.argv[2])))
    except Exception as error:
        print('Platform agent update refused: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
