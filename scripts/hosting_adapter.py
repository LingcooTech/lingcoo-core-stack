"""Operator-installed adapters; task payloads never choose executable paths."""
import hashlib
import json
from pathlib import Path
import re
import uuid

LEGACY_CODE = 'lingcoo_retail_oms'
LEGACY = {'projectPrefix': 'retail', 'weights': {'postgres': 3, 'api': 3, 'worker': 5, 'web': 4, 'caddy': 1},
          'appServices': ['api', 'worker', 'web'], 'healthyServices': ['api', 'worker', 'web'],
          'httpChecks': ['/health/ready', '/health/worker', '/', '/admin/'], 'minMemoryMb': 1024}
REQUIRED_FILES = ('stack-delivery.py', 'docker-compose.prod.yml', 'docker/Caddyfile')


def resolve_adapter(config, app_code, verify=False):
    adapters = config.get('adapters', {})
    if app_code in adapters:
        descriptor = dict(adapters[app_code])
    elif app_code == LEGACY_CODE:
        descriptor = {**LEGACY, 'bundle': config.get('retailBundle'), 'hashes': config.get('bundleHashes', {})}
    else:
        raise ValueError('Adapter not installed')
    prefix = descriptor.get('projectPrefix', '')
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}', prefix):
        raise ValueError('Invalid project prefix')
    for other, entry in adapters.items():
        if other != app_code and entry.get('projectPrefix') == prefix:
            raise ValueError('Adapter project prefix collision')
    if app_code != LEGACY_CODE and prefix == 'retail':
        raise ValueError('Legacy prefix reserved')
    weights = descriptor.get('weights', {})
    if not weights or any(not re.fullmatch(r'[a-z][a-z0-9_-]{0,31}', key) or type(value) is not int or value < 1 for key, value in weights.items()):
        raise ValueError('Invalid service resource weights')
    for key in ('appServices', 'healthyServices'):
        values = descriptor.get(key, [])
        if not values or len(set(values)) != len(values) or any(v not in weights for v in values):
            raise ValueError('Invalid service list')
    if not {'postgres', 'api', 'worker', 'caddy'}.issubset(weights):
        raise ValueError('Compose adapter missing required service')
    if type(descriptor.get('minMemoryMb')) is not int or descriptor['minMemoryMb'] < 128:
        raise ValueError('Invalid minimum memory')
    if not descriptor.get('httpChecks') or any(not re.fullmatch(r'/[a-zA-Z0-9/_-]*', value) for value in descriptor['httpChecks']):
        raise ValueError('Invalid health endpoint')
    if verify:
        bundle = Path(descriptor['bundle'])
        if not bundle.is_absolute() or bundle.is_symlink():
            raise ValueError('Absolute trusted bundle required')
        hashes = descriptor['hashes']
        required = REQUIRED_FILES + (() if app_code == LEGACY_CODE and app_code not in adapters else ('deploy/scripts/backup.sh', 'deploy/scripts/backup-metadata.mjs'))
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
    descriptor = resolve_adapter(config, journal.get('appCode', LEGACY_CODE), verify)
    project = project_name(descriptor, directory.name)
    if journal.get('project', project) != project:
        raise ValueError('Instance adapter ownership mismatch')
    return descriptor, project
