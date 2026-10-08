#!/usr/bin/env python3
"""lego exec hook limited to the configured challenge; uses the existing official SDK."""
import json
import os
from pathlib import Path
import subprocess
import sys

if __name__ == '__main__':
    try:
        path=Path(os.environ['LINGCOO_CERTIFICATE_CONFIG'])
        if path.stat().st_mode & 0o077:raise ValueError('Private configuration required')
        config=json.loads(path.read_text());secret=Path(config['credentialsFile'])
        if secret.stat().st_mode & 0o077:raise ValueError('Private credentials required')
        action,fqdn,value=sys.argv[1:]
        if action not in ('present','cleanup') or fqdn!='_acme-challenge.'+config['domain']+'.':raise ValueError('Challenge outside permitted name')
        image=subprocess.check_output(['docker','inspect','-f','{{.Image}}',config['sdkContainer']],text=True).strip()
        data={'action':action,'fqdn':fqdn,'value':value,'zone':config['zone'],'domain':config['domain'],'credentials':json.loads(secret.read_text())}
        subprocess.run(['docker','run','--rm','-i','--read-only','--memory','128m','--pids-limit','64','--cap-drop','ALL',
            '--security-opt','no-new-privileges','-v',str(Path(__file__).with_suffix('.cjs'))+':/hook.cjs:ro',image,'node','/hook.cjs'],
            input=json.dumps(data).encode(),check=True,timeout=90,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    except Exception as error:
        print('DNS challenge failed: '+type(error).__name__,file=sys.stderr);sys.exit(1)
