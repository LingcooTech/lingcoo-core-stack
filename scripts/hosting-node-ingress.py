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


def route_block(deployment_id, hostname):
    uuid.UUID(deployment_id)
    if not re.fullmatch(r'[a-z][a-z0-9-]*\.[a-z0-9.-]+', hostname) or '..' in hostname:
        raise ValueError('Invalid ingress hostname')
    upstream = 'retail-' + deployment_id.replace('-', '') + '-ingress'
    return ('# BEGIN LINGCOO ' + deployment_id + '\n' + hostname + ' {\n'
            '  header X-Lingcoo-Deployment ' + deployment_id + '\n'
            '  reverse_proxy ' + upstream + ':80\n}\n'
            '# END LINGCOO ' + deployment_id + '\n')


def publish(config, workspace, item):
    deployment_id = str(uuid.UUID(item['deploymentId']))
    journal = json.loads((workspace / deployment_id / 'execution.json').read_text())
    if journal['phase'] != 'runtime_ready':
        raise ValueError('Instance is not locally ready')
    path = Path(config['gatewayConfigPath'])
    gateway = config['gatewayContainer']
    if not path.is_absolute() or not re.fullmatch(r'[a-zA-Z0-9_-]+', gateway):
        raise ValueError('Invalid gateway configuration')
    old = path.read_text()
    start = '# BEGIN LINGCOO ' + deployment_id + '\n'
    end = '# END LINGCOO ' + deployment_id + '\n'
    block = route_block(deployment_id, item['hostname'])
    if start in old:
        left = old.index(start)
        right = old.index(end, left) + len(end)
        candidate = old[:left] + block + old[right:]
    else:
        # Refuse to take over a hostname already configured outside this owned block.
        if item['hostname'] in old:
            raise ValueError('Hostname already exists outside managed route')
        candidate = old.rstrip() + '\n\n' + block
    network = 'retail-' + deployment_id.replace('-', '') + '-ingress'
    networks = json.loads(subprocess.check_output(['docker', 'inspect', '-f', '{{json .NetworkSettings.Networks}}', gateway]))
    if network not in networks:
        subprocess.run(['docker', 'network', 'connect', network, gateway], check=True, capture_output=True)
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
