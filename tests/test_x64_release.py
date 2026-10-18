"""Release publisher v1.0.1: stdlib-only offline tests, no external writes."""
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from prepare_x64_release import inspect_release, SUFFIX
from make_plugin_manifest import GUID, DLL, make_manifest

class ReleaseValidationTests(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.dir = pathlib.Path(self.t.name)
        self.archive = self.dir / ('jellyfin-composer-shared-metadata-1.1.0' + SUFFIX)
        self.meta = {'name': 'Composer Shared Metadata', 'guid': GUID, 'version': '1.1.0.0', 'targetAbi': '12.2.0.0'}
        self.create()

    def create(self, name=None, include_dll=True):
        target = name or self.archive
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('ComposerSharedMetadata_1.1.0/meta.json', json.dumps(self.meta))
            if include_dll:
                z.writestr('ComposerSharedMetadata_1.1.0/' + DLL, b'mock DLL, not installable')
        return target

    def test_auto_derive_release_tag_and_checksum(self):
        values = inspect_release(self.archive)
        self.assertEqual(values['RELEASE_TAG'], 'v1.1.0')
        self.assertEqual(values['TARGET_ABI'], '12.2.0.0')
        self.assertEqual(values['ASSET_SHA256'], hashlib.sha256(self.archive.read_bytes()).hexdigest())
        records, url, checksum = make_manifest(self.archive, 'designworld-ca/Composer_Metadata', values['RELEASE_TAG'], self.dir/'manifest.json', '2026-10-18T00:00:00Z')
        self.assertEqual(records[0]['versions'][0]['version'], '1.1.0.0')
        self.assertIn('v1.1.0/', url)
        self.assertEqual(len(checksum), 32)

    def test_explicit_matching_tag(self):
        self.assertEqual(inspect_release(self.archive, 'v1.1.0')['RELEASE_TAG'], 'v1.1.0')

    def test_tag_mismatch_fails(self):
        with self.assertRaisesRegex(ValueError, 'Release tag mismatch'):
            inspect_release(self.archive, 'v1.1.1')

    def test_reject_arm64(self):
        arm = self.create(self.dir / 'jellyfin-composer-shared-metadata-1.1.0-linux-arm64-install.zip')
        with self.assertRaisesRegex(ValueError, 'Linux x64'):
            inspect_release(arm)

    def test_reject_wrong_jellyfin_abi(self):
        self.meta['targetAbi'] = '10.11.0.0'
        self.create()
        with self.assertRaisesRegex(ValueError, '12.2'):
            inspect_release(self.archive)

    def test_reject_version_mismatch(self):
        self.meta['version'] = '1.1.1.0'
        self.create()
        with self.assertRaisesRegex(ValueError, 'filename version'):
            inspect_release(self.archive)

    def test_reject_wrong_plugin_guid(self):
        self.meta['guid'] = '00000000-0000-0000-0000-000000000000'
        self.create()
        with self.assertRaisesRegex(ValueError, 'GUID mismatch'):
            inspect_release(self.archive)

    def test_reject_missing_binary(self):
        self.create(include_dll=False)
        with self.assertRaisesRegex(ValueError, 'compiled plugin DLL'):
            inspect_release(self.archive)

    def test_workflow_is_linux_x64_release_publisher(self):
        workflow = (ROOT / '.github/workflows/publish-composer-manifest.yml').read_text()
        self.assertIn('gh run download', workflow)
        self.assertIn('gh release create', workflow)
        self.assertIn('gh release download', workflow)
        self.assertIn('github.event.repository.default_branch', workflow)
        self.assertIn('prepare_x64_release.py', workflow)
        self.assertIn('make_plugin_manifest.py', workflow)
        self.assertIn('*-linux-x64-install.zip', workflow)
        self.assertNotIn('publish plugin --arm64', workflow)

if __name__ == '__main__':
    unittest.main()
