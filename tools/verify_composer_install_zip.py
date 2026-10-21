#!/usr/bin/env python3
"""verify_composer_install_zip.py v1.0.0 — Jellyfin 12.2 Composer release ZIP verifier.

PURPOSE: Verify ZIP CRC, plugin GUID, metadata version/ABI, flat Linux x64 layout,
required SQLite managed/native files and Jellyfin meta.json assembly allowlist.
REQUIREMENTS: Python 3.10+ standard library; use after packaging, before upload.
SAFETY: Read-only. Does not write files, query the server or modify SQLite.
MODES: --strict additionally verifies PE MZ and x86_64 ELF magic; default permits
fake-binary fixtures used by offline packaging unit tests.
USAGE: python3 tools/verify_composer_install_zip.py --archive dist/...linux-x64-install.zip --expected-version 1.2.3 --strict
LIMITATIONS: Does not replace an actual Jellyfin startup/integration check.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from zipfile import ZipFile

VERSION = '1.0.0'
GUID = '4c65902b-e89d-4549-a313-2a204c622e77'
MAIN_DLL = 'Jellyfin.Plugin.ComposerSharedMetadata.dll'
REQUIRED_MANAGED = (
    MAIN_DLL,
    'Microsoft.Data.Sqlite.dll',
    'SQLitePCLRaw.core.dll',
    'SQLitePCLRaw.provider.e_sqlite3.dll',
    'SQLitePCLRaw.batteries_v2.dll',
)
NATIVE_NAME = 'libe_sqlite3.so'


def validate(archive: Path, expected_version: str, strict: bool = False) -> dict:
    if not archive.name.endswith('-linux-x64-install.zip'):
        raise ValueError('Expected Linux x64 installation archive filename')
    with ZipFile(archive) as z:
        if z.testzip() is not None:
            raise ValueError('ZIP CRC check failed')
        names = z.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate ZIP entries')
        if any('/' in name or '\\' in name or '..' in name for name in names):
            raise ValueError('ZIP must have a flat root and no traversal entries')
        required = ('meta.json', NATIVE_NAME, *REQUIRED_MANAGED)
        missing = set(required) - set(names)
        if missing:
            raise ValueError('Missing required SQLite/plugin files: ' + ', '.join(sorted(missing)))
        meta = json.loads(z.read('meta.json'))
        if meta.get('guid', '').lower() != GUID:
            raise ValueError('Plugin GUID mismatch')
        if meta.get('version') != expected_version + '.0':
            raise ValueError('Plugin release version mismatch')
        if not str(meta.get('targetAbi', '')).startswith('12.2.'):
            raise ValueError('Plugin target ABI must be Jellyfin 12.2')
        assemblies = meta.get('assemblies')
        expected_assemblies = {name for name in names if name.endswith('.dll')}
        if not isinstance(assemblies, list) or len(assemblies) != len(set(assemblies)):
            raise ValueError('Invalid or duplicate meta.json assemblies')
        if set(assemblies) != expected_assemblies:
            raise ValueError('meta.json assemblies must enumerate every managed DLL (not native .so); ' +
                             'missing=' + repr(sorted(expected_assemblies - set(assemblies))) +
                             ', extra=' + repr(sorted(set(assemblies) - expected_assemblies)))
        if MAIN_DLL not in assemblies or 'Microsoft.Data.Sqlite.dll' not in assemblies:
            raise ValueError('Plugin and Microsoft.Data.Sqlite must both be in the assembly load list')
        if any(z.getinfo(name).file_size == 0 for name in required):
            raise ValueError('Empty required DLL or SQLite native library')
        if strict:
            for name in expected_assemblies:
                with z.open(name) as f:
                    if f.read(2) != b'MZ':
                        raise ValueError(name + ' is not a PE assembly')
            with z.open(NATIVE_NAME) as f:
                h = f.read(20)
                if h[:4] != b'\x7fELF' or h[4] != 2 or h[5] != 1 or h[18:20] != b'\x3e\x00':
                    raise ValueError('Native SQLite library is not a Linux x64 ELF file')
        deps = 'Jellyfin.Plugin.ComposerSharedMetadata.deps.json'
        if deps in names:
            raw = json.loads(z.read(deps))
            libs = raw.get('libraries', {})
            if not any(k.startswith('Microsoft.Data.Sqlite.Core/10.0.13') or
                       k.startswith('Microsoft.Data.Sqlite/10.0.13') for k in libs):
                raise ValueError('Published dependency manifest does not identify Microsoft.Data.Sqlite 10.0.13')
            if any(k.startswith('SQLitePCLRaw.lib.e_sqlite3/2.1.11') for k in libs):
                raise ValueError('Vulnerable SQLitePCLRaw native 2.1.11 is present in .deps.json')
    return {'version': meta['version'], 'assemblies': len(assemblies), 'validated_files': len(required)}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--archive', required=True, type=Path)
    ap.add_argument('--expected-version', required=True)
    ap.add_argument('--strict', action='store_true')
    args = ap.parse_args()
    try:
        result = validate(args.archive, args.expected_version, args.strict)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        ap.error(str(exc))
    print('PASS: compiled Composer archive verified:', args.archive)
    print('Version:', result['version'], '| Managed assemblies whitelisted:', result['assemblies'],
          '| Strict binaries:', args.strict)


if __name__ == '__main__':
    main()
