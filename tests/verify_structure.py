#!/usr/bin/env python3
"""Read-only native plugin source checks v1.2.1. Not a substitute for C# compilation.
Run: python3 tests/verify_structure.py. No files changed.
"""
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import yaml
root=Path(__file__).resolve().parents[1]
project=ET.parse(root/'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj').getroot()
props={e.tag:e.text for e in project.iter() if e.tag in ('TargetFramework','Version')}
assert props['TargetFramework']=='net10.0' and props['Version']=='1.2.1'
refs={(x.attrib['Include'],x.attrib.get('Version','')):x for x in project.findall('.//PackageReference')}
assert ('Jellyfin.Controller','12.2.0') in refs
assert ('Microsoft.Data.Sqlite','10.0.1') in refs
controller=(root/'plugin/ComposerMetadataController.cs').read_text()
store=(root/'plugin/ComposerSqliteStore.cs').read_text()
assert '[Authorize(Policy = Policies.RequiresElevation)]' in controller
assert '[Authorize]' in controller
assert '[HttpPut("record")]' in controller
assert '[HttpGet("records")]' in controller
assert 'composer_metadata.sqlite3' in store
assert 'expectedrevision' in store.lower() and 'Revision' in store
assert 'DELETE FROM' not in store.upper() and 'DROP TABLE' not in store.upper()
assert 'jellyfin.db' not in re.sub(r'/\*.*?\*/','',store,flags=re.S).lower()
flow=(root/'.github/workflows/build-and-package.yml').read_text()
assert 'setup-dotnet@v5' in flow and 'dotnet run --project tests/StoreSmoke.csproj' in flow
assert 'linux-x64' in flow and 'out/linux-arm64' not in flow
assert (root/'web/jellyfin_composers_api_browser_v3_7_0.js').exists()
print('PASS: C# project targets 12.2/net10, separate SQLite, admin PUT, revision guard, build workflow and web file')
