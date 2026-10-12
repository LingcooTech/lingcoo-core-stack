"""Platform-owned Compose transport. Application repository scripts are never imported."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid


def kernel(config):
    path = Path(__file__).with_name('compose-install.py')
    expected = config.get('composeRunnerSha256', '')
    if not re.fullmatch(r'[a-f0-9]{64}', expected) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('Pinned Compose runner required')
    spec = importlib.util.spec_from_file_location('platform_compose_kernel', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate(job, config):
    module = kernel(config)
    installation = job['installation']
    uuid.UUID(job['id'])
    if installation['instanceId'] != str(uuid.UUID(job['deploymentId'])) or installation['mode'] != 'managed':
        raise ValueError('Managed installation identity mismatch')
    if any(installation['resources'][key] != job['resources'][key] for key in ('cpuMillis', 'memoryMb', 'diskMb')):
        raise ValueError('Managed resource budget mismatch')
    module.validate(installation)
    return module


def execute(job, config, workspace):
    module = validate(job, config)
    installation = job['installation']
    directory = workspace / job['deploymentId']
    journal = directory / 'execution.json'
    if journal.is_symlink():
        raise ValueError('Symlink routing journal refused')
    if journal.exists():
        previous = json.loads(journal.read_text())
        if previous.get('protocol') != 'compose_install_v1' or previous.get('jobId') != job['id']:
            raise ValueError('Different task cannot adopt existing data')
    # Legacy preset credentials can authorize the corresponding application registry only.
    # No credentials are persisted with configuration or inherited from the root Docker login.
    with tempfile.TemporaryDirectory(prefix='stack-compose-registry-') as auth:
        values = job.get('env', {})
        username, password = values.get('ACR_USERNAME'), values.get('ACR_PASSWORD')
        if username or password:
            image = values.get('APP_IMAGE', '')
            if not username or not password or image not in {s['image'] for s in installation['services']}:
                raise ValueError('Registry credentials require a matching pinned application image')
            registry = image.split('/')[0]
            if not re.fullmatch(r'[a-zA-Z0-9.-]+(?::[0-9]{1,5})?', registry):
                raise ValueError('Invalid registry host')
            response = subprocess.run(['docker', '--config', auth, 'login', registry, '--username', username, '--password-stdin'],
                input=password.encode(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60,
                env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': auth})
            if response.returncode:
                raise RuntimeError('Registry authentication failed')
        evidence = module.execute(installation, workspace, auth, cached_images_only=config.get('useCachedImagesOnly', False))
    state = json.loads((directory / 'installation.json').read_text())
    project = installation['project']
    network = project + '-ingress'
    inspect = subprocess.run(['docker', 'network', 'inspect', '-f', '{{index .Labels "' + module.OWNER + '"}}', network], capture_output=True, text=True, timeout=30)
    if inspect.returncode:
        subprocess.run(['docker', 'network', 'create', '--label', module.OWNER + '=' + state['fingerprint'], network],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    elif inspect.stdout.strip() != state['fingerprint']:
        raise ValueError('Unowned ingress network refused')
    ids = subprocess.check_output(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=' + project,
        '--filter', 'label=com.docker.compose.service=' + installation['entrypoint']['service']], timeout=30).decode().split()
    if len(ids) != 1:
        raise ValueError('Exactly one ingress service required')
    owner = subprocess.check_output(['docker', 'inspect', '-f', '{{index .Config.Labels "' + module.OWNER + '"}}', ids[0]], timeout=30).decode().strip()
    if owner != state['fingerprint']:
        raise ValueError('Ingress ownership mismatch')
    networks = json.loads(subprocess.check_output(['docker', 'inspect', '-f', '{{json .NetworkSettings.Networks}}', ids[0]], timeout=30))
    if network not in networks:
        subprocess.run(['docker', 'network', 'connect', '--alias', project + '-ingress', network, ids[0]],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    module.private_json(journal, {'protocol': 'compose_install_v1', 'jobId': job['id'], 'appCode': job['appCode'],
        'project': project, 'phase': 'runtime_ready', 'releaseId': installation['releaseId'],
        'releaseDigest': installation['releaseDigest'], 'fingerprint': state['fingerprint'], 'ingressPort': installation['entrypoint']['port']})
    return {'composeEvidence': evidence}


def ingress_descriptor(directory, deployment_id):
    route = json.loads((directory / 'execution.json').read_text())
    state = json.loads((directory / 'installation.json').read_text())
    project = 'stack-' + str(uuid.UUID(deployment_id)).replace('-', '')
    if route.get('protocol') != 'compose_install_v1' or route.get('project') != project or state.get('project') != project:
        raise ValueError('Invalid Compose routing identity')
    if state.get('phase') != 'runtime_ready' or any(route.get(key) != state.get(key) for key in ('fingerprint', 'releaseId', 'releaseDigest')):
        raise ValueError('Routing installation mismatch')
    port = route.get('ingressPort')
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('Invalid ingress port')
    owner = subprocess.check_output(['docker', 'network', 'inspect', '-f', '{{index .Labels "io.lingcoo.compose.binding"}}', project + '-ingress'], timeout=30).decode().strip()
    if owner != state['fingerprint']:
        raise ValueError('Unowned ingress network refused')
    return {'ingressPort': port, 'originVariable': None}, project
