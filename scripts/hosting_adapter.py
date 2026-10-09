"""Operator-installed adapters; task payloads never choose executable paths."""
import hashlib
import json
from pathlib import Path
import re
import uuid

def resolve_adapter(config, app_code, verify=False):
    if app_code not in config.get('adapters', {}):
        raise ValueError('Adapter not installed')
    descriptor = dict(config['adapters'][app_code])
    adapters = config['adapters']
    if descriptor.get('protocolVersion') != 2:
        raise ValueError('Unsupported adapter protocol')
    prefix = descriptor.get('projectPrefix', '')
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}', prefix):
        raise ValueError('Invalid project prefix')
    for other, entry in adapters.items():
        if other != app_code and entry.get('projectPrefix') == prefix:
            raise ValueError('Adapter project prefix collision')
    weights = descriptor.get('weights', {})
    if not weights or any(not re.fullmatch(r'[a-z][a-z0-9_-]{0,31}', key) or type(value) is not int or value < 1 for key, value in weights.items()):
        raise ValueError('Invalid service resource weights')
    for key in ('appServices', 'healthyServices'):
        values = descriptor.get(key, [])
        if (key == 'appServices' and not values) or len(set(values)) != len(values) or any(v not in weights for v in values):
            raise ValueError('Invalid service list')
    for key in ('infrastructureServices', 'infrastructureHealthyServices', 'originServices'):
        values = descriptor.get(key)
        if not isinstance(values, list) or len(set(values)) != len(values) or any(v not in weights for v in values):
            raise ValueError('Invalid lifecycle services')
    if descriptor.get('ingressService') not in weights:
        raise ValueError('Invalid ingress service')
    if type(descriptor.get('ingressPort')) is not int or not 1 <= descriptor['ingressPort'] <= 65535:
        raise ValueError('Invalid ingress port')
    for key in ('volumes', 'imageVariables'):
        values = descriptor.get(key)
        pattern = r'[a-z][a-z0-9_]{0,63}' if key == 'volumes' else r'[A-Z][A-Z0-9_]{0,63}'
        if not isinstance(values, list) or len(set(values)) != len(values) or any(not re.fullmatch(pattern, v) for v in values):
            raise ValueError('Invalid adapter variables')
    if 'APP_IMAGE' not in descriptor['imageVariables']:
        raise ValueError('Application image required')
    origin = descriptor.get('originVariable')
    if origin is not None and not re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', origin):
        raise ValueError('Invalid origin variable')
    for step in descriptor.get('initialization', []):
        if step.get('service') not in weights or not isinstance(step.get('command'), list) or not step['command'] or any(not isinstance(v, str) or not v or '\x00' in v for v in step['command']):
            raise ValueError('Invalid initialization command')
        for target, source in step.get('environment', {}).items():
            if not re.fullmatch(r'[A-Z][A-Z0-9_]*', target) or not re.fullmatch(r'[A-Z][A-Z0-9_]*', source):
                raise ValueError('Invalid initialization environment')
    files = descriptor.get('files', [])
    if 'docker-compose.prod.yml' not in files:
        raise ValueError('Compose file required')
    for name in [*files, descriptor.get('backupScript', '')]:
        if not name or Path(name).is_absolute() or '..' in Path(name).parts:
            raise ValueError('Invalid bundle path')
    if type(descriptor.get('minMemoryMb')) is not int or descriptor['minMemoryMb'] < 128:
        raise ValueError('Invalid minimum memory')
    if not descriptor.get('httpChecks') or any(not re.fullmatch(r'/[a-zA-Z0-9/_-]*', value) for value in descriptor['httpChecks']):
        raise ValueError('Invalid health endpoint')
    if verify:
        bundle = Path(descriptor['bundle'])
        if not bundle.is_absolute() or bundle.is_symlink():
            raise ValueError('Absolute trusted bundle required')
        hashes = descriptor['hashes']
        required = ['stack-delivery.py', *descriptor['files'], descriptor['backupScript']]
        if any(name not in hashes for name in required):
            raise ValueError('Incomplete adapter checksums')
        for name, digest in hashes.items():
            relative = Path(name)
            if relative.is_absolute() or '..' in relative.parts or not re.fullmatch(r'[a-f0-9]{64}', digest):
                raise ValueError('Invalid adapter checksum entry')
            target = bundle / relative
            if target.is_symlink() or bundle.resolve() not in target.resolve().parents or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise ValueError('Adapter checksum mismatch')
    return descriptor


def project_name(descriptor, deployment_id):
    return descriptor['projectPrefix'] + '-' + str(uuid.UUID(deployment_id)).replace('-', '')


def instance_adapter(config, directory, verify=False):
    if directory.is_symlink():
        raise ValueError('Symlink instance refused')
    journal = json.loads((directory / 'execution.json').read_text())
    descriptor = resolve_adapter(config, journal['appCode'], verify)
    project = project_name(descriptor, directory.name)
    if journal['project'] != project:
        raise ValueError('Instance adapter ownership mismatch')
    return descriptor, project
