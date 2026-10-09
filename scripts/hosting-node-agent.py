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
from hosting_adapter import resolve_adapter, project_name, instance_adapter


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


def validate_job(job, config=None):
    descriptor = resolve_adapter(config or {}, job['appCode'])
    for key in ('id', 'deploymentId'):
        uuid.UUID(job[key])
    if not re.fullmatch(r'[a-z0-9]+(?:[-.][a-z0-9]+)*', job['hostname']):
        raise ValueError('Invalid hostname')
    if not re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}', job['env']['APP_IMAGE']):
        raise ValueError('Immutable image required')
    if int(job['resources']['memoryMb']) < descriptor['minMemoryMb']:
        raise ValueError('Adapter minimum memory not met')


def run(command, directory, environment=None):
    # Docker errors can contain secrets. Never forward their raw output.
    clean = {key: os.environ[key] for key in ('PATH', 'HOME') if key in os.environ}
    with tempfile.TemporaryFile() as output:
        result = subprocess.run(command, cwd=directory, env={**clean, **(environment or {})},
                                stdout=output, stderr=output, timeout=600)
        if result.returncode:
            raise RuntimeError('Execution step failed')


def render_limits(resources, weights):
    total = sum(weights.values())
    return {'services': {name: {'mem_limit': str(int(resources['memoryMb']) * weight // total) + 'm',
                               'memswap_limit': str(int(resources['memoryMb']) * weight // total) + 'm',
                               'cpus': max(0.01, int(resources['cpuMillis']) * weight / (total * 1000)),
                               'pids_limit': 128}
                         for name, weight in weights.items()}}


def execute(job, config, workspace):
    validate_job(job, config)
    descriptor = resolve_adapter(config, job['appCode'], verify=True)
    bundle = Path(descriptor['bundle']).resolve()
    spec = importlib.util.spec_from_file_location('application_delivery', bundle / 'stack-delivery.py')
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    if adapter.APP_CODE != job['appCode']:
        raise ValueError('Application adapter identity mismatch')
    project = project_name(descriptor, job['deploymentId'])
    directory = workspace / job['deploymentId']
    directory.mkdir(mode=0o700, exist_ok=True)
    if directory.is_symlink():
        raise ValueError('Symlink instance directory refused')
    journal = directory / 'execution.json'
    if journal.exists():
        previous = json.loads(journal.read_text())
        instance_adapter(config, directory)
        if previous['jobId'] != job['id'] or previous['appCode'] != job['appCode']:
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
        for volume in descriptor['volumes']:
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
        private_json(journal, {'jobId': job['id'], 'appCode': job['appCode'], 'project': project, 'port': port, 'phase': 'initializing'})
    values_file = directory / '.env'
    if not values_file.exists():
        values = adapter.prepare_configuration(job['env'], project)
        values = adapter.hosting_configuration(values, port)
        adapter.write_private(values_file, adapter.encode_env(values))
    values = adapter.read_env(values_file)
    if values['APP_IMAGE'] != job['env']['APP_IMAGE']:
        raise ValueError('Pinned image changed')
    for volume in descriptor['volumes']:
        inspection = subprocess.run(['docker', 'volume', 'inspect', '-f', '{{index .Labels "com.docker.compose.project"}}', project + '_' + volume], capture_output=True, text=True)
        if inspection.returncode == 0 and inspection.stdout.strip() != project:
            raise ValueError('Volume ownership mismatch')
    for name in descriptor['files']:
        destination = directory / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(bundle / name, destination)
    # Port 443 belongs exclusively to the platform gateway. Override published ports
    # through the application's prepare_hosting hook, never edit arbitrary YAML here.
    adapter.prepare_hosting(directory, port)
    limits = render_limits(job['resources'], descriptor['weights'])
    limits['networks'] = {'ingress': {'name': project + '-ingress'}}
    limits['services'][descriptor['ingressService']]['networks'] = {'default': {}, 'ingress': {'aliases': [project + '-ingress']}}
    private_json(directory / 'limits.json', limits)
    prefix = ['docker', 'compose']
    if subprocess.run(prefix + ['version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        prefix = ['docker-compose']
    command = prefix + ['-p', project, '--env-file', str(values_file), '-f', str(directory / 'docker-compose.prod.yml'), '-f', str(directory / 'limits.json')]
    run(command + ['config', '--quiet'], directory)
    if config.get('useCachedImagesOnly', False):
        for image in [values[key] for key in descriptor['imageVariables']]:
            run(['docker', 'image', 'inspect', image], directory)
    else:
        with tempfile.TemporaryDirectory(prefix='lingcoo-registry-') as auth_dir:
            registry_env = {'DOCKER_CONFIG': auth_dir, 'PATH': os.environ['PATH']}
            result = subprocess.run(['docker', 'login', values['APP_IMAGE'].split('/')[0], '--username', job['env']['ACR_USERNAME'], '--password-stdin'],
                                    input=job['env']['ACR_PASSWORD'].encode(), env=registry_env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
            if result.returncode:
                raise RuntimeError('Registry login failed')
            run(command + ['pull', *descriptor['appServices']], directory, registry_env)
            for base_image in [values[key] for key in descriptor['imageVariables'] if key != 'APP_IMAGE']:
                if subprocess.run(['docker', 'image', 'inspect', base_image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
                    run(['docker', 'pull', base_image], directory, registry_env)
    # No runtime/migration overlap beyond the reserved instance budget during recovery.
    run(command + ['stop', *descriptor['appServices'], descriptor['ingressService']], directory)
    print('STEP infrastructure', flush=True)
    if descriptor['infrastructureServices']:
        run(command + ['up', '-d', *descriptor['infrastructureServices']], directory)
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
    healthy(descriptor['infrastructureHealthyServices'])
    print('STEP initialize', flush=True)
    for step in descriptor['initialization']:
        environment = {target: job['env'][source] for target, source in step.get('environment', {}).items()}
        run(command + ['run', '--rm', '--no-deps', step['service'], *step['command']], directory, environment)
    print('STEP runtime', flush=True)
    run(command + ['up', '-d', *descriptor['appServices']], directory)
    healthy(descriptor['healthyServices'])
    for name in descriptor['appServices']:
        cid = subprocess.check_output(command + ['ps', '-q', name], cwd=directory).decode().strip()
        if not cid or subprocess.check_output(['docker', 'inspect', '-f', '{{.State.Running}}', cid]).strip() != b'true':
            raise RuntimeError('Application service not running')
    run(command + ['up', '-d', descriptor['ingressService']], directory)
    for endpoint in descriptor['httpChecks']:
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
    private_json(journal, {'jobId': job['id'], 'appCode': job['appCode'], 'project': project, 'port': port, 'phase': 'runtime_ready'})
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
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Node is busy with a managed operation; retry next tick')
            return
        api('report', report.collect(str(workspace), config))
        if config.get('monitorOnly'):
            print('Inventory report accepted; deployment disabled on this node')
            return
        if config.get('ageBinary'):
            spec=importlib.util.spec_from_file_location('handover_cleanup',Path(__file__).with_name('hosting-node-handover.py'))
            cleanup=importlib.util.module_from_spec(spec);spec.loader.exec_module(cleanup);cleanup.cleanup_transfers(workspace)
        operation = api('operations/claim', {})['operation']
        if operation:
            spec = importlib.util.spec_from_file_location('operation', Path(__file__).with_name('hosting-node-operation.py'))
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            result = module.execute(config, workspace, operation, api)
            evidence={}
            if result and operation['kind']=='retire':
                evidence={'evidence':json.loads((workspace/operation['deploymentId']/'exit-status.json').read_text())}
            if result and operation['kind']=='reclaim':evidence={'reclamationEvidence':result}
            api('operations/complete', {'operationId':operation['id'], 'success':bool(result), **evidence})
            api('report', report.collect(str(workspace), config))
            print('Managed operation completed' if result else 'Managed operation failed')
            return
        job = api('claim', {})['job']
        if job is None:
            print('No eligible runtime task')
            publish_ingress(config, workspace, api)
            return
        try:
            validate_job(job, config)
            result = execute(job, config, workspace)
        except Exception:
            # Stop only this task's owned project, retaining all data and capacity.
            journal = workspace / job['deploymentId'] / 'execution.json'
            if journal.is_file() and json.loads(journal.read_text()).get('jobId') == job['id']:
                _, project = instance_adapter(config, journal.parent)
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
