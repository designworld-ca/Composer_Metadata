"""Regression tests for Jellyfin Composer repository manifest v1.0.0.
Read-only tests; creates temporary mock compiled ZIPs, not deployable binaries.
"""
import json
import pathlib
import tempfile
import unittest
import sys
import zipfile
sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "tools"))
from make_plugin_manifest import make_manifest, read_package, GUID, DLL


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = pathlib.Path(self.tmp.name)
        self.zip = self.folder / "jellyfin-composer-shared-metadata-1.1.1-linux-x64-install.zip"
        self.meta = {"guid": GUID, "version": "1.1.1.0", "targetAbi": "12.2.0.0", "name": "Composer Shared Metadata"}
        self.write_zip()

    def write_zip(self):
        with zipfile.ZipFile(self.zip, "w") as z:
            z.writestr("ComposerSharedMetadata_1.1.1/meta.json", json.dumps(self.meta))
            z.writestr("ComposerSharedMetadata_1.1.1/" + DLL, b"mock-binary-not-deployable")

    def test_meta_and_checksum(self):
        self.assertEqual(read_package(self.zip)[1], "1.1.1.0")
        records, url, checksum = make_manifest(self.zip, "designworld-ca/Composer_Metadata", "v1.1.1", self.folder / "manifest.json", "2026-10-17T00:00:00Z")
        self.assertEqual(records[0]["guid"], GUID)
        self.assertIn("/releases/download/v1.1.1/", url)
        self.assertEqual(len(checksum), 32)

    def test_idempotent_update(self):
        path = self.folder / "manifest.json"
        records, _, _ = make_manifest(self.zip, "designworld-ca/Composer_Metadata", "v1.1.1", path, "2026-10-17T00:00:00Z")
        path.write_text(json.dumps(records))
        records, _, _ = make_manifest(self.zip, "designworld-ca/Composer_Metadata", "v1.1.1", path, "2026-10-17T00:00:00Z")
        self.assertEqual(len(records[0]["versions"]), 1)

    def test_guid_mismatch_refused(self):
        self.meta["guid"] = "00000000-0000-0000-0000-000000000000"
        self.write_zip()
        with self.assertRaisesRegex(ValueError, "GUID mismatch"):
            read_package(self.zip)

    def test_missing_dll_refused(self):
        with zipfile.ZipFile(self.zip, "w") as z:
            z.writestr("meta.json", json.dumps(self.meta))
        with self.assertRaisesRegex(ValueError, "compiled plugin DLL"):
            read_package(self.zip)

if __name__ == "__main__":
    unittest.main()
