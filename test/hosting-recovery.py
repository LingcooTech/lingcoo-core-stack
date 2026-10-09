"""Recovery trust boundary regression tests; no Docker required."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
import uuid

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'scripts'))
spec = importlib.util.spec_from_file_location('recover', root / 'scripts/hosting-node-recover.py')
recover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recover)


class ArchiveGuards(unittest.TestCase):
    def archive(self, members, limit=1000):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'input.tar'
            with tarfile.open(path, 'w') as out:
                for name, kind, value in members:
                    item = tarfile.TarInfo(name)
                    if kind == 'file':
                        item.size = len(value)
                        out.addfile(item, io.BytesIO(value))
                    else:
                        item.type = {'symlink': tarfile.SYMTYPE, 'hardlink': tarfile.LNKTYPE, 'fifo': tarfile.FIFOTYPE}[kind]
                        item.linkname = value
                        out.addfile(item)
            return recover.inventory(path, limit)

    def test_preserves_content_and_link_metadata(self):
        entries, size = self.archive([('data', 'file', b'customer-data'), ('alias', 'symlink', 'data'), ('copy', 'hardlink', 'data')])
        self.assertEqual(size, 13)
        self.assertEqual(recover.normalized_inventory(entries)['copy']['sha256'], hashlib.sha256(b'customer-data').hexdigest())
        self.assertEqual(recover.normalized_inventory(entries)['copy']['links'], ['copy', 'data'])

    def test_rejects_unsafe_archives(self):
        for members in [
            [('../escape', 'file', b'x')], [('/escape', 'file', b'x')],
            [('alias', 'symlink', '../escape')], [('alias', 'symlink', '/escape')],
            [('alias', 'symlink', 'data'), ('alias/nested', 'file', b'x')],
            [('copy', 'hardlink', 'missing')], [('fifo', 'fifo', '')],
            [('same', 'file', b'1'), ('./same', 'file', b'2')],
        ]:
            with self.subTest(members=members), self.assertRaises(ValueError):
                self.archive(members)

    def test_enforces_expanded_capacity(self):
        with self.assertRaises(ValueError):
            self.archive([('data', 'file', b'12345')], limit=4)

    def test_rejects_ambiguous_checksums(self):
        digest = 'a' * 64
        for value in [f'{digest}  ../escape\n', f'{digest}  ./relative\n', f'{digest}  same\n{digest}  same\n', f'{digest}  SHA256SUMS\n', '']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                recover.checksum_entries(value.encode())

    def test_binds_target_and_limits(self):
        plan = {key: str(uuid.uuid4()) for key in ('id', 'deploymentId', 'sourceOperationId', 'targetNodeId')}
        plan.update(manifestSha256='a' * 64, maxBytes=1024)
        config = {'nodeId': plan['targetNodeId']}
        recover.validate_plan(plan, config)
        for patch in [{'targetNodeId': str(uuid.uuid4())}, {'maxBytes': True}, {'maxBytes': 0}, {'manifestSha256': 'latest'}, {'command': 'unsafe'}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                recover.validate_plan({**plan, **patch}, config)

    def test_private_root_rejects_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve()
            (path / 'link').symlink_to(path, target_is_directory=True)
            with self.assertRaises(ValueError):
                recover.private_directory(path / 'link' / 'new')


unittest.main()
