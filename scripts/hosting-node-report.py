#!/usr/bin/env python3
"""Run on a Linux hosting node once per minute; only reports measurements, never deploys."""
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import urllib.parse
import urllib.request


def collect(data_path):
    mem = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        mem[key] = int(value.strip().split()[0])
    try:
        docker = subprocess.run(['docker', 'info', '--format', '{{.DockerRootDir}}'], capture_output=True, text=True, timeout=15, check=True)
        compose = subprocess.run(['docker', 'compose', 'version'], capture_output=True, timeout=15)
        if compose.returncode:
            compose = subprocess.run(['docker-compose', 'version'], capture_output=True, timeout=15)
        ready = compose.returncode == 0
        docker_path = docker.stdout.strip()
        free_disk = min(shutil.disk_usage(data_path).free, shutil.disk_usage(docker_path).free)
    except (OSError, subprocess.SubprocessError):
        ready = False
        free_disk = 0
    return {'dockerReady': ready, 'available': {
        'cpuMillis': max(0, int(((os.cpu_count() or 1) - os.getloadavg()[0]) * 1000)),
        'memoryMb': mem.get('MemAvailable', 0) // 1024,
        'diskMb': free_disk // (1024 * 1024),
    }}


def main():
    config_path = Path(sys.argv[1])
    if stat.S_IMODE(config_path.stat().st_mode) & 0o077:
        raise ValueError('Probe config must be private: chmod 600')
    config = json.loads(config_path.read_text())
    base = urllib.parse.urlparse(config['stackUrl'])
    if base.scheme != 'https' or not base.hostname or base.username or base.password or base.query or base.fragment or base.path not in ('', '/'):
        raise ValueError('stackUrl must be a public HTTPS base URL')
    node_id = config['nodeId']
    import uuid
    uuid.UUID(node_id)
    payload = collect(config.get('dataPath', '/opt/lingcoo'))
    url = config['stackUrl'].rstrip('/') + '/v1/hosting/nodes/' + node_id + '/report'
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={
        'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config['reportToken'],
    }, method='POST')
    # Never follow redirects while holding a node credential.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError('Report rejected')
    print('Hosting node report accepted')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Hosting node report failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
