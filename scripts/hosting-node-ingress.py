#!/usr/bin/env python3
"""Idempotent, validated Caddy routes for platform-owned hostnames; credentials stay in Stack."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid
from hosting_adapter import instance_adapter


def route_block(deployment_id, hostname, aliases=(), wildcard_domain=None, project=None, ingress_port=80):
    uuid.UUID(deployment_id)
    if not re.fullmatch(r'[a-z][a-z0-9-]*\.[a-z0-9.-]+', hostname) or '..' in hostname:
        raise ValueError('Invalid ingress hostname')
    names = [hostname] + list(aliases)
    for name in names:
        if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', name):
            raise ValueError('Invalid alias')
    if not project:
        raise ValueError('Explicit adapter project required')
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}-[a-f0-9]{32}', project):
        raise ValueError('Invalid ingress project')
    upstream = project + '-ingress'
    def site(hosts, tls=False):
        return (', '.join(hosts) + ' {\n'
                + ('  tls /data/lingcoo-platform-tls/current/fullchain.pem /data/lingcoo-platform-tls/current/privkey.pem\n' if tls else '')
                + '  header X-Lingcoo-Deployment ' + deployment_id + '\n'
                + '  reverse_proxy ' + upstream + ':' + str(ingress_port) + '\n}\n')
    if wildcard_domain:
        if not hostname.endswith('.' + wildcard_domain) or '.' in hostname[:-(len(wildcard_domain) + 1)]:
            raise ValueError('Default hostname outside wildcard certificate')
        # Custom domains must keep their own certificate automation.
        content = site([hostname], True) + (site(list(aliases)) if aliases else '')
    else:
        content = site(names)
    return '# BEGIN LINGCOO ' + deployment_id + '\n' + content + '# END LINGCOO ' + deployment_id + '\n'


def publish(config, workspace, item):
    deployment_id = str(uuid.UUID(item['deploymentId']))
    journal = json.loads((workspace / deployment_id / 'execution.json').read_text())
    if journal['phase'] != 'runtime_ready':
        raise ValueError('Instance is not locally ready')
    descriptor, project = instance_adapter(config, workspace / deployment_id, verify=True)
    path = Path(config['gatewayConfigPath'])
    gateway = config['gatewayContainer']
    if not path.is_absolute() or not re.fullmatch(r'[a-zA-Z0-9_-]+', gateway):
        raise ValueError('Invalid gateway configuration')
    old = path.read_text()
    start = '# BEGIN LINGCOO ' + deployment_id + '\n'
    end = '# END LINGCOO ' + deployment_id + '\n'
    aliases = [entry['hostname'] for entry in item.get('aliases', [])]
    block = route_block(deployment_id, item['hostname'], aliases, config.get('wildcardDomain'), project, descriptor['ingressPort'])
    if start in old:
        left = old.index(start)
        right = old.index(end, left) + len(end)
        candidate = old[:left] + block + old[right:]
    else:
        # Refuse to take over a hostname already configured outside this owned block.
        if item['hostname'] in old:
            raise ValueError('Hostname already exists outside managed route')
        candidate = old.rstrip() + '\n\n' + block
    outside = old
    if start in old:
        outside = old[:old.index(start)] + old[old.index(end, old.index(start)) + len(end):]
    if any(name in outside for name in [item['hostname']] + aliases):
        raise ValueError('Hostname exists outside owned block')
    network = project + '-ingress'
    networks = json.loads(subprocess.check_output(['docker', 'inspect', '-f', '{{json .NetworkSettings.Networks}}', gateway]))
    if network not in networks:
        subprocess.run(['docker', 'network', 'connect', network, gateway], check=True, capture_output=True)
    # Identical desired routes need no reload or application restart.
    if candidate == old:
        return
    sync_origins(workspace / deployment_id, deployment_id, [item['hostname']] + aliases, project, descriptor)
    # Validate before touching the host's live config or performing a graceful reload.
    with tempfile.TemporaryDirectory(prefix='lingcoo-ingress-') as temporary:
        source = Path(temporary) / 'Caddyfile'
        source.write_text(candidate)
        container_path = '/tmp/lingcoo-ingress-' + hashlib.sha256(candidate.encode()).hexdigest()[:20]
        subprocess.run(['docker', 'cp', str(source), gateway + ':' + container_path], check=True, capture_output=True)
        try:
            subprocess.run(['docker', 'exec', gateway, 'caddy', 'validate', '--config', container_path, '--adapter', 'caddyfile'], check=True, capture_output=True, timeout=30)
            if path.read_text() != old:
                raise ValueError('Gateway changed concurrently; retry')
            if candidate != old:
                backup = workspace / ('gateway-before-' + deployment_id)
                if not backup.exists():
                    backup.write_text(old)
                    os.chmod(backup, 0o600)
                # Existing gateway may bind-mount a single file: preserve its inode.
                with path.open('r+') as stream:
                    stream.write(candidate)
                    stream.truncate()
                    stream.flush()
                    os.fsync(stream.fileno())
            try:
                subprocess.run(['docker', 'exec', gateway, 'caddy', 'reload', '--config', container_path, '--adapter', 'caddyfile'], check=True, capture_output=True, timeout=30)
            except Exception:
                path.write_text(old)
                raise
        finally:
            subprocess.run(['docker', 'exec', gateway, 'rm', '-f', container_path], capture_output=True)


def sync_origins(directory, deployment_id, hostnames, project, descriptor):
    """Keep application browser API requests working on all verified aliases."""
    variable = descriptor['originVariable']
    if variable is None:
        return
    path = directory / '.env'
    old = path.read_text()
    value = variable + "='" + ','.join('https://' + name for name in hostnames) + "'"
    lines = old.splitlines()
    updated = '\n'.join(value if line.startswith(variable + '=') else line for line in lines) + '\n'
    if updated == old:
        return
    if not any(line.startswith(variable + '=') for line in lines):
        raise ValueError('Missing original CORS setting')
    path.write_text(updated)
    os.chmod(path, 0o600)
    prefix = ['docker', 'compose'] if subprocess.run(['docker', 'compose', 'version'], capture_output=True).returncode == 0 else ['docker-compose']
    command = prefix + ['-p', project, '--env-file', str(path), '-f', str(directory / 'docker-compose.prod.yml'), '-f', str(directory / 'limits.json')]
    try:
        subprocess.run(command + ['up', '-d', '--no-deps', *descriptor['originServices']], cwd=directory, capture_output=True, check=True, timeout=180)
    except Exception:
        path.write_text(old)
        raise
