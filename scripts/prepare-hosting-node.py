#!/usr/bin/env python3
"""Inspect a Linux node or enroll its monitoring agent using an operator-reviewed checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import urllib.parse
import uuid


NODE_DIRECTORY = Path('/opt/lingcoo-hosting')

def inspect():
    checks = {'linux': platform.system() == 'Linux', 'python': True}
    for name, argv in {'docker': ['docker', 'info'], 'compose': ['docker', 'compose', 'version'], 'systemd': ['systemctl', 'show-environment']}.items():
        try:
            checks[name] = subprocess.run(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20).returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            checks[name] = False
    if not checks['compose']:
        try:
            checks['compose'] = subprocess.run(['docker-compose', 'version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20).returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            pass
    return checks


def validate_config(path):
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError('Node enrollment file must be private (chmod 600), not a symlink')
    c = json.loads(path.read_text())
    if set(c) != {'stackUrl', 'nodeId', 'reportToken'}:
        raise ValueError('Enrollment accepts stackUrl, nodeId and reportToken only')
    u = urllib.parse.urlsplit(c['stackUrl'])
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('', '/'):
        raise ValueError('A public HTTPS Stack base URL is required')
    if str(uuid.UUID(c['nodeId'])) != c['nodeId'] or not isinstance(c['reportToken'], str) or not 32 <= len(c['reportToken']) <= 256:
        raise ValueError('Invalid enrollment identity')
    return c


def install(config_path):
    c = validate_config(config_path)
    if os.geteuid() != 0 or not all(inspect().values()):
        raise ValueError('Root, Linux, running Docker, Compose and systemd are required; run --check')
    target = NODE_DIRECTORY
    # Existing nodes use the separate reviewed update workflow; never overwrite credentials or instances.
    if target.exists() or target.is_symlink():
        raise ValueError('Existing node directory: use the node update workflow')
    source = Path(__file__).resolve().parent
    files = list(source.glob('hosting*.py')) + [source / 'compose-install.py', source / 'install-hosting-node-service.sh']
    for file in files:
        if file.suffix == '.py':
            compile(file.read_bytes(), str(file), 'exec')
    target.mkdir(mode=0o700)
    for file in files:
        shutil.copyfile(file, target / file.name)
        (target / file.name).chmod(0o600)
    workspace = target / 'instances'
    workspace.mkdir(mode=0o700)
    c.update(workspace=str(workspace), dataPath=str(workspace), monitorOnly=True,
             adapters={}, composeRunnerSha256=hashlib.sha256((target / 'compose-install.py').read_bytes()).hexdigest())
    fd, temporary = tempfile.mkstemp(dir=target, prefix='.node-')
    with os.fdopen(fd, 'w') as stream:
        json.dump(c, stream)
    os.replace(temporary, target / 'node.json')
    subprocess.run(['sh', str(target / 'install-hosting-node-service.sh')], env={**os.environ,
        'HOSTING_AGENT_DIR': str(target), 'HOSTING_NODE_CONFIG': str(target / 'node.json')}, check=True)
    subprocess.run(['systemctl', 'start', 'lingcoo-hosting.service'], check=True)
    print(json.dumps({'installed': True, 'monitorOnly': True, 'allocationEnabled': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--install', type=Path, metavar='PRIVATE_ENROLLMENT_JSON')
    args = parser.parse_args()
    try:
        if args.check:
            checks = inspect()
            print(json.dumps({'checks': checks, 'ready': all(checks.values())}))
            raise SystemExit(0 if all(checks.values()) else 1)
        install(args.install)
    except Exception as error:
        # Do not echo configuration, credentials or subprocess output.
        detail = str(error) if type(error) is ValueError else type(error).__name__
        print('Node preparation failed: ' + detail, file=__import__('sys').stderr)
        raise SystemExit(1)
