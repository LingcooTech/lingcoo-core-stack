"""Real PostgreSQL cold backup -> pinned Restic download -> quarantined recovery.
prepare/verify can run on different machines. Only UUID-owned fixtures are touched.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'scripts'))


def load(name):
    spec = importlib.util.spec_from_file_location(name, root / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


recover = load('hosting-node-recover')
fetcher = load('hosting-recovery-fetch')
retire = load('hosting-node-retire')


def docker(args, **kw):
    return subprocess.check_output(['docker', *args], stderr=subprocess.DEVNULL, timeout=180, **kw)


def wait_pg(cid):
    for _ in range(60):
        if subprocess.run(['docker', 'exec', cid, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            return
        time.sleep(1)
    raise AssertionError('Isolated PostgreSQL did not start')


def prepare(stage):
    stage.mkdir(mode=0o700, parents=True, exist_ok=True)
    image = os.environ.get('STACK_RECOVERY_IMAGE', 'postgres:17-alpine')
    if not os.environ.get('STACK_RECOVERY_IMAGE'):
        subprocess.run(['docker', 'pull', image], check=True, stdout=subprocess.DEVNULL)
    image = json.loads(docker(['image', 'inspect', image]))[0]['RepoDigests'][0]
    did = str(uuid.uuid4())
    oid = str(uuid.uuid4())
    project = 'recoveryfixture-' + did.replace('-', '')
    directory = stage / did
    directory.mkdir(mode=0o700)
    bundle = stage / 'bundle'
    bundle.mkdir()
    compose = 'services:\n  database:\n    image: ${APP_IMAGE}\n    volumes:\n      - data:/var/lib/postgresql/data\n      - files:/fixtures\nvolumes:\n  data:\n  files:\n'
    (bundle / 'docker-compose.prod.yml').write_text(compose)
    (bundle / 'backup.sh').write_text('#!/bin/sh\nexit 1\n')
    (bundle / 'stack-delivery.py').write_text('# Cold recovery fixture: no install or init hooks.\n')
    descriptor = {'protocolVersion': 2, 'projectPrefix': 'recoveryfixture', 'weights': {'database': 1},
                  'appServices': ['database'], 'healthyServices': [], 'infrastructureServices': [],
                  'infrastructureHealthyServices': [], 'originServices': [], 'originVariable': None,
                  'ingressService': 'database', 'ingressPort': 5432, 'httpChecks': ['/'], 'minMemoryMb': 128,
                  'volumes': ['data', 'files'], 'imageVariables': ['APP_IMAGE'], 'initialization': [],
                  'files': ['docker-compose.prod.yml'], 'backupScript': 'backup.sh', 'bundle': str(bundle),
                  'hashes': {p.name: recover.digest(p) for p in bundle.iterdir()}}
    password = stage / 'restic-password'
    password.write_text('isolated-recovery-test-only')
    password.chmod(0o600)
    config = {'nodeId': str(uuid.uuid4()), 'adapters': {'recovery_fixture': descriptor}, 'snapshotImage': image,
              'backupRoot': str(stage / 'backups'), 'offsite': {'binary': os.environ.get('RESTIC_BINARY', 'restic'),
              'passwordFile': str(password), 'repository': str(stage / 'restic'), 'sftpCommand': 'false'}}
    o = config['offsite']
    def restic(args):
        return subprocess.check_output([o['binary'], '--no-cache', '-o', 'sftp.command=' + o['sftpCommand'], *args],
                                      env={**os.environ, 'RESTIC_REPOSITORY': o['repository'], 'RESTIC_PASSWORD_FILE': o['passwordFile'], 'GOMEMLIMIT': '256MiB'}, stderr=subprocess.DEVNULL, timeout=180)
    restic(['init'])
    volumes = [project + '_' + v for v in descriptor['volumes']]
    cid = None
    snapshot_id = None
    try:
        for key, name in zip(descriptor['volumes'], volumes):
            docker(['volume', 'create', '--label', 'com.docker.compose.project=' + project, '--label', 'com.docker.compose.volume=' + key, name])
        cid = docker(['run', '-d', '--network', 'none', '--memory', '192m', '--cpus', '0.5',
                      '--label', 'com.docker.compose.project=' + project, '--label', 'com.docker.compose.service=database',
                      '-e', 'POSTGRES_PASSWORD=fixture-only', '-v', volumes[0] + ':/var/lib/postgresql/data', '-v', volumes[1] + ':/fixtures', image], text=True).strip()
        wait_pg(cid)
        docker(['exec', cid, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
                "CREATE TABLE recovery_orders AS SELECT n AS id, n*13 AS amount, '隔离恢复'::text AS note FROM generate_series(1,50) n;"])
        docker(['exec', cid, 'sh', '-c', 'printf "customer-file-integrity\\n" > /fixtures/proof.txt; chmod 640 /fixtures/proof.txt'])
        shutil.copyfile(bundle / 'docker-compose.prod.yml', directory / 'docker-compose.prod.yml')
        (directory / '.env').write_text('APP_IMAGE=' + image + '\n')
        (directory / 'limits.json').write_text('{}')
        recover.store(directory / 'execution.json', {'phase': 'runtime_ready', 'appCode': 'recovery_fixture', 'project': project})
        proof = retire.execute(config, directory, {'id': oid, 'deploymentId': did, 'nodeId': config['nodeId']})
        backup = Path(config['backupRoot']) / proof['backupId']
        snapshots = json.loads(restic(['snapshots', '--json', '--tag', 'deployment:' + did]))
        matching = [s for s in snapshots if s['paths'] == [str(backup)] and s.get('tags') == ['deployment:' + did]]
        assert len(matching) == 1
        snapshot_id = matching[0]['id']
        target = {**config, 'nodeId': str(uuid.uuid4())}
        plan = {'id': str(uuid.uuid4()), 'deploymentId': did, 'sourceOperationId': oid, 'targetNodeId': target['nodeId'], 'manifestSha256': proof['manifestSha256'], 'maxBytes': 512 * 1024**2}
        downloaded = fetcher.fetch(target, plan, snapshot_id, str(backup), stage / 'download')
        # Portable fixture config contains no production offsite credentials or executable restore hooks.
        target.pop('offsite')
        target.pop('backupRoot')
        recover.store(stage / 'config.json', target)
        recover.store(stage / 'plan.json', plan)
        recover.store(stage / 'source-evidence.json', {**downloaded, 'realEncryptedRestic': True, 'productionRepositoryUsed': False, 'sourceStopped': True})
        print(json.dumps({'prepared': True, 'deploymentId': did, 'snapshotId': snapshot_id, 'productionRepositoryUsed': False}))
    finally:
        if cid:
            docker(['rm', '-f', cid])
        for name in volumes:
            if recover.volume_exists(name):
                docker(['volume', 'rm', name])
        # Plain original and local repo are unnecessary after the independently verified download.
        for path in (directory, stage / 'backups'):
            if path.exists():
                shutil.rmtree(path)


def verify(stage):
    config = json.loads((stage / 'config.json').read_text())
    config['adapters']['recovery_fixture']['bundle'] = str(stage / 'bundle')
    plan = json.loads((stage / 'plan.json').read_text())
    source = json.loads((stage / 'source-evidence.json').read_text())
    # Re-open the independent encrypted repository on the target host; ignore the source plaintext copy.
    source_snapshot = json.loads(subprocess.check_output(
        [os.environ.get('RESTIC_BINARY', 'restic'), '--no-cache', 'snapshots', '--json', source['snapshotId']],
        env={**os.environ, 'RESTIC_REPOSITORY': str(stage / 'restic'), 'RESTIC_PASSWORD_FILE': str(stage / 'restic-password')}, stderr=subprocess.DEVNULL))[0]
    fetch_config = {**config, 'offsite': {'binary': os.environ.get('RESTIC_BINARY', 'restic'),
        'repository': str(stage / 'restic'), 'passwordFile': str(stage / 'restic-password'), 'sftpCommand': 'false'}}
    fetcher.fetch(fetch_config, plan, source['snapshotId'], source_snapshot['paths'][0], stage / 'target-download')
    backup = stage / 'target-download'
    work = stage / 'recovery'
    proof = recover.restore(config, plan, backup, work)
    assert proof == recover.restore(config, plan, backup, work)
    assert not proof['applicationStarted'] and not proof['trafficChanged']
    # An unrelated actor cannot rewrite a completed plan or silently accept damaged restored data.
    try:
        recover.restore(config, {**plan, 'maxBytes': plan['maxBytes'] + 1}, backup, work)
        raise AssertionError('Frozen plan was mutable')
    except ValueError:
        pass
    interrupted = {**plan, 'id': str(uuid.uuid4())}
    original_docker = recover.docker
    def interruption(args, **kwargs):
        if args[0] == 'run' and '-i' in args:
            raise RuntimeError('Simulated interruption before archive extraction')
        return original_docker(args, **kwargs)
    with patch.object(recover, 'docker', side_effect=interruption):
        try:
            recover.restore(config, interrupted, backup, work)
            raise AssertionError('Expected interrupted restore')
        except RuntimeError:
            pass
    try:
        recover.restore(config, interrupted, backup, work)
        raise AssertionError('Incomplete restore silently resumed')
    except ValueError:
        pass
    recover.cleanup(interrupted, config, work)
    foreign_plan = {**plan, 'id': str(uuid.uuid4())}
    foreign_name = recover.volume_name(foreign_plan, 'data')
    docker(['volume', 'create', '--label', 'recovery-test-sentinel=true', foreign_name])
    try:
        try:
            recover.restore(config, foreign_plan, backup, work)
            raise AssertionError('Existing foreign volume adopted')
        except ValueError:
            pass
        assert recover.volume_exists(foreign_name)
    finally:
        docker(['volume', 'rm', foreign_name])
    original = (backup / '.env').read_bytes()
    (backup / '.env').write_bytes(original + b'corrupt')
    try:
        recover.restore(config, plan, backup, work)
        raise AssertionError('Corrupt snapshot accepted')
    except ValueError:
        pass
    (backup / '.env').write_bytes(original)
    cid = None
    try:
        cid = docker(['run', '-d', '--network', 'none', '--memory', '192m', '--cpus', '0.5',
                      '-v', proof['volumes']['data'] + ':/var/lib/postgresql/data', '-v', proof['volumes']['files'] + ':/fixtures:ro', config['snapshotImage']], text=True).strip()
        wait_pg(cid)
        value = docker(['exec', cid, 'psql', '-U', 'postgres', '-Atc', 'SELECT count(*),sum(amount),min(note) FROM recovery_orders'], text=True).strip()
        assert value == '50|16575|隔离恢复', value
        assert docker(['exec', cid, 'cat', '/fixtures/proof.txt']) == b'customer-file-integrity\n'
        try:
            recover.cleanup(plan, config, work)
            raise AssertionError('Cleanup of attached volume allowed')
        except ValueError:
            pass
    finally:
        if cid:
            docker(['rm', '-f', cid])
        cleaned = recover.cleanup(plan, config, work)
    assert cleaned == recover.cleanup(plan, config, work)
    assert all(not recover.volume_exists(name) for name in proof['volumes'].values())
    evidence = {**proof, 'postgresRows': 50, 'postgresAmountSum': 16575, 'unicodeVerified': True, 'fileVerified': True,
                'snapshotCorruptionRejected': True, 'frozenPlanProtected': True, 'completionReplayVerified': True,
                'incompleteRestoreBlocked': True, 'foreignVolumeProtected': True, 'inUseVolumeProtected': True, 'cleanupReplayVerified': True, 'isolatedDatabaseValidation': True,
                'productionCustomerModified': False, 'productionRepositoryUsed': False, 'encryptedRepositoryReadOnTarget': True}
    recover.store(stage / 'target-evidence.json', evidence)
    print(json.dumps(evidence))


if len(sys.argv) > 1:
    {'prepare': prepare, 'verify': verify}[sys.argv[1]](Path(sys.argv[2]).resolve())
else:
    with tempfile.TemporaryDirectory() as temporary:
        stage = Path(temporary).resolve()
        prepare(stage)
        verify(stage)
