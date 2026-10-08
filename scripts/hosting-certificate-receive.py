#!/usr/bin/env python3
"""Restricted SSH command: accepts only a validated platform wildcard certificate."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def run(args, **kwargs):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL, timeout=30, **kwargs)


def inspect_certificate(cert, key, domain):
    if not re.fullmatch(r'(?:[a-z0-9-]+\.)+[a-z]{2,63}', domain):
        raise ValueError('Invalid certificate scope')
    sans = run(['openssl', 'x509', '-in', str(cert), '-noout', '-ext', 'subjectAltName']).decode()
    names = set(re.findall(r'DNS:([^,\s]+)', sans))
    if '*.' + domain not in names or not names <= {domain, '*.' + domain}:
        raise ValueError('Certificate outside configured scope')
    public = run(['openssl', 'x509', '-in', str(cert), '-pubkey', '-noout'])
    key_public = run(['openssl', 'pkey', '-in', str(key), '-pubout'])
    if public != key_public:
        raise ValueError('Certificate/key mismatch')
    run(['openssl', 'verify', '-untrusted', str(cert), str(cert)])
    run(['openssl', 'x509', '-in', str(cert), '-checkend', '604800', '-noout'])
    end = run(['openssl', 'x509', '-in', str(cert), '-enddate', '-noout']).decode().strip().split('=', 1)[1]
    expires = datetime.datetime.strptime(end, '%b %d %H:%M:%S %Y %Z').replace(tzinfo=datetime.timezone.utc)
    der = run(['openssl', 'x509', '-in', str(cert), '-outform', 'DER'])
    return {'domain': '*.' + domain, 'fingerprint': hashlib.sha256(der).hexdigest(),
            'expiresAt': expires.isoformat(), 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}


def receive(config, payload):
    gateway = config['gatewayContainer']
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', gateway):
        raise ValueError('Invalid gateway')
    mounts = json.loads(run(['docker', 'inspect', '-f', '{{json .Mounts}}', gateway]))
    volume = next(m for m in mounts if m['Destination'] == '/data' and m['Type'] == 'volume')
    root = Path(volume['Source']) / 'lingcoo-platform-tls'
    root.mkdir(mode=0o700, exist_ok=True)
    os.chmod(root, 0o700)
    with (root / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with tempfile.TemporaryDirectory(dir=root, prefix='candidate-') as tmp:
            cert, key = Path(tmp) / 'fullchain.pem', Path(tmp) / 'privkey.pem'
            for path, field in [(cert, 'certificate'), (key, 'privateKey')]:
                path.write_text(payload[field]); os.chmod(path, 0o600)
            meta = inspect_certificate(cert, key, config['domain'])
            target = root / meta['fingerprint']
            if not target.exists():
                target.mkdir(mode=0o700)
                for p in [cert, key]:
                    (target / p.name).write_bytes(p.read_bytes()); os.chmod(target / p.name, 0o600)
            current = root / 'current'
            old = os.readlink(current) if current.is_symlink() else None
            # Always retry reload: a previous process may have died after pointer replacement.
            pending = root / 'next'
            pending.unlink(missing_ok=True); pending.symlink_to(target.name); os.replace(pending, current)
            try:
                run(['docker', 'exec', gateway, 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
                run(['docker', 'exec', gateway, 'caddy', 'reload', '--force', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
            except Exception:
                if old:
                    pending.symlink_to(old); os.replace(pending, current)
                    run(['docker', 'exec', gateway, 'caddy', 'reload', '--force', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
                else:
                    current.unlink(missing_ok=True)
                raise
            (root / 'status.json').write_text(json.dumps(meta))
            os.chmod(root / 'status.json', 0o600)
            print(json.dumps(meta))


if __name__ == '__main__':
    try:
        os.umask(0o077)
        config_file = Path(sys.argv[1])
        if config_file.stat().st_mode & 0o077:
            raise ValueError('Private receiver configuration required')
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError('Oversize certificate payload')
        receive(json.loads(config_file.read_text()), json.loads(raw))
    except Exception as error:
        print('Certificate installation failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
