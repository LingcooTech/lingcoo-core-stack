#!/usr/bin/env python3
"""Generic, bounded installation kernel. Input is a private platform-validated job on stdin.

This tool does not grant deployment rights or mark a release publishable. Callers own
authentication, encrypted configuration persistence, scheduling and DNS/TLS gates.
No application-specific adapter or repository code is executed on the host.
"""
import argparse
import fcntl
import hashlib
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
import urllib.request
import uuid

PROTOCOL = 'compose_install_v1'
RUNNER_VERSION = '1'
OWNER = 'io.lingcoo.compose.binding'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(job):
    require(job.get('protocol') == PROTOCOL, 'Unsupported installation protocol')
    identifier = str(uuid.UUID(job['instanceId']))
    uuid.UUID(job['releaseId'])
    require(job['project'] == 'stack-' + identifier.replace('-', ''), 'Project identity mismatch')
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', job['releaseDigest']), 'Immutable release required')
    require(job['mode'] in ('self_hosted', 'managed'), 'Invalid deployment mode')
    compose = job['compose']
    require(set(compose) <= {'services', 'networks', 'volumes'}, 'Unsupported Compose root')
    services = compose['services']
    require(isinstance(services, dict) and 0 < len(services) <= 64, 'Invalid service set')
    declared = {item['name']: item for item in job['services']}
    require(len(declared) == len(job['services']) and set(declared) == set(services), 'Service set mismatch')
    require(set(job['volumes']) == set(compose.get('volumes', {})), 'Volume set mismatch')
    require(job['entrypoint']['service'] in services, 'Invalid entrypoint service')
    port = None
    for name, service in services.items():
        require(re.fullmatch(r'[A-Za-z0-9_-]+', name), 'Invalid service name')
        require(set(service) <= {'image', 'command', 'entrypoint', 'environment', 'depends_on',
                'volumes', 'networks', 'healthcheck', 'restart', 'working_dir', 'user', 'read_only',
                'tmpfs', 'stop_grace_period', 'expose', 'init', 'mem_limit', 'memswap_limit',
                'cpus', 'pids_limit', 'security_opt', 'logging', 'ports'}, 'Unsupported service setting')
        require(re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}', service['image']), 'Immutable image required')
        require(declared[name]['image'] == service['image'], 'Image set mismatch')
        require(service['mem_limit'] == declared[name]['memoryMb'] * 1024 * 1024 and
                service['memswap_limit'] == service['mem_limit'] and
                service['cpus'] == declared[name]['cpuMillis'] / 1000, 'Resource limits mismatch')
        require(service['pids_limit'] == 256 and service['security_opt'] == ['no-new-privileges:true'], 'Runtime isolation required')
        require(service['logging'] == {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}}, 'Bounded logging required')
        for volume in service.get('volumes', []):
            require(isinstance(volume, str) and re.fullmatch(r'[A-Za-z0-9_-]+:/[^:]+(?::(?:ro|rw))?', volume), 'Only named volumes supported')
            require(volume.split(':')[0] in job['volumes'], 'Undeclared volume')
        if name == job['entrypoint']['service']:
            ports = service.get('ports', [])
            require(len(ports) == 1, 'One loopback entrypoint required')
            binding = ports[0]
            port = binding['published']
            require(type(port) is int and 1024 <= port <= 65535 and binding == {
                'target': job['entrypoint']['port'], 'published': port,
                'host_ip': '127.0.0.1', 'protocol': 'tcp'}, 'Invalid loopback binding')
        else:
            require('ports' not in service, 'Only entrypoint may publish a port')
    resources = job['resources']
    require(sum(v['memoryMb'] for v in declared.values()) == resources['memoryMb'] and
            sum(v['cpuMillis'] for v in declared.values()) == resources['cpuMillis'], 'Aggregate budget mismatch')
    require(all(v['memoryMb'] >= 64 and v['cpuMillis'] >= 10 for v in declared.values()), 'Invalid service budget')
    for section in ('volumes', 'networks'):
        for name, config in compose.get(section, {}).items():
            require(re.fullmatch(r'[A-Za-z0-9_-]+', name) and config in ({}, None), 'Only isolated default resources supported')
    lifecycle = job['lifecycle']
    infrastructure = lifecycle.get('infrastructure', [])
    require(len(set(infrastructure)) == len(infrastructure) and set(infrastructure) <= set(services), 'Invalid infrastructure services')
    if lifecycle['migrate'] or lifecycle['initialize']:
        require('infrastructure' in lifecycle, 'Explicit infrastructure list required')
    for name in infrastructure:
        health = services[name].get('healthcheck', {})
        require(health.get('test') and not health.get('disable') and health['test'] != ['NONE'], 'Infrastructure healthcheck required')
        require(set(services[name].get('depends_on', [])) <= set(infrastructure), 'Infrastructure dependency outside startup set')
    for phase in ('migrate', 'initialize'):
        for step in lifecycle[phase]:
            require(step['service'] in services and step['service'] not in infrastructure, 'Invalid initialization service')
            require(isinstance(step['command'], list) and 0 < len(step['command']) <= 50 and
                    all(isinstance(v, str) and 0 < len(v) <= 2000 and '\0' not in v for v in step['command']), 'Invalid argv')
    health_path = job['entrypoint']['healthPath']
    require(re.fullmatch(r'/[A-Za-z0-9/_-]*', health_path), 'Invalid health path')
    require(job['healthUrl'] == f'http://127.0.0.1:{port}{health_path}', 'Invalid health URL')
    return port


def private_json(path, value):
    require(not path.is_symlink(), 'Symlink state refused')
    fd, temporary = tempfile.mkstemp(prefix='.state-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise ValueError('Health redirects refused')


def execute(job, workspace, docker_config=None, deadline=180, cached_images_only=False):
    port = validate(job)
    fingerprint = hashlib.sha256(json.dumps(job, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    workspace = Path(workspace)
    require(not workspace.is_symlink(), 'Symlink workspace refused')
    workspace.mkdir(mode=0o700, parents=True, exist_ok=True)
    workspace = workspace.resolve()
    require(workspace.stat().st_uid == os.geteuid() and workspace.stat().st_mode & 0o077 == 0, 'Workspace must be private and owned')
    lock_fd = os.open(workspace / '.install.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return install_locked(job, workspace, fingerprint, port, docker_config, deadline, cached_images_only)
    finally:
        os.close(lock_fd)


def install_locked(job, workspace, fingerprint, port, docker_config, deadline, cached_images_only):
    directory = workspace / job['instanceId']
    require(not directory.is_symlink(), 'Symlink instance refused')
    directory.mkdir(mode=0o700, exist_ok=True)
    require(directory.stat().st_uid == os.geteuid() and directory.stat().st_mode & 0o077 == 0, 'Instance directory must be private')
    journal = directory / 'installation.json'
    require(not journal.is_symlink(), 'Symlink journal refused')
    # Compose always receives JSON via stdin; plaintext configuration is never written to disk.
    env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': str(directory),
           'DOCKER_CONFIG': str(Path(docker_config).resolve()) if docker_config else str(directory / '.docker')}

    def run(args, content=None, capture=False, timeout=600, allow_missing=False):
        try:
            result = subprocess.run(args, input=content, env=env, cwd=directory,
                                    stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL, timeout=timeout)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise RuntimeError('Docker execution failed or timed out') from error
        if result.returncode and not allow_missing:
            raise RuntimeError('Docker execution failed')
        return (result.stdout or b'').decode() if not result.returncode else None

    prefix = ['docker', 'compose']
    if run(prefix + ['version'], allow_missing=True) is None:
        prefix = ['docker-compose']
        run(prefix + ['version'])
    project = job['project']
    compose = json.loads(json.dumps(job['compose']))
    for service in compose['services'].values():
        service['labels'] = {OWNER: fingerprint}
    for section in ('volumes', 'networks'):
        compose.setdefault(section, {})
        for name in compose[section]:
            compose[section][name] = {'labels': {OWNER: fingerprint}}
    compose['networks'].setdefault('default', {'labels': {OWNER: fingerprint}})
    # Compose v1 lacks long port host_ip; lower the validated loopback binding for both versions.
    compose['services'][job['entrypoint']['service']]['ports'] = [f"127.0.0.1:{port}:{job['entrypoint']['port']}/tcp"]
    encoded = json.dumps(compose).encode()

    def dc(args, **kwargs):
        return run(prefix + ['--project-directory', str(directory), '-p', project, '-f', '-'] + args, content=encoded, **kwargs)

    containers = (run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project], capture=True) or '').split()
    for container in containers:
        require((run(['docker', 'inspect', '-f', '{{index .Config.Labels "' + OWNER + '"}}', container], capture=True) or '').strip() == fingerprint, 'Unowned container refused')
    for section, command in (('volumes', 'volume'), ('networks', 'network')):
        for name in compose[section]:
            existing = run(['docker', command, 'inspect', '-f', '{{index .Labels "' + OWNER + '"}}', project + '_' + name], capture=True, allow_missing=True)
            if existing is not None:
                require(existing.strip() == fingerprint and journal.exists(), 'Unowned resource refused')
    if journal.exists():
        state = json.loads(journal.read_text())
        require(state['fingerprint'] == fingerprint and state['runnerVersion'] == RUNNER_VERSION, 'Pinned installation changed')
    else:
        require(not containers and not list(directory.iterdir()), 'Unowned instance data refused')
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
        if Path('/proc/meminfo').exists():
            memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
            require(int(memory['MemAvailable'].split()[0]) // 1024 >= job['resources']['memoryMb'] + 128, 'Insufficient memory headroom')
        require(shutil.disk_usage(directory).free // (1024 * 1024) >= job['resources']['diskMb'] + 512, 'Insufficient disk headroom')
        state = {'protocol': PROTOCOL, 'runnerVersion': RUNNER_VERSION, 'instanceId': job['instanceId'],
                 'releaseId': job['releaseId'], 'releaseDigest': job['releaseDigest'],
                 'project': project, 'fingerprint': fingerprint, 'phase': 'prepared', 'completed': []}
        private_json(journal, state)

    def phase(name):
        state['phase'] = name
        state.pop('failedPhase', None)
        private_json(journal, state)

    def healthy(names):
        until = time.monotonic() + deadline
        while True:
            good = True
            for name in names:
                ids = (dc(['ps', '-q', name], capture=True) or '').split()
                if len(ids) != 1:
                    good = False
                    continue
                actual = (run(['docker', 'inspect', '-f', '{{.Config.Image}}', ids[0]], capture=True) or '').strip()
                require(actual == compose['services'][name]['image'], 'Running image mismatch')
                status = (run(['docker', 'inspect', '-f', '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', ids[0]], capture=True) or '').strip()
                require(not status.startswith('false '), 'Service stopped during readiness check')
                healthcheck = compose['services'][name].get('healthcheck', {})
                expected = 'true healthy' if healthcheck.get('test') and not healthcheck.get('disable') and healthcheck['test'] != ['NONE'] else 'true none'
                # Image-provided healthchecks are also required to pass.
                good = good and status in (['true healthy'] if expected == 'true healthy' else ['true none', 'true healthy'])
            if good:
                return
            if time.monotonic() >= until:
                raise RuntimeError('Service health deadline exceeded')
            time.sleep(1)

    def entry_ready():
        opener = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({}))
        until = time.monotonic() + deadline
        while True:
            try:
                with opener.open(job['healthUrl'], timeout=5) as response:
                    require(response.status == 200, 'Health endpoint not ready')
                return
            except (OSError, ValueError):
                if time.monotonic() >= until:
                    raise RuntimeError('Entrypoint health deadline exceeded') from None
                time.sleep(1)

    def result():
        return {key: state[key] for key in ('protocol', 'runnerVersion', 'instanceId', 'releaseId', 'releaseDigest', 'phase', 'completed', 'imageSource')}

    try:
        if state['phase'] == 'runtime_ready':
            healthy(sorted(compose['services']))
            entry_ready()
            return result()
        # A killed client can leave a one-off container running in Docker. Reclaim only ours.
        for container in containers:
            oneoff = (run(['docker', 'inspect', '-f', '{{index .Config.Labels "com.docker.compose.oneoff"}}', container], capture=True) or '').strip().lower()
            if oneoff == 'true':
                run(['docker', 'rm', '-f', container])
        phase('pull')
        dc(['config', '--quiet'])
        if not cached_images_only:
            dc(['pull'])
        for image in sorted(set(v['image'] for v in job['services'])):
            run(['docker', 'image', 'inspect', image])
        infrastructure = job['lifecycle'].get('infrastructure', [])
        applications = sorted(set(compose['services']) - set(infrastructure))
        phase('infrastructure')
        if applications:
            dc(['stop', *applications])
        if infrastructure:
            dc(['up', '-d', *infrastructure])
            healthy(infrastructure)
        for operation in ('migrate', 'initialize'):
            phase(operation)
            for number, step in enumerate(job['lifecycle'][operation]):
                key = f'{operation}:{number}'
                name = f'{project}-{operation}-{number}'
                owner = run(['docker', 'inspect', '-f', '{{index .Config.Labels "' + OWNER + '"}}', name], capture=True, allow_missing=True)
                if owner is not None:
                    require(owner.strip() == fingerprint, 'Unowned initialization container refused')
                    run(['docker', 'rm', '-f', name])
                if key in state['completed']:
                    continue
                try:
                    dc(['run', '--rm', '--no-deps', '-T', '--name', name,
                        '--entrypoint', step['command'][0], step['service'], *step['command'][1:]])
                finally:
                    # Stop timed-out/crashed one-off work before another task may start.
                    owner = run(['docker', 'inspect', '-f', '{{index .Config.Labels "' + OWNER + '"}}', name], capture=True, allow_missing=True)
                    if owner is not None:
                        require(owner.strip() == fingerprint, 'Initialization ownership changed')
                        run(['docker', 'rm', '-f', name])
                state['completed'].append(key)
                private_json(journal, state)
        phase('runtime')
        # Runtime services may depend on other application services (for example
        # an SSR frontend requiring a healthy API). Preserve declared startup
        # conditions; infrastructure already running with the same config is reused.
        dc(['up', '-d', *sorted(compose['services'])])
        healthy(sorted(compose['services']))
        phase('entrypoint')
        entry_ready()
        state['imageSource'] = 'cache' if cached_images_only else 'registry'
        phase('runtime_ready')
        return result()
    except Exception:
        state['failedPhase'] = state['phase']
        state['phase'] = 'failed'
        private_json(journal, state)
        raise RuntimeError('Installation failed at ' + state['failedPhase']) from None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--docker-config')
    parser.add_argument('--cached-images-only', action='store_true')
    args = parser.parse_args()
    try:
        raw = sys.stdin.buffer.read(1024 * 1024 + 1)
        require(len(raw) <= 1024 * 1024, 'Job exceeds size limit')
        result = execute(json.loads(raw), args.workspace, args.docker_config, cached_images_only=args.cached_images_only)
        print(json.dumps(result))
    except Exception:
        # Input validation and Docker errors may include secret values. Never echo them.
        print(json.dumps({'error': 'Installation rejected or failed; inspect the private phase journal'}), file=sys.stderr)
        sys.exit(1)
