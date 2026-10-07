#!/usr/bin/env python3
"""One bounded hosting execution per invocation; provision adapters separately as trusted code."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import uuid


def private_json(path, value):
    fd, name = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def validate_job(job):
    for key in ('id', 'deploymentId'):
        uuid.UUID(job[key])
    if job['appCode'] != 'lingcoo_retail_oms':
        raise ValueError('Adapter not installed')
    if not re.fullmatch(r'[a-z0-9]+(?:[-.][a-z0-9]+)*', job['hostname']):
        raise ValueError('Invalid hostname')
    if not re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}', job['env']['APP_IMAGE']):
        raise ValueError('Immutable image required')
    if int(job['resources']['memoryMb']) < 1024:
        raise ValueError('Retail pilot requires at least 1024 MiB')


def run(command, directory, environment=None):
    # Docker errors can contain secrets. Never forward their raw output.
    clean = {key: os.environ[key] for key in ('PATH', 'HOME') if key in os.environ}
    with tempfile.TemporaryFile() as output:
        result = subprocess.run(command, cwd=directory, env={**clean, **(environment or {})},
                                stdout=output, stderr=output, timeout=600)
        if result.returncode:
            raise RuntimeError('Execution step failed')


def render_limits(resources):
    weights = {'postgres': 3, 'api': 3, 'worker': 5, 'web': 4, 'caddy': 1}
    return {'services': {name: {'mem_limit': str(int(resources['memoryMb']) * weight // 16) + 'm',
                               'memswap_limit': str(int(resources['memoryMb']) * weight // 16) + 'm',
                               'cpus': max(0.01, int(resources['cpuMillis']) * weight / 16000),
                               'pids_limit': 128}
                         for name, weight in weights.items()}}


def execute(job, config, workspace):
    validate_job(job)
    bundle = Path(config['retailBundle']).resolve()
    # Trust root is the operator's private config, not filenames supplied by a customer/task.
    hashes = config['bundleHashes']
    for name in ('stack-delivery.py', 'docker-compose.prod.yml', 'docker/Caddyfile'):
        if hashlib.sha256((bundle / name).read_bytes()).hexdigest() != hashes[name]:
            raise ValueError('Adapter checksum mismatch')
    spec = importlib.util.spec_from_file_location('retail_delivery', bundle / 'stack-delivery.py')
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    project = 'retail-' + job['deploymentId'].replace('-', '')
    directory = workspace / job['deploymentId']
    directory.mkdir(mode=0o700, exist_ok=True)
    if directory.is_symlink():
        raise ValueError('Symlink instance directory refused')
    journal = directory / 'execution.json'
    if journal.exists():
        previous = json.loads(journal.read_text())
        if previous['jobId'] != job['id']:
            raise ValueError('Different task cannot adopt existing data')
        port = previous['port']
    else:
        mem = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
        if int(mem['MemAvailable'].split()[0]) // 1024 < int(job['resources']['memoryMb']) + 128:
            raise ValueError('Insufficient host headroom')
        if any(directory.iterdir()):
            raise ValueError('Non-empty unowned installation directory')
        if subprocess.check_output(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project]).strip():
            raise ValueError('Project already exists')
        for volume in ('postgres_data', 'storage_data', 'caddy_data', 'caddy_config'):
            if subprocess.run(['docker', 'volume', 'inspect', project + '_' + volume], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                raise ValueError('Unowned volume already exists')
        port = None
        for candidate in range(int(config.get('portStart', 23000)), int(config.get('portEnd', 23999)) + 1):
            with socket.socket() as probe:
                try:
                    probe.bind(('127.0.0.1', candidate))
                    port = candidate
                    break
                except OSError:
                    pass
        if port is None:
            raise ValueError('No free loopback port')
        # Write ownership first; configuration initialization is repeatable after a crash.
        private_json(journal, {'jobId': job['id'], 'port': port, 'phase': 'initializing'})
    values_file = directory / '.env'
    if not values_file.exists():
        values = adapter.prepare_configuration(job['env'], project)
        values.update({'HTTP_PORT': '127.0.0.1:' + str(port), 'CADDY_SITE_ADDRESS': ':80'})
        adapter.write_private(values_file, adapter.encode_env(values))
    values = adapter.read_env(values_file)
    if values['APP_IMAGE'] != job['env']['APP_IMAGE']:
        raise ValueError('Pinned image changed')
    for volume in ('postgres_data', 'storage_data', 'caddy_data', 'caddy_config'):
        inspection = subprocess.run(['docker', 'volume', 'inspect', '-f', '{{index .Labels "com.docker.compose.project"}}', project + '_' + volume], capture_output=True, text=True)
        if inspection.returncode == 0 and inspection.stdout.strip() != project:
            raise ValueError('Volume ownership mismatch')
    (directory / 'docker').mkdir(exist_ok=True)
    shutil.copyfile(bundle / 'docker/Caddyfile', directory / 'docker/Caddyfile')
    compose_text = (bundle / 'docker-compose.prod.yml').read_text().replace("      - '${HTTPS_PORT:-443}:443'\n", '')
    (directory / 'docker-compose.prod.yml').write_text(compose_text)
    limits = render_limits(job['resources'])
    limits['networks'] = {'ingress': {'name': project + '-ingress'}}
    limits['services']['caddy']['networks'] = {'default': {}, 'ingress': {'aliases': [project + '-ingress']}}
    private_json(directory / 'limits.json', limits)
    prefix = ['docker', 'compose']
    if subprocess.run(prefix + ['version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        prefix = ['docker-compose']
    command = prefix + ['-p', project, '--env-file', str(values_file), '-f', str(directory / 'docker-compose.prod.yml'), '-f', str(directory / 'limits.json')]
    run(command + ['config', '--quiet'], directory)
    if config.get('useCachedImagesOnly', False):
        for image in (values['APP_IMAGE'], values['POSTGRES_IMAGE'], values['CADDY_IMAGE']):
            run(['docker', 'image', 'inspect', image], directory)
    else:
        with tempfile.TemporaryDirectory(prefix='lingcoo-registry-') as auth_dir:
            registry_env = {'DOCKER_CONFIG': auth_dir, 'PATH': os.environ['PATH']}
            result = subprocess.run(['docker', 'login', values['APP_IMAGE'].split('/')[0], '--username', job['env']['ACR_USERNAME'], '--password-stdin'],
                                    input=job['env']['ACR_PASSWORD'].encode(), env=registry_env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
            if result.returncode:
                raise RuntimeError('Registry login failed')
            run(command + ['pull', 'api', 'worker', 'web'], directory, registry_env)
            for base_image in (values['POSTGRES_IMAGE'], values['CADDY_IMAGE']):
                if subprocess.run(['docker', 'image', 'inspect', base_image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
                    run(['docker', 'pull', base_image], directory, registry_env)
    # No runtime/migration overlap beyond the reserved instance budget during recovery.
    run(command + ['stop', 'api', 'worker', 'web', 'caddy'], directory)
    print('STEP postgres', flush=True)
    run(command + ['up', '-d', 'postgres'], directory)
    def healthy(services):
        for _ in range(90):
            good = True
            for name in services:
                container = subprocess.check_output(command + ['ps', '-q', name], cwd=directory).decode().strip()
                status = subprocess.check_output(['docker', 'inspect', '-f', '{{.State.Health.Status}}', container]).decode().strip() if container else ''
                good = good and status == 'healthy'
            if good:
                return
            time.sleep(2)
        raise RuntimeError('Health deadline exceeded')
    healthy(['postgres'])
    # Migrations and bootstrap are idempotent. Initial credentials are one-off process inputs.
    print('STEP migrate', flush=True)
    run(command + ['run', '--rm', '--no-deps', 'api', 'node', 'apps/server/dist/entrypoints/migrate.js'], directory)
    run(command + ['run', '--rm', '--no-deps', 'api', 'node', 'apps/server/dist/entrypoints/bootstrap.js'], directory,
        {'BOOTSTRAP_OWNER_EMAIL': job['env']['INITIAL_ADMIN_EMAIL'], 'BOOTSTRAP_OWNER_PASSWORD': job['env']['INITIAL_ADMIN_PASSWORD']})
    print('STEP runtime', flush=True)
    run(command + ['up', '-d', 'api', 'worker', 'web'], directory)
    healthy(['api', 'worker', 'web'])
    run(command + ['up', '-d', 'caddy'], directory)
    for endpoint in ('/health/ready', '/health/worker', '/', '/admin/'):
        for attempt in range(30):
            try:
                with urllib.request.urlopen('http://127.0.0.1:' + str(port) + endpoint, timeout=5) as response:
                    if response.status != 200:
                        raise RuntimeError('HTTP health failed')
                break
            except (OSError, RuntimeError):
                if attempt == 29:
                    raise
                time.sleep(2)
    private_json(journal, {'jobId': job['id'], 'port': port, 'phase': 'runtime_ready'})
    return {'image': values['APP_IMAGE']}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Redirect refused')


def main():
    path = Path(sys.argv[1])
    if path.stat().st_mode & 0o077:
        raise ValueError('Private config required')
    config = json.loads(path.read_text())
    base = urllib.parse.urlsplit(config['stackUrl'])
    if base.username or base.password or base.path not in ('', '/') or base.query or base.fragment:
        raise ValueError('Invalid Stack origin')
    if base.scheme != 'https' and not (config.get('testLoopback') is True and base.scheme == 'http' and base.hostname == '127.0.0.1'):
        raise ValueError('HTTPS required except explicit SSH loopback pilot')
    node = str(uuid.UUID(config['nodeId']))
    workspace = Path(config['workspace']).resolve()
    workspace.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(workspace, 0o700)
    def api(route, payload=None):
        req = urllib.request.Request(config['stackUrl'].rstrip('/') + '/v1/hosting/nodes/' + node + '/' + route,
                                     data=json.dumps(payload).encode() if payload is not None else None, method='POST' if payload is not None else 'GET', headers={
                                         'Authorization': 'Bearer ' + config['reportToken'], 'Content-Type': 'application/json'})
        with urllib.request.build_opener(NoRedirect).open(req, timeout=60) as response:
            return json.loads(response.read(2_000_000))
    spec = importlib.util.spec_from_file_location('hosting_report', Path(__file__).with_name('hosting-node-report.py'))
    report = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(report)
    with open(workspace / '.agent.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        api('report', report.collect(str(workspace)))
        job = api('claim', {})['job']
        if job is None:
            print('No eligible runtime task')
            publish_ingress(config, workspace, api)
            return
        try:
            validate_job(job)
            result = execute(job, config, workspace)
        except Exception:
            # Stop only this task's owned project, retaining all data and capacity.
            journal = workspace / job['deploymentId'] / 'execution.json'
            if journal.is_file() and json.loads(journal.read_text()).get('jobId') == job['id']:
                project = 'retail-' + str(uuid.UUID(job['deploymentId'])).replace('-', '')
                ids = subprocess.check_output(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=' + project]).decode().split()
                if ids:
                    subprocess.run(['docker', 'stop', *ids], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
            api('complete', {'deploymentId': job['deploymentId'], 'jobId': job['id'], 'success': False})
            raise
        api('complete', {'deploymentId': job['deploymentId'], 'jobId': job['id'], 'success': True, **result})
        print('Runtime verified; public DNS/TLS access is still pending')
        publish_ingress(config, workspace, api)


def publish_ingress(config, workspace, api):
    if not config.get('gatewayConfigPath') or not config.get('gatewayContainer'):
        return
    spec = importlib.util.spec_from_file_location('hosting_ingress', Path(__file__).with_name('hosting-node-ingress.py'))
    ingress = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ingress)
    for item in api('ingress')['items']:
        try:
            ingress.publish(config, workspace, item)
            api('ingress/' + item['deploymentId'], {})
            for domain in item.get('removals', []):
                api('ingress/' + item['deploymentId'] + '/domains/' + domain['id'], {'removed': True})
            for domain in item.get('aliases', []):
                try:
                    api('ingress/' + item['deploymentId'] + '/domains/' + domain['id'], {'removed': False})
                except Exception:
                    print('Custom domain HTTPS pending')
            print('Public HTTPS verified')
        except Exception:
            # DNS propagation or ACME may still be pending; never report false readiness.
            print('Public HTTPS pending; will retry on next invocation')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Hosting execution failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
