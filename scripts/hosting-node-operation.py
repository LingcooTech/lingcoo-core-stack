#!/usr/bin/env python3
"""Whitelisted, journaled operations. Must run while holding the node agent lock."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time
import uuid
from hosting_adapter import instance_adapter


def store(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value)); os.chmod(temporary, 0o600)
    with temporary.open('r+') as stream:
        stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary, path)


def execute(config, workspace, operation, api=None):
    operation_id, deployment_id = str(uuid.UUID(operation['id'])), str(uuid.UUID(operation['deploymentId']))
    if operation['kind'] not in ('restart', 'backup', 'retire', 'export', 'reclaim') or operation['nodeId'] != config['nodeId']:
        raise ValueError('Unsupported operation')
    directory = workspace / deployment_id
    if operation['kind'] in ('export','reclaim'):
        if api is None:raise ValueError('Authenticated API callback required')
        name='hosting-node-handover.py' if operation['kind']=='export' else 'hosting-node-reclaim.py'
        spec=importlib.util.spec_from_file_location('delivery_operation',Path(__file__).with_name(name));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        try:
            result=module.execute(config,directory if operation['kind']=='export' else workspace,operation,api)
            return result if operation['kind']=='reclaim' else True
        except Exception:return False
    if operation['kind']=='retire':
        spec=importlib.util.spec_from_file_location('retire',Path(__file__).with_name('hosting-node-retire.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        try:
            module.execute(config,directory,operation)
            return True
        except Exception:
            return False
    if directory.is_symlink() or json.loads((directory / 'execution.json').read_text())['phase'] != 'runtime_ready':
        raise ValueError('Instance is not owned and ready')
    records = directory / 'operations'; records.mkdir(mode=0o700, exist_ok=True)
    journal = records / (operation_id + '.json')
    if journal.exists():
        state = json.loads(journal.read_text())['state']
        # Re-delivery after response loss reuses completion. An interrupted action is not repeated.
        return state == 'succeeded'
    store(journal, {'state':'running', 'kind':operation['kind']})
    try:
        descriptor, project = instance_adapter(config, directory, verify=True)
        if operation['kind'] == 'backup':
            spec=importlib.util.spec_from_file_location('backup',Path(__file__).with_name('hosting-node-backup.py'))
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            module.backup_one(config, directory)
        else:
            ids = subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).split()
            containers=json.loads(subprocess.check_output(['docker','inspect',*ids])) if ids else []
            targets=[]
            for service in descriptor['appServices']:
                matches=[c for c in containers if c['Config']['Labels'].get('com.docker.compose.service')==service and c['Config']['Labels'].get('com.docker.compose.oneoff','False').lower()=='false']
                if len(matches)!=1:
                    raise ValueError('Service ownership mismatch')
                targets.append(matches[0]['Id'])
            subprocess.run(['docker','restart','--time','45',*targets],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=180)
            for _ in range(60):
                states=json.loads(subprocess.check_output(['docker','inspect',*targets]))
                if all(c['State']['Running'] and (c['Config']['Labels'].get('com.docker.compose.service') not in descriptor['healthyServices'] or c['State'].get('Health',{}).get('Status')=='healthy') for c in states):
                    break
                time.sleep(2)
            else:
                raise RuntimeError('Restart health deadline exceeded')
        store(journal, {'state':'succeeded','kind':operation['kind']})
        return True
    except Exception:
        store(journal, {'state':'failed','kind':operation['kind']})
        return False
