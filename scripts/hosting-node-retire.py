#!/usr/bin/env python3
"""Idempotent cold-volume snapshot and stop. Never deletes data or restarts an exited service."""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid
from hosting_adapter import instance_adapter


def store(path, value):
    temporary=path.with_suffix('.tmp')
    with temporary.open('w') as stream:
        os.chmod(temporary,0o600)
        json.dump(value,stream);stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,path)


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def execute(config, directory, operation):
    operation_id=str(uuid.UUID(operation['id']));deployment_id=str(uuid.UUID(directory.name))
    if operation['deploymentId']!=deployment_id or operation['nodeId']!=config['nodeId']:
        raise ValueError('Operation ownership mismatch')
    descriptor, project=instance_adapter(config,directory,verify=True)
    execution_path=directory/'execution.json';execution=json.loads(execution_path.read_text())
    if execution['phase'] not in ('runtime_ready','retiring','retained'):
        raise ValueError('Instance is not ready for retirement')
    if execution.get('exitOperation') not in (None,operation_id):
        raise ValueError('Different retirement operation')
    if not config.get('offsite') or not re.fullmatch(r'[^\s]+@sha256:[a-f0-9]{64}',config.get('snapshotImage','')):
        raise ValueError('Encrypted offsite and pinned snapshot image required')
    subprocess.run(['docker','image','inspect',config['snapshotImage']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).split()
    containers=json.loads(subprocess.check_output(['docker','inspect',*ids])) if ids else []
    expected=set(descriptor['weights'])
    found={}
    for container in containers:
        labels=container['Config']['Labels']
        if labels.get('com.docker.compose.project')!=project or labels.get('com.docker.compose.oneoff','false').lower()!='false':
            raise ValueError('Unexpected project container')
        service=labels.get('com.docker.compose.service')
        if service not in expected or service in found:
            raise ValueError('Unexpected or duplicate service')
        found[service]=container
        for mount in container['Mounts']:
            if mount['Type']=='volume' and mount['Name'] not in [project+'_'+v for v in descriptor['volumes']]:
                raise ValueError('Undeclared data volume')
            if mount['Type']=='bind':
                source=Path(mount['Source']).resolve()
                if directory.resolve() not in source.parents:
                    raise ValueError('External bind mount cannot be handed over')
                relative=str(source.relative_to(directory.resolve()))
                if mount.get('RW',True) or relative not in descriptor['files']:
                    raise ValueError('Writable or undeclared bind mount cannot be snapshotted safely')
    if set(found)!=expected:
        raise ValueError('Missing project service')
    for volume in descriptor['volumes']:
        metadata=json.loads(subprocess.check_output(['docker','volume','inspect',project+'_'+volume]))[0]
        labels=metadata.get('Labels') or {}
        if labels.get('com.docker.compose.project')!=project or labels.get('com.docker.compose.volume')!=volume:
            raise ValueError('Volume ownership mismatch')
        shared=subprocess.check_output(['docker','ps','-aq','--filter','volume='+project+'_'+volume],text=True).split()
        if any(cid not in {c['Id'][:len(cid)] for c in containers} for cid in shared):
            raise ValueError('Volume is referenced outside this instance')
    # All ownership checks precede side effects. Global agent lock excludes local backups and ingress updates.
    already_retained=execution['phase']=='retained'
    execution.update(phase='retiring',exitOperation=operation_id);store(execution_path,execution)
    subprocess.run(['docker','update','--restart=no',*ids],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    subprocess.run(['docker','stop','--time','60',*ids],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=300)
    states=json.loads(subprocess.check_output(['docker','inspect',*ids]))
    if any(c['State']['Running'] or c['State'].get('Restarting') for c in states):
        raise ValueError('Stop is not confirmed')
    record=directory/'exit-status.json'
    state=json.loads(record.read_text()) if record.exists() else {'stoppedAt':utc()}
    store(record,state)
    backup_id=deployment_id+'-exit-'+operation_id
    root=Path(config['backupRoot']);root.mkdir(mode=0o700,parents=True,exist_ok=True)
    backup=root/backup_id
    if backup.is_symlink():raise ValueError('Symlink backup refused')
    backup.mkdir(mode=0o700,exist_ok=True);os.chmod(backup,0o700)
    if already_retained and state.get('manifestSha256') and hashlib.sha256((backup/'SHA256SUMS').read_bytes()).hexdigest()==state['manifestSha256']:
        subprocess.run(['sha256sum','--check','SHA256SUMS'],cwd=backup,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        execution['phase']='retained';store(execution_path,execution)
        return state
    # A retry rewrites the same cold snapshot while the application remains stopped.
    checksums=[]
    for volume in descriptor['volumes']:
        name=project+'_'+volume
        metadata=json.loads(subprocess.check_output(['docker','volume','inspect',name]))[0]
        labels=metadata.get('Labels') or {}
        if labels.get('com.docker.compose.project')!=project or labels.get('com.docker.compose.volume')!=volume:
            raise ValueError('Volume ownership mismatch')
        path=backup/(volume+'.tar')
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as stream:
            subprocess.run(['docker','run','--rm','--network','none','--read-only','--user','0:0','-v',name+':/source:ro','--entrypoint','tar',config['snapshotImage'],'-C','/source','-cpf','-','.'],stdout=stream,stderr=subprocess.DEVNULL,check=True,timeout=1800)
        subprocess.run(['tar','-tf',str(path)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        checksums.append(path.name)
    for name in set(['.env','limits.json','execution.json',*descriptor['files']]):
        source=directory/name;target=backup/name
        if source.is_symlink() or target.is_symlink():raise ValueError('Symlink artifact refused')
        target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        shutil.copyfile(source,target);os.chmod(target,0o600);checksums.append(name)
    manifest={'format':'lingcoo-cold-volumes-v1','deploymentId':deployment_id,'operationId':operation_id,'project':project,'appCode':execution['appCode'],'stoppedAt':state['stoppedAt'],'volumes':descriptor['volumes'],'images':{s:{'id':c['Image'],'digests':json.loads(subprocess.check_output(['docker','image','inspect',c['Image']]))[0].get('RepoDigests',[])} for s,c in found.items()}}
    store(backup/'manifest.json',manifest);checksums.append('manifest.json')
    def digest(path):
        checksum=hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b''):checksum.update(chunk)
        return checksum.hexdigest()
    (backup/'SHA256SUMS').write_text(''.join(digest(backup/name)+'  '+name+'\n' for name in sorted(checksums)))
    subprocess.run(['sha256sum','--check','SHA256SUMS'],cwd=backup,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    spec=importlib.util.spec_from_file_location('backup',Path(__file__).with_name('hosting-node-backup.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.offsite(config,backup,deployment_id)
    proof={'backupId':backup_id,'manifestSha256':digest(backup/'SHA256SUMS'),'stoppedAt':state['stoppedAt'],'offsiteAt':utc()}
    store(record,proof)
    execution['phase']='retained';store(execution_path,execution)
    return proof
