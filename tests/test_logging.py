#!/usr/bin/env python3
"""Composer plugin logging coverage checks v1.2.1, read-only; no Jellyfin writes.

These checks do NOT replace dotnet build or live verification of log routing.
"""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
class LoggingCoverage(unittest.TestCase):
    def test_categorized_logger_injection(self):
        plugin=(ROOT/'plugin/Plugin.cs').read_text()
        controller=(ROOT/'plugin/ComposerMetadataController.cs').read_text()
        store=(ROOT/'plugin/ComposerSqliteStore.cs').read_text()
        self.assertIn('ILogger<Plugin>',plugin)
        self.assertIn('ILogger<ComposerMetadataController>',controller)
        self.assertIn('ILogger<ComposerSqliteStore>',controller)
        self.assertIn('ILogger<ComposerSqliteStore>?',store)
    def test_log_levels_and_events(self):
        src='\n'.join((ROOT/p).read_text() for p in ('plugin/Plugin.cs','plugin/ComposerMetadataController.cs','plugin/ComposerSqliteStore.cs'))
        for number in ('CSM100','CSM110','CSM201','CSM209','CSM210','CSM500'):
            self.assertIn(number,src)
        for level in ('LogInformation','LogWarning','LogDebug','LogError'):
            self.assertIn(level,src)
    def test_log_token_and_pii_exclusion(self):
        src=(ROOT/'plugin/ComposerSqliteStore.cs').read_text()
        self.assertIn('ComposerLogToken.ForKey(key)',src)
        self.assertNotIn('LogInformation("{Overview}',src)
        self.assertNotIn('LogInformation("{ImageDataUrl}',src)
        self.assertNotIn('LogInformation("{Name}',src)
        self.assertIn('SHA256.HashData',(ROOT/'plugin/ComposerLogToken.cs').read_text())
    def test_no_database_schema_change(self):
        src=(ROOT/'plugin/ComposerSqliteStore.cs').read_text()
        self.assertIn('CREATE TABLE IF NOT EXISTS composer_metadata',src)
        self.assertNotIn('DROP TABLE',src.upper())
        self.assertNotIn('DELETE FROM',src.upper())
        meta=(ROOT/'packaging/package_release.py').read_text()
        self.assertIn("VERSION = '1.2.1'",meta)
        self.assertIn("'version': '1.2.1.0'",meta)
if __name__=='__main__': unittest.main()
