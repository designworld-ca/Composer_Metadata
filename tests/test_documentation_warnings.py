#!/usr/bin/env python3
"""Read-only v1.2.2 check for missing public C# XML API documentation and Node20 actions.

This test does not suppress compiler warnings or claim to replace dotnet build.
"""
import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class DocumentationWarnings(unittest.TestCase):
    def test_all_public_csharp_api_has_xml_summary(self):
        issues = []
        for file in (ROOT / 'plugin').rglob('*.cs'):
            lines = file.read_text().splitlines()
            for i, line in enumerate(lines):
                if not re.match(r'^\s*public\s+', line):
                    continue
                j = i - 1
                while j >= 0 and re.match(r'^\s*\[[^]]*\]\s*$', lines[j]):
                    j -= 1
                if j < 0 or not lines[j].strip().startswith('/// <summary>'):
                    issues.append(f'{file.name}:{i+1}: {line.strip()}')
        self.assertFalse(issues, '\n'.join(issues))
    def test_sqlite_dependency_avoids_nu1903(self):
        import xml.etree.ElementTree as ET
        csproj=ET.parse(ROOT/'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj').getroot()
        packages={p.get('Include'):p.get('Version') for p in csproj.findall('.//PackageReference')}
        self.assertEqual(packages.get('Microsoft.Data.Sqlite'), '10.0.13')
        self.assertNotIn('NuGetAuditSuppress', (ROOT/'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj').read_text())

    def test_node24_artifact_action_and_no_warning_suppression(self):
        workflow=(ROOT/'.github/workflows/build-and-package.yml').read_text()
        self.assertIn('actions/upload-artifact@v6', workflow)
        self.assertNotIn('actions/upload-artifact@v4', workflow)
        csproj=(ROOT/'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj').read_text()
        self.assertIn('<GenerateDocumentationFile>true</GenerateDocumentationFile>',csproj)
        self.assertNotIn('NoWarn>1591',csproj)
        self.assertNotIn('WarningsAsErrors>CS1591',csproj)

if __name__ == '__main__': unittest.main()
