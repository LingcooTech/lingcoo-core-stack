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
from hosting_adapter import resolve_adapter
from hosting_upgrade import catalog,runtime_images


def memory_mb(value):
    import re
    match = re.fullmatch(r'([0-9.]+)([KMGT]?i?B)', value.strip())
    if not match:
        return 0
    units = {'B':1, 'kB':1000, 'KB':1000, 'KiB':1024, 'MB':1000000, 'MiB':1048576, 'GB':1000000000, 'GiB':1073741824, 'TB':1000000000000, 'TiB':1099511627776}
    return round(float(match[1]) * units.get(match[2], 1) / 1048576, 2)


def inventory():
    ids = subprocess.check_output(['docker', 'ps', '-aq'], text=True, timeout=15).split()
    if not ids:
        return []
    if len(ids) > 1000:
        raise ValueError('Inventory exceeds supported node capacity')
    inspected = json.loads(subprocess.check_output(['docker', 'inspect', *ids], timeout=30))
    stats = subprocess.check_output(['docker', 'stats', '--no-stream', '--format', '{{json .}}'], text=True, timeout=30)
    measured = {row['Name']: row for row in [json.loads(line) for line in stats.splitlines() if line]}
    rows = []
    for container in inspected:
        name = container['Name'].lstrip('/')
        labels = container['Config'].get('Labels') or {}
        stat = measured.get(name, {})
        rows.append({'name':name, 'project':labels.get('com.docker.compose.project',''),
            'service':labels.get('com.docker.compose.service',''), 'image':container['Config']['Image'],
            'state':container['State']['Status'], 'health':container['State'].get('Health',{}).get('Status','none'),
            'memoryMb':memory_mb(stat.get('MemUsage','0B').split('/')[0].strip()),
            'cpuPercent':float(stat.get('CPUPerc','0%').rstrip('%')), 'restarts':container['RestartCount']})
    return rows


def collect(data_path, config=None):
    config = config or {}
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
    total_disk = shutil.disk_usage(data_path).total
    certificate = None
    if config.get('certificateStatusPath'):
        try:
            certificate = json.loads(Path(config['certificateStatusPath']).read_text())
        except (OSError, ValueError):
            pass
    automation = None
    if config.get('issuerStatusPath'):
        try: automation = json.loads(Path(config['issuerStatusPath']).read_text())
        except (OSError, ValueError):
            automation = {'status':'failed','checkedAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()}
    backups = []
    workspace = Path(config.get('workspace', data_path))
    for journal in workspace.glob('*/execution.json'):
        import uuid
        try:
            deployment_id = str(uuid.UUID(journal.parent.name))
            if json.loads(journal.read_text()).get('phase') != 'runtime_ready':
                continue
            status = journal.parent / 'backup-status.json'
            backups.append(json.loads(status.read_text()) if status.exists() else {
                'deploymentId':deployment_id, 'completedAt':None, 'status':'never', 'offsiteAt':None, 'offsiteStatus':'not_configured'})
        except (ValueError, OSError):
            continue
    containers = inventory() if ready else []
    supported = []
    if not config.get('monitorOnly', True):
        for code in sorted(config.get('adapters', {})):
            try:
                resolve_adapter(config, code, verify=True)
                supported.append(code)
            except (ValueError, OSError, KeyError, TypeError):
                continue
    upgrades=catalog(config) if ready else []
    images=runtime_images(config,workspace) if ready and not config.get('monitorOnly',True) else []
    return {'upgradeReleases':upgrades, 'runtimeImages':images, 'dockerReady': ready, 'canDeploy': not config.get('monitorOnly', True), 'supportedApps': supported, 'supportedOperations': (['retire','export','reclaim','upgrade'] if config.get('ageBinary') and config.get('ageKeygenBinary') else ['retire','upgrade']) if config.get('snapshotImage') and config.get('offsite') and not config.get('monitorOnly', True) else [],
        'totals': {'cpuMillis': (os.cpu_count() or 1)*1000, 'memoryMb':mem['MemTotal']//1024, 'diskMb':total_disk//1048576},
        'certificateAutomation':automation, 'load1':os.getloadavg()[0], 'containers':containers, 'certificate':certificate, 'backups':backups,
        'available': {
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
    payload = collect(config.get('dataPath', '/opt/lingcoo'), config)
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
