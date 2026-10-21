#!/usr/bin/env python3
"""test_dependency_package.py v1.0.0 — safe composer ZIP dependency regression checks.

PURPOSE: Catch missing managed SQLite library entries in meta.json and a ZIP.
REQUIREMENTS: Python 3.10+, stdlib, current packaging helper and validation tool.
SAFETY: Writes only fake placeholder binaries in TemporaryDirectory; never installs
or uploads them. No production Jellyfin DB or Jellyfin network operations.
USAGE: python3 -m unittest discover -s tests -p test_dependency_package.py -v
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
import sys
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from verify_composer_install_zip import REQUIRED_MANAGED, NATIVE_NAME, validate


def current_version():
    return ET.parse(ROOT / 'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj').findtext('.//Version')


class SqliteDependencyPackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.pub = self.root / 'publish'
        self.pub.mkdir()
        for name in (*REQUIRED_MANAGED, NATIVE_NAME):
            (self.pub / name).write_bytes(b'MOCK-NOT-AN-INSTALLABLE-BINARY')
        self.version = current_version()
        self.archive = self.root / 'dist' / f'jellyfin-composer-shared-metadata-{self.version}-linux-x64-install.zip'

    def build(self):
        command = [sys.executable, str(ROOT / 'packaging/package_release.py'),
                   '--publish-dir', str(self.pub), '--rid', 'linux-x64',
                   '--expected-version', self.version, '--output-dir',
                   str(self.root / 'dist'), '--apply']
        return subprocess.run(command, capture_output=True, text=True, cwd=ROOT)

    def rewrite(self, transform):
        with zipfile.ZipFile(self.archive) as z:
            items = {name: z.read(name) for name in z.namelist()}
        transform(items)
        with zipfile.ZipFile(self.archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for name, contents in items.items():
                z.writestr(name, contents)

    def test_every_required_sqlite_library_is_on_install_allowlist(self):
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = validate(self.archive, self.version)
        self.assertGreaterEqual(summary['assemblies'], 5)
        with zipfile.ZipFile(self.archive) as z:
            meta = json.loads(z.read('meta.json'))
            self.assertEqual(set(meta['assemblies']), {n for n in z.namelist() if n.endswith('.dll')})
            self.assertIn('Microsoft.Data.Sqlite.dll', meta['assemblies'])
            self.assertNotIn(NATIVE_NAME, meta['assemblies'])

    def test_missing_microsoft_data_sqlite_refused_before_packaging(self):
        (self.pub / 'Microsoft.Data.Sqlite.dll').unlink()
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Microsoft.Data.Sqlite.dll', result.stderr + result.stdout)
        self.assertFalse(self.archive.exists())

    def test_missing_batteries_refused_before_packaging(self):
        (self.pub / 'SQLitePCLRaw.batteries_v2.dll').unlink()
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SQLitePCLRaw.batteries_v2.dll', result.stderr + result.stdout)

    def test_missing_sqlite_from_meta_allowlist_is_rejected(self):
        self.assertEqual(self.build().returncode, 0)
        def change(items):
            meta = json.loads(items['meta.json'])
            meta['assemblies'].remove('Microsoft.Data.Sqlite.dll')
            items['meta.json'] = json.dumps(meta).encode()
        self.rewrite(change)
        with self.assertRaisesRegex(ValueError, 'meta.json assemblies'):
            validate(self.archive, self.version)

    def test_missing_packaged_dll_is_rejected(self):
        self.assertEqual(self.build().returncode, 0)
        self.rewrite(lambda items: items.pop('Microsoft.Data.Sqlite.dll'))
        with self.assertRaisesRegex(ValueError, 'Missing required'):
            validate(self.archive, self.version)

    def test_wrong_version_is_rejected(self):
        self.assertEqual(self.build().returncode, 0)
        with self.assertRaisesRegex(ValueError, 'release version mismatch'):
            validate(self.archive, '1.2.2')

    def test_strict_mode_refuses_fake_dlls(self):
        self.assertEqual(self.build().returncode, 0)
        with self.assertRaisesRegex(ValueError, 'not a PE assembly'):
            validate(self.archive, self.version, strict=True)

    def test_ci_checks_compiled_sqlite_assembly_version(self):
        wf = (ROOT / '.github/workflows/build-and-package.yml').read_text()
        guard = (ROOT / 'tests/VerifyPublishedAssemblies.cs').read_text()
        self.assertIn('VerifyPublishedAssemblies.csproj', wf)
        self.assertIn('Microsoft.Data.Sqlite.dll', guard)
        self.assertIn('new Version(10, 0, 13, 0)', guard)
        self.assertIn('AssemblyName.GetAssemblyName', guard)
        self.assertLess(wf.index('Verify actual published SQLite'),
                        wf.index('Assemble platform-specific install ZIPs'))
        for project, source in (('StoreSmoke.csproj', 'Program.cs'),
                                ('VerifyPublishedAssemblies.csproj', 'VerifyPublishedAssemblies.cs')):
            definition = (ROOT / 'tests' / project).read_text()
            self.assertIn('<EnableDefaultCompileItems>false</EnableDefaultCompileItems>', definition)
            self.assertIn(f'<Compile Include="{source}" />', definition)

    def test_schema_and_plugin_guid_remain_unchanged(self):
        code = (ROOT / 'plugin/ComposerSqliteStore.cs').read_text()
        self.assertIn('CREATE TABLE IF NOT EXISTS composer_metadata', code)
        self.assertNotIn('DROP TABLE', code.upper())
        self.assertIn('4c65902b-e89d-4549-a313-2a204c622e77',
                      (ROOT / 'plugin/Plugin.cs').read_text())

if __name__ == '__main__':
    unittest.main()
