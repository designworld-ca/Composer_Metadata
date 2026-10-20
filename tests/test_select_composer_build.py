"""test_select_composer_build.py — v1.0.2

Offline regression tests; no GitHub/Jellyfin calls and no durable file changes.
Verifies that publication can never select a stale plugin release by default.
Run: python3 -m unittest discover -s tests -p test_select_composer_build.py -v
"""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from select_composer_build import expected_build


class VersionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.file = Path(self.temp.name) / 'Plugin.csproj'
        self.make_project('1.2.2', '1.2.2.0')

    def make_project(self, version: str, assembly: str) -> None:
        self.file.write_text('<Project><PropertyGroup><Version>' + version +
                             '</Version><AssemblyVersion>' + assembly +
                             '</AssemblyVersion></PropertyGroup></Project>')

    def test_expected_release_derived_from_project(self):
        self.assertEqual(expected_build(self.file), {
            'EXPECTED_VERSION': '1.2.2',
            'EXPECTED_TAG': 'v1.2.2',
            'EXPECTED_ARTIFACT': 'jellyfin-composer-plugin-1.2.2',
        })

    def test_correct_explicit_release_tag_accepted(self):
        self.assertEqual(expected_build(self.file, 'v1.2.2')['EXPECTED_TAG'], 'v1.2.2')

    def test_old_release_tag_refused(self):
        with self.assertRaisesRegex(ValueError, 'tag mismatch'):
            expected_build(self.file, 'v1.2.1')

    def test_future_release_tag_refused(self):
        with self.assertRaisesRegex(ValueError, 'tag mismatch'):
            expected_build(self.file, 'v1.2.3')

    def test_nonmatching_assembly_version_refused(self):
        self.make_project('1.2.2', '1.2.1.0')
        with self.assertRaisesRegex(ValueError, 'AssemblyVersion'):
            expected_build(self.file)

    def test_missing_version_refused(self):
        self.file.write_text('<Project><PropertyGroup><AssemblyVersion>1.2.2.0</AssemblyVersion></PropertyGroup></Project>')
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            expected_build(self.file)

    def test_malformed_version_refused(self):
        self.make_project('1.2.2.0', '1.2.2.0')
        with self.assertRaisesRegex(ValueError, 'concrete'):
            expected_build(self.file)

    def test_multiple_version_tags_refused(self):
        self.file.write_text('<Project><PropertyGroup><Version>1.2.2</Version><Version>1.2.1</Version><AssemblyVersion>1.2.2.0</AssemblyVersion></PropertyGroup></Project>')
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            expected_build(self.file)

    def test_default_cli_does_not_modify_outputs(self):
        out = Path(self.temp.name) / 'output'
        p = subprocess.run([sys.executable, str(ROOT / 'tools/select_composer_build.py'),
                            '--project', str(self.file), '--github-output', str(out)],
                           text=True, capture_output=True)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertIn('DRY RUN', p.stdout)
        self.assertFalse(out.exists())

    def test_apply_writes_expected_keys_only(self):
        out = Path(self.temp.name) / 'output'
        p = subprocess.run([sys.executable, str(ROOT / 'tools/select_composer_build.py'),
                            '--project', str(self.file), '--release-tag', 'v1.2.2',
                            '--github-output', str(out), '--apply'],
                           text=True, capture_output=True)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(out.read_text().splitlines(), [
            'EXPECTED_VERSION=1.2.2', 'EXPECTED_TAG=v1.2.2',
            'EXPECTED_ARTIFACT=jellyfin-composer-plugin-1.2.2'])

    def test_bad_tag_never_writes_output(self):
        out = Path(self.temp.name) / 'output'
        p = subprocess.run([sys.executable, str(ROOT / 'tools/select_composer_build.py'),
                            '--project', str(self.file), '--release-tag', 'v1.2.1',
                            '--github-output', str(out), '--apply'],
                           text=True, capture_output=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
