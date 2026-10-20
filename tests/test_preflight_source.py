#!/usr/bin/env python3
"""Read-only Composer CI diagnostic regression tests v1.0.1; temp files only."""
import pathlib
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class SourcePreflight(unittest.TestCase):
    def invoke(self, root):
        return subprocess.run(['python3', str(ROOT/'tests/preflight_source.py'), '--version','1.2.2','--root',str(root)], text=True, capture_output=True)
    def setup_root(self, root):
        (root/'plugin').mkdir()
        for n in ('ComposerMetadataController.cs','ComposerSqliteStore.cs','Plugin.cs','PluginConfiguration.cs','Jellyfin.Plugin.ComposerSharedMetadata.csproj'):
            shutil.copy(ROOT/'plugin'/n, root/'plugin'/n)
    def test_supplied_v122_sources_pass(self):
        self.assertEqual(self.invoke(ROOT).returncode, 0)
    def test_old_controller_documentation_is_listed(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);self.setup_root(root)
            p=root/'plugin/ComposerMetadataController.cs'
            p.write_text(p.read_text().replace('/// <summary>Returns the read-only health, version, and schema status.</summary>\n',''))
            # remove a doc summary even if adjacent attribute appears
            p.write_text(p.read_text().replace('    /// <summary>Returns the read-only health, version, and schema status.</summary>\n', ''))
            r=self.invoke(root)
            self.assertNotEqual(r.returncode,0)
            self.assertIn('missing XML summary',r.stdout+r.stderr)
            self.assertIn('ComposerMetadataController.cs:',r.stdout+r.stderr)
    def test_stale_plugin_entry_point_xml_docs_are_detected(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d); self.setup_root(root)
            p=root/'plugin/Plugin.cs'
            p.write_text(p.read_text().replace('    /// <summary>Jellyfin plugin entry point and shared metadata information page.</summary>\n', ''))
            r=self.invoke(root)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('Plugin.cs:', r.stdout+r.stderr)
            self.assertIn('missing XML summary', r.stdout+r.stderr)
    def test_stale_configuration_xml_docs_are_detected(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d); self.setup_root(root)
            p=root/'plugin/PluginConfiguration.cs'
            p.write_text(p.read_text().replace('/// <summary>Configuration marker; metadata is stored independently in SQLite.</summary>\n', ''))
            r=self.invoke(root)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('PluginConfiguration.cs:', r.stdout+r.stderr)
    def test_old_sqlite_dependency_is_detected(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d); self.setup_root(root)
            p=root/'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj'
            p.write_text(p.read_text().replace('Version="10.0.13"', 'Version="10.0.1"'))
            r=self.invoke(root)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('Microsoft.Data.Sqlite 10.0.13 required', r.stdout+r.stderr)

    def test_wrong_csproj_version_explicit(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);self.setup_root(root)
            p=root/'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj'
            p.write_text(p.read_text().replace('<Version>1.2.2</Version>', '<Version>1.2.1</Version>'))
            r=self.invoke(root)
            self.assertNotEqual(r.returncode,0)
            self.assertIn('project <Version> is', r.stdout+r.stderr)
    def test_wrong_health_version_explicit(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);self.setup_root(root)
            p=root/'plugin/ComposerMetadataController.cs'
            p.write_text(p.read_text().replace('pluginVersion = "1.2.2"', 'pluginVersion = "1.2.1"'))
            r=self.invoke(root)
            self.assertNotEqual(r.returncode,0)
            self.assertIn('health endpoint must declare pluginVersion',r.stdout+r.stderr)
    def test_workflow_includes_preflight_in_summary(self):
        yml=(ROOT/'.github/workflows/build-and-package.yml').read_text()
        self.assertIn('cat diagnostics/preflight.log >> "$GITHUB_STEP_SUMMARY"',yml)
        self.assertIn('actions/upload-artifact@v6',yml)
        self.assertNotIn('actions/upload-artifact@v4',yml)
if __name__ == '__main__':unittest.main()
