#!/usr/bin/env python3
"""Quiesced backups, encrypted off-host copies and bounded retention of owned instances."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid
from hosting_adapter import instance_adapter


def store(path, value):
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=path.name+'.')
    with os.fdopen(fd,'w') as stream:
        json.dump(value,stream);stream.flush();os.fsync(stream.fileno())
    os.replace(name,path)


def offsite(config, backup, deployment_id):
    options = config['offsite']
    password = Path(options['passwordFile'])
    if password.stat().st_mode & 0o077:
        raise ValueError('Private backup password required')
    env = {**os.environ,'RESTIC_REPOSITORY':options['repository'],'RESTIC_PASSWORD_FILE':str(password),'GOMEMLIMIT':'256MiB','GOGC':'50'}
    cache = Path(config['backupRoot'])/'.restic-cache';cache.mkdir(mode=0o700,exist_ok=True)
    command = [options['binary'], '--cache-dir', str(cache), '-o', 'sftp.command='+options['sftpCommand']]
    # Never publish raw backup output: it contains paths and may contain SSH errors.
    log_path = Path(config['backupRoot'])/'offsite-private.log'
    fd=os.open(log_path,os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as log:
        subprocess.run(command+['backup','--tag','deployment:'+deployment_id,str(backup)],env=env,stdout=log,stderr=log,check=True,timeout=1800)
        subprocess.run(command+['forget','--group-by','tags','--tag','deployment:'+deployment_id,
            '--keep-daily','7','--keep-weekly','4','--keep-monthly','3','--prune'],env=env,stdout=log,stderr=log,check=True,timeout=1800)


def backup_one(config, directory):
    deployment_id = str(uuid.UUID(directory.name))
    if directory.is_symlink() or json.loads((directory/'execution.json').read_text())['phase']!='runtime_ready':
        raise ValueError('Owned ready instance required')
    descriptor, project = instance_adapter(config, directory, verify=True)
    root = Path(config['backupRoot']);root.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(root,0o700)
    status_path = directory/'backup-status.json'
    state = json.loads(status_path.read_text()) if status_path.exists() else {'deploymentId':deployment_id,'completedAt':None,'status':'never','offsiteAt':None,'offsiteStatus':'not_configured'}
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup=root/(deployment_id+'-'+stamp)
    try:
        subprocess.run(['sh',str(Path(descriptor['bundle'])/'deploy/scripts/backup.sh'),str(directory),project,str(backup)],check=True,timeout=900,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for name in ('limits.json','execution.json'):
            shutil.copyfile(directory/name,backup/name);os.chmod(backup/name,0o600)
            with (backup/'SHA256SUMS').open('a') as stream:
                stream.write(hashlib.sha256((backup/name).read_bytes()).hexdigest()+'  '+name+'\n')
        subprocess.run(['sha256sum','--check','SHA256SUMS'],cwd=backup,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        (backup/'HOSTING_COMPLETE').touch(mode=0o600)
        state.update(status='success',completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),offsiteStatus='pending' if config.get('offsite') else 'not_configured')
        store(status_path,state)
    except Exception:
        state['status']='failed';store(status_path,state);raise
    if config.get('offsite'):
        try:
            offsite(config,backup,deployment_id)
            state.update(offsiteStatus='success',offsiteAt=datetime.datetime.now(datetime.timezone.utc).isoformat());store(status_path,state)
        except Exception:
            state['offsiteStatus']='failed';store(status_path,state);raise
        # Delete only completed owned backups older than 14 days after a successful off-host copy.
        cutoff=datetime.datetime.now(datetime.timezone.utc).timestamp()-14*86400
        for old in root.glob(deployment_id+'-*'):
            if old.is_dir() and not old.is_symlink() and (old/'HOSTING_COMPLETE').exists() and old.stat().st_mtime<cutoff:
                shutil.rmtree(old)
    print('Verified backup created for '+deployment_id)


def main():
    path=Path(sys.argv[1])
    if path.stat().st_mode & 0o077:
        raise ValueError('Private node config required')
    config=json.loads(path.read_text());workspace=Path(config['workspace'])
    if config.get('monitorOnly'):
        print('Monitor-only node has no managed backups');return
    with (workspace/'.agent.lock').open('a') as lock:
        # Wait for an in-flight deployment; systemd bounds this job to one hour.
        fcntl.flock(lock,fcntl.LOCK_EX)
        failures=0
        for journal in workspace.glob('*/execution.json'):
            if json.loads(journal.read_text()).get('phase')!='runtime_ready':continue
            _, project = instance_adapter(config, journal.parent)
            if not subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service=api']).strip():continue
            try:backup_one(config,journal.parent)
            except Exception:failures+=1
        if failures:raise RuntimeError('One or more managed backups failed')

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Hosting backup failed: '+type(error).__name__,file=sys.stderr);sys.exit(1)
