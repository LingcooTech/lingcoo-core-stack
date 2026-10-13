import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import uuid

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).parents[1] / 'scripts' / 'compose-snapshot.py')
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)
SOURCE = json.load(sys.stdin)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='snapshot-test-')
        self.root = Path(self.temp.name)
        self.target = copy.deepcopy(SOURCE)
        self.target['instanceId'] = str(uuid.uuid4())
        self.target['project'] = 'stack-' + self.target['instanceId'].replace('-', '')
        self.folder = self.root / 'snapshot'
        self.folder.mkdir(mode=0o700)
        archive = self.folder / 'volume-0.tar'
        with tarfile.open(archive, 'w') as stream:
            entry = tarfile.TarInfo('data')
            entry.size = 5
            stream.addfile(entry, io.BytesIO(b'hello'))
        archive.chmod(0o600)
        self.manifest = {'protocol': snapshot.PROTOCOL, 'snapshotId': str(uuid.uuid4()), 'sourceInstanceId': SOURCE['instanceId'],
            'releaseId': SOURCE['releaseId'], 'releaseDigest': SOURCE['releaseDigest'], 'configurationDigest': snapshot.configuration_digest(SOURCE),
            'archiveImage': snapshot.ARCHIVE_IMAGE, 'completed': ['migrate:0', 'initialize:0'], 'archives': []}
        self.refresh()

    def tearDown(self):
        self.temp.cleanup()

    def refresh(self):
        archive = self.folder / 'volume-0.tar'
        self.manifest['archives'] = [{'volume': SOURCE['volumes'][0], 'file': archive.name, 'size': archive.stat().st_size, 'sha256': snapshot.sha_file(archive)}]
        snapshot.kernel.private_json(self.folder / 'snapshot.json', self.manifest)
        self.expected = snapshot.sha_file(self.folder / 'snapshot.json')

    def rejected(self, target=None, expected=None):
        with patch.object(snapshot, 'Runtime', side_effect=AssertionError('Docker must not run')):
            with self.assertRaises(ValueError):
                snapshot.restore(target or self.target, self.root / 'workspace', self.folder, expected or self.expected)

    def test_integrity_and_identity_before_docker(self):
        self.rejected(expected='0' * 64)
        self.rejected(target=SOURCE)
        changed = copy.deepcopy(self.target)
        changed['releaseDigest'] = 'sha256:' + 'c' * 64
        self.rejected(target=changed)
        changed = copy.deepcopy(self.target)
        changed['compose']['services']['web']['environment']['PASSWORD'] = 'different'
        self.rejected(target=changed)
        (self.folder / 'volume-0.tar').write_bytes(b'corrupt')
        self.rejected()
        self.assertFalse((self.root / 'workspace').exists())

    def test_archive_path_and_link_escape(self):
        for name, link in [('../escape', None), ('/absolute', None), ('link', '../../outside')]:
            with tarfile.open(self.folder / 'volume-0.tar', 'w') as stream:
                entry = tarfile.TarInfo(name)
                if link:
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = link
                stream.addfile(entry)
            self.refresh()
            self.rejected()
        self.assertFalse((self.root / 'workspace').exists())

    def test_existing_target_and_symlink_are_refused(self):
        workspace = self.root / 'workspace'
        workspace.mkdir(mode=0o700)
        target = workspace / self.target['instanceId']
        target.mkdir(mode=0o700)
        self.rejected()
        target.rmdir()
        target.symlink_to(self.root, target_is_directory=True)
        self.rejected()
        self.assertTrue(target.is_symlink())

    def test_source_restarts_when_archive_fails(self):
        workspace = self.root / 'workspace'
        directory = workspace / SOURCE['instanceId']
        directory.mkdir(mode=0o700, parents=True)
        workspace.chmod(0o700)
        snapshot.kernel.private_json(directory / 'installation.json', {'fingerprint': snapshot.digest(SOURCE), 'phase': 'runtime_ready', 'completed': ['migrate:0', 'initialize:0']})
        class Fake:
            running = True
            restarted = False
            def containers(self): return ['web', 'storage']
            def owner(self, *_args, **_kwargs): return snapshot.digest(SOURCE)
            def run(self, args, **_kwargs):
                if 'ps' in args: return 'web storage'
                if 'inspect' in args: return ('true' if self.running else 'false') if '.State.Running' in args[3] else args[-1]
                return ''
            def compose(self, args):
                self.running = args[0] == 'start'
                self.restarted = self.running
            def helper(self, *_args, **_kwargs): raise RuntimeError('Injected archive failure')
        fake = Fake()
        with patch.object(snapshot, 'Runtime', return_value=fake):
            with self.assertRaises(RuntimeError):
                snapshot.backup(SOURCE, workspace, self.root / 'failed-snapshot')
        self.assertTrue(fake.restarted)
        self.assertFalse((self.root / 'failed-snapshot' / 'snapshot.json').exists())
        self.assertEqual(json.loads((directory / 'snapshot-status.json').read_text())['phase'], 'source_restarted')


unittest.main(argv=[sys.argv[0]])
