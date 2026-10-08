#!/usr/bin/env python3
"""Central DNS-01 issuer. lego owns ACME; DNS credentials never leave this host."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def issue(path):
    if path.stat().st_mode & 0o077:
        raise ValueError('Private issuer configuration required')
    config = json.loads(path.read_text())
    state = Path(config['statePath']); state.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(state, 0o700)
    with (state / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        credentials_file = Path(config['credentialsFile'])
        if credentials_file.stat().st_mode & 0o077:
            raise ValueError('Private credentials required')
        credentials = json.loads(credentials_file.read_text())
        domain = config['domain']
        if not re.fullmatch(r'(?:[a-z0-9-]+\.)+[a-z]{2,63}', domain):
            raise ValueError('Invalid domain')
        env = {**os.environ, 'EXEC_PATH': config['dnsHook'], 'EXEC_PROPAGATION_TIMEOUT': '600', 'EXEC_SEQUENCE_INTERVAL': '5', 'LINGCOO_CERTIFICATE_CONFIG': str(path)}
        if not credentials.get('secretId') or not credentials.get('secretKey'):
            raise ValueError('Missing DNS credentials')
        command = [config['legoBinary'], 'run', '--accept-tos', '--email', config['email'], '--path', str(state),
                   '--server', 'https://acme-v02.api.letsencrypt.org/directory',
                   '--dns', 'exec', '--dns.resolvers', '119.29.29.29:53', '--dns.propagation.disable-rns',
                   '--domains', domain, '--domains', '*.' + domain]
        cert = state / 'certificates' / (domain + '.crt')
        key = state / 'certificates' / (domain + '.key')
        command += ['--renew-days', '30']
        # Private log, never forwarded into API responses or shared systemd logs.
        with (state / 'issuer.log').open('w') as log:
            subprocess.run(command, env=env, stdout=log, stderr=log, check=True, timeout=1200)
        payload = json.dumps({'certificate': cert.read_text(), 'privateKey': key.read_text()}).encode()
        results = []
        failed = False
        for target in config['targets']:
            if not re.fullmatch(r'[a-zA-Z0-9_.@-]+', target['host']):
                raise ValueError('Invalid target')
            try:
                response = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                    '-o', 'ConnectTimeout=15', '-i', config['sshKey'], '-o', 'UserKnownHostsFile=' + config['knownHosts'],
                    target['host']], input=payload, capture_output=True, check=True, timeout=90)
                results.append({'host': target['host'], 'ok': True, **json.loads(response.stdout)})
            except Exception:
                failed = True
                results.append({'host': target['host'], 'ok': False})
        (state / 'distribution.json').write_text(json.dumps({'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'targets': results}))
        if failed:
            raise RuntimeError('Certificate distribution incomplete')
        print('Wildcard certificate checked and distributed to ' + str(len(results)) + ' gateway(s)')


def status(path, outcome):
    import tempfile
    target = path.parent / 'automation-status.json'
    fd, name = tempfile.mkstemp(dir=target.parent)
    with os.fdopen(fd, 'w') as stream:
        json.dump({'status':outcome,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},stream)
    os.replace(name,target)


if __name__ == '__main__':
    try:
        os.umask(0o077)
        issue(Path(sys.argv[1]))
        status(Path(sys.argv[1]), 'success')
    except Exception as error:
        status(Path(sys.argv[1]), 'failed')
        print('Certificate renewal failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
