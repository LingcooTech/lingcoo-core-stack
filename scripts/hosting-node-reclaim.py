#!/usr/bin/env python3
"""Idempotent reclamation of stopped, owned local runtime resources; keeps offsite backups."""
import datetime,importlib.util,json,os,shutil,subprocess,uuid
from pathlib import Path
from hosting_adapter import instance_adapter


def store(path,value):
    temp=path.with_suffix('.tmp')
    with temp.open('w') as f:os.chmod(temp,0o600);json.dump(value,f);f.flush();os.fsync(f.fileno())
    os.replace(temp,path)


def execute(config,workspace,operation,api):
    op=str(uuid.UUID(operation['id']));did=str(uuid.UUID(operation['deploymentId']))
    if operation['nodeId']!=config['nodeId']:raise ValueError('Node mismatch')
    records=workspace/'.reclamations';records.mkdir(mode=0o700,exist_ok=True)
    if records.is_symlink():raise ValueError('Symlink journal')
    path=records/(op+'.json');remote=api('operations/'+op+'/data');directory=workspace/did
    if datetime.datetime.fromisoformat(remote['retainUntil'])>datetime.datetime.now(datetime.timezone.utc):raise ValueError('Retention has not elapsed')
    if path.exists():
        record=json.loads(path.read_text())
        if record['deploymentId']!=did or record['operationId']!=op:raise ValueError('Journal ownership mismatch')
        if record.get('proof'):return record['proof']
    else:
        spec=importlib.util.spec_from_file_location('handover',Path(__file__).with_name('hosting-node-handover.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        module.snapshot(config,directory,remote['exitEvidence'])
        descriptor,project=instance_adapter(config,directory,verify=True)
        ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).split()
        containers=json.loads(subprocess.check_output(['docker','inspect',*ids])) if ids else []
        if len(containers)!=len(descriptor['weights']):raise ValueError('Project service inventory incomplete')
        found=set()
        for c in containers:
            labels=c['Config']['Labels'];service=labels.get('com.docker.compose.service')
            if labels.get('com.docker.compose.project')!=project or service not in descriptor['weights'] or service in found or c['State']['Running'] or c['State'].get('Restarting'):raise ValueError('Unexpected or running container')
            found.add(service)
            for m in c['Mounts']:
                if m['Type']=='volume' and m['Name'] not in [project+'_'+v for v in descriptor['volumes']]:raise ValueError('Foreign volume')
                if m['Type']=='bind' and (m.get('RW',True) or directory.resolve() not in Path(m['Source']).resolve().parents):raise ValueError('Unsafe bind mount')
        full_ids=[c['Id'] for c in containers];volumes=[project+'_'+v for v in descriptor['volumes']]
        for name in volumes:
            m=json.loads(subprocess.check_output(['docker','volume','inspect',name]))[0];labels=m.get('Labels') or {}
            if labels.get('com.docker.compose.project')!=project or project+'_'+labels.get('com.docker.compose.volume','')!=name:raise ValueError('Volume ownership mismatch')
            refs=subprocess.check_output(['docker','ps','-aq','--filter','volume='+name],text=True).split()
            if any(not any(cid.startswith(r) for cid in full_ids) for r in refs):raise ValueError('Shared volume cannot be removed')
        record={'deploymentId':did,'operationId':op,'project':project,'containers':full_ids,'volumes':volumes,'backupId':remote['exitEvidence']['backupId']};store(path,record)
    # No --force: a container started after preflight causes a safe failure, not a forced stop.
    for cid in record['containers']:
        result=subprocess.run(['docker','inspect',cid],capture_output=True,text=True)
        if result.returncode:
            if 'No such object' not in result.stderr:raise ValueError('Docker inspect failed')
            continue
        c=json.loads(result.stdout)[0]
        if c['Config']['Labels'].get('com.docker.compose.project')!=record['project'] or c['State']['Running']:raise ValueError('Container ownership/state changed')
        subprocess.run(['docker','rm',cid],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for name in record['volumes']:
        result=subprocess.run(['docker','volume','inspect',name],capture_output=True,text=True)
        if result.returncode:
            if 'no such volume' not in result.stderr.lower():raise ValueError('Volume inspect failed')
            continue
        labels=json.loads(result.stdout)[0].get('Labels') or {}
        if labels.get('com.docker.compose.project')!=record['project']:raise ValueError('Volume ownership changed')
        subprocess.run(['docker','volume','rm',name],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+record['project']],text=True).strip():raise ValueError('Unexpected project containers remain')
    tombstone=records/(op+'.data')
    if directory.exists():
        if directory.is_symlink():raise ValueError('Symlink instance refused')
        execution=json.loads((directory/'execution.json').read_text())
        if execution.get('phase')!='retained' or execution.get('exitOperation')!=record['backupId'].split('-exit-')[1]:raise ValueError('Instance identity changed')
        if tombstone.exists():raise ValueError('Reclamation tombstone conflict')
        os.rename(directory,tombstone)
    if tombstone.exists():
        if tombstone.is_symlink():raise ValueError('Symlink tombstone refused')
        shutil.rmtree(tombstone)
    proof={'deploymentId':did,'operationId':op,'backupId':record['backupId'],'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'removedContainers':record['containers'],'removedVolumes':record['volumes']}
    record['proof']=proof;store(path,record);return proof
