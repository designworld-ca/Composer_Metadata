#!/usr/bin/env python3
"""Jellyfin Composer Shared Metadata packaging v1.2.1.

PURPOSE: Make a manual-installable ZIP after a real, successful .NET 10 build.
SAFETY: Default preview, explicit --apply required; never touches Jellyfin files.
USAGE: python3 packaging/package_release.py --publish-dir out/linux-x64 --rid linux-x64 --apply
INPUT: built DLL + SQLite managed/native dependencies from dotnet publish.
OUTPUT: dist/jellyfin-composer-shared-metadata-1.2.1-linux-x64-install.zip
REQUIREMENTS: Python 3.10+; publish must already have succeeded. Do not call this
with source files instead of compiled binaries. Fails if required DLLs are missing.
"""
import argparse
import hashlib
import json
import pathlib
import tempfile
import zipfile

VERSION = '1.2.1'
PLUGIN_ID = '4c65902b-e89d-4549-a313-2a204c622e77'
MAIN_DLL = 'Jellyfin.Plugin.ComposerSharedMetadata.dll'

def execute():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish-dir', required=True)
    parser.add_argument('--rid', required=True, choices=('linux-x64', 'linux-arm64'))
    parser.add_argument('--apply', action='store_true', help='Write ZIP after verifying binary inputs')
    parser.add_argument('--output-dir', default='dist')
    args = parser.parse_args()
    p = pathlib.Path(args.publish_dir)
    if not p.is_dir():
        raise SystemExit('MISSING PUBLISH DIRECTORY: run dotnet publish first.')
    files = [p / MAIN_DLL, p / 'Microsoft.Data.Sqlite.dll']
    sqlite_pcl = sorted(p.glob('SQLitePCLRaw*.dll'))
    files.extend(sqlite_pcl)
    native = list(p.rglob('libe_sqlite3.so'))
    # Native deps may be under RID folder in publish or copied directly at root.
    specific = [f for f in native if (args.rid in f.parts or f.parent == p)]
    if specific: native = specific
    if len(native) != 1:
        raise SystemExit('Expected one native SQLite libe_sqlite3.so for ' + args.rid + ', found ' + str(native))
    files.append(native[0])
    if len(sqlite_pcl) < 2 or any(not f.is_file() for f in files):
        raise SystemExit('Plugin DLL, Microsoft.Data.Sqlite, or SQLitePCLRaw DLLs missing from published output.')
    dep_file = p / 'Jellyfin.Plugin.ComposerSharedMetadata.deps.json'
    if dep_file.exists(): files.append(dep_file)
    names = [(f, f.name) for f in files]
    meta = {
        'name': 'Composer Shared Metadata', 'guid': PLUGIN_ID,
        'version': '1.2.1.0', 'targetAbi': '12.2.0.0',
        'category': 'Metadata', 'description': 'Shared composer metadata SQLite overlays, no Jellyfin DB edits.',
        'status': 'Active', 'autoUpdate': True,
        'assemblies': [MAIN_DLL], 'owner': 'Composer Browser Project'
    }
    out = pathlib.Path(args.output_dir) / ('jellyfin-composer-shared-metadata-' + VERSION + '-' + args.rid + '-install.zip')
    print('PREVIEW: target', out)
    print('PREVIEW: ZIP root contains DLL, SQLite dependencies and meta.json (no nested plugin folder)')
    print('PREVIEW: files', ', '.join(f.name for f, _ in names), 'meta.json')
    if not args.apply:
        print('DRY RUN: no archive created. Pass --apply to package compiled binaries.')
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f, name in names:
            z.write(f, name)
        z.writestr('meta.json', json.dumps(meta, indent=2) + '\n')
    with zipfile.ZipFile(out) as z:
        if z.testzip() is not None: raise RuntimeError('Invalid ZIP CRC')
    print('CREATED:', out)
    print('SHA256:', hashlib.sha256(out.read_bytes()).hexdigest())

if __name__ == '__main__': execute()
