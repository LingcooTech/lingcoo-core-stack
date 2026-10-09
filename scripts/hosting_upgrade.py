"""Reviewed runtime-only releases. Never accept executable paths from a platform task."""
import importlib.util,json,re,subprocess,uuid
from pathlib import Path
from hosting_adapter import resolve_adapter,instance_adapter
IMAGE=re.compile(r'[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}')
FIELDS={'id','appCode','label','fromImage','toImage','schemaPolicy','reviewEvidence'}

def release(config,value,verify=True):
    if set(value)!=FIELDS or str(uuid.UUID(value['id']))!=value['id']:raise ValueError('Invalid release identity')
    if value['schemaPolicy']!='no-migration' or not 10<=len(value['reviewEvidence'])<=1000 or not 1<=len(value['label'])<=120:raise ValueError('Reviewed no-migration release required')
    if not all(IMAGE.fullmatch(value[k]) for k in ('fromImage','toImage')) or value['fromImage']==value['toImage']:raise ValueError('Distinct immutable images required')
    resolve_adapter(config,value['appCode'],verify)
    if verify:
        for key in ('fromImage','toImage'):subprocess.run(['docker','image','inspect',value[key]],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
    return dict(value)

def catalog(config):
    rows=[];ids=set()
    if config.get('monitorOnly',True):return rows
    for item in config.get('upgradeReleases',[]):
        if item.get('id') in ids:raise ValueError('Duplicate release ID')
        ids.add(item.get('id'))
        try:rows.append(release(config,item))
        except (ValueError,KeyError,TypeError,OSError,subprocess.SubprocessError):continue
    return rows

def adapter(config,directory):
    descriptor,project=instance_adapter(config,directory,verify=True)
    spec=importlib.util.spec_from_file_location('upgrade_adapter',Path(descriptor['bundle'])/'stack-delivery.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return descriptor,project,module

def runtime_images(config,workspace):
    rows=[]
    for journal in workspace.glob('*/execution.json'):
        try:
            did=str(uuid.UUID(journal.parent.name))
            if json.loads(journal.read_text())['phase']!='runtime_ready':continue
            _,_,module=adapter(config,journal.parent)
            value=module.read_env(journal.parent/'.env')['APP_IMAGE']
            if IMAGE.fullmatch(value):rows.append({'deploymentId':did,'image':value})
        except (ValueError,KeyError,TypeError,OSError):continue
    return rows
