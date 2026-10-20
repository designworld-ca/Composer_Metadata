#!/usr/bin/env python3
"""test_logging.py — v1.0.4; Jellyfin Composer plugin logging and schema regression tests.

PURPOSE: Check structured logging, privacy guardrails, the unchanged schema-v1
SQLite contract, and project-derived release version metadata.
REQUIREMENTS: Python 3.10+ standard library; repository files under plugin/, tools/,
packaging/. No .NET runtime or external services required.
SAFETY: Read-only checks on checked-out repository. Packaging smoke tests create
placeholder binary files only in a TemporaryDirectory and never publish/install
these ZIPs, contact Jellyfin, or change any persistent metadata.
USAGE: python3 -m unittest discover -s tests -p test_logging.py -v
"""
from pathlib import Path
import json
import re
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / 'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj'
PACKAGER = ROOT / 'packaging/package_release.py'
MAIN_DLL = 'Jellyfin.Plugin.ComposerSharedMetadata.dll'


def project_version():
    """Resolve plugin version without depending on a hard-coded release number."""
    tree = ET.parse(PROJECT)
    items = [((e.tag.rsplit('}', 1)[-1]), (e.text or '').strip()) for e in tree.iter()]
    versions = [value for name, value in items if name == 'Version']
    assemblies = [value for name, value in items if name == 'AssemblyVersion']
    if len(versions) != 1 or not re.fullmatch(r'\d+\.\d+\.\d+', versions[0]):
        raise AssertionError('Expected one valid plugin <Version> in the project')
    if assemblies != [versions[0] + '.0']:
        raise AssertionError('AssemblyVersion must match the project version + .0')
    return versions[0]


class LoggingCoverage(unittest.TestCase):
    def test_categorized_logger_injection(self):
        plugin = (ROOT / 'plugin/Plugin.cs').read_text(encoding='utf-8')
        controller = (ROOT / 'plugin/ComposerMetadataController.cs').read_text(encoding='utf-8')
        store = (ROOT / 'plugin/ComposerSqliteStore.cs').read_text(encoding='utf-8')
        self.assertIn('ILogger<Plugin>', plugin)
        self.assertIn('ILogger<ComposerMetadataController>', controller)
        self.assertIn('ILogger<ComposerSqliteStore>', controller)
        self.assertIn('ILogger<ComposerSqliteStore>?', store)

    def test_log_levels_and_events(self):
        src = '\n'.join((ROOT / p).read_text(encoding='utf-8') for p in (
            'plugin/Plugin.cs', 'plugin/ComposerMetadataController.cs',
            'plugin/ComposerSqliteStore.cs'))
        for event in ('CSM100', 'CSM110', 'CSM201', 'CSM209', 'CSM210', 'CSM500'):
            with self.subTest(event=event):
                self.assertIn(event, src)
        for level in ('LogInformation', 'LogWarning', 'LogDebug', 'LogError'):
            with self.subTest(level=level):
                self.assertIn(level, src)

    def test_log_token_and_pii_exclusion(self):
        src = (ROOT / 'plugin/ComposerSqliteStore.cs').read_text(encoding='utf-8')
        self.assertIn('ComposerLogToken.ForKey(key)', src)
        self.assertNotIn('LogInformation("{Overview}', src)
        self.assertNotIn('LogInformation("{ImageDataUrl}', src)
        self.assertNotIn('LogInformation("{Name}', src)
        self.assertIn('SHA256.HashData',
                      (ROOT / 'plugin/ComposerLogToken.cs').read_text(encoding='utf-8'))

    def test_no_database_schema_change(self):
        """Guard stored SQLite columns/schema, independently of release version."""
        src = (ROOT / 'plugin/ComposerSqliteStore.cs').read_text(encoding='utf-8')
        controller = (ROOT / 'plugin/ComposerMetadataController.cs').read_text(encoding='utf-8')
        self.assertNotIn('DROP TABLE', src.upper())
        self.assertNotIn('DELETE FROM', src.upper())
        self.assertNotIn('ALTER TABLE', src.upper())
        match = re.search(r'CREATE TABLE IF NOT EXISTS composer_metadata\s*\((.*?)\)\s*;',
                          src, re.DOTALL)
        self.assertIsNotNone(match, 'composer_metadata CREATE TABLE statement missing')
        columns = re.sub(r'\s+', ' ', match.group(1)).strip()
        for column in (
            'composer_key TEXT PRIMARY KEY COLLATE BINARY NOT NULL',
            'name TEXT NOT NULL', 'overview TEXT NOT NULL',
            'revision INTEGER NOT NULL CHECK (revision > 0)',
            "image_mime TEXT NOT NULL DEFAULT ''", 'image_blob BLOB NULL',
            'updated_utc TEXT NOT NULL',
        ):
            with self.subTest(column=column):
                self.assertIn(column, columns)
        self.assertIn('schemaVersion = 1', controller)

    def test_packaged_metadata_follows_project_version(self):
        """Test the real packager with fake binaries, never a release artifact."""
        version = project_version()
        with tempfile.TemporaryDirectory(prefix='composer-test-only-') as tmp:
            work = Path(tmp)
            publish = work / 'linux-x64'
            publish.mkdir()
            # Placeholders are intentionally invalid assemblies; never install.
            for name in (MAIN_DLL, 'Microsoft.Data.Sqlite.dll',
                         'SQLitePCLRaw.core.dll', 'SQLitePCLRaw.provider.e_sqlite3.dll',
                         'libe_sqlite3.so'):
                (publish / name).write_bytes(b'TEST FIXTURE ONLY - NOT A BINARY')
            output = work / 'dist'
            command = [sys.executable, str(PACKAGER), '--publish-dir', str(publish),
                       '--rid', 'linux-x64', '--output-dir', str(output),
                       '--expected-version', version, '--apply']
            result = subprocess.run(command, capture_output=True, text=True,
                                    cwd=ROOT, check=False)
            self.assertEqual(result.returncode, 0,
                             f'Packager failed: {result.stdout}\n{result.stderr}')
            zip_path = output / f'jellyfin-composer-shared-metadata-{version}-linux-x64-install.zip'
            self.assertTrue(zip_path.is_file(), f'Missing expected test ZIP: {zip_path}')
            with zipfile.ZipFile(zip_path) as archive:
                self.assertIsNone(archive.testzip())
                self.assertIn(MAIN_DLL, archive.namelist())
                self.assertFalse(any('/' in name for name in archive.namelist()),
                                 'Install ZIP must not have a nested directory')
                meta = json.loads(archive.read('meta.json'))
            self.assertEqual(meta['version'], version + '.0')
            self.assertEqual(meta['guid'], '4c65902b-e89d-4549-a313-2a204c622e77')


if __name__ == '__main__':
    unittest.main()
