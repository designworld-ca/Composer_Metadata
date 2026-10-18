#!/usr/bin/env python3
"""Offline packaging smoke test v1.2.1.
Uses fake file headers only inside a temporary directory. Never builds or publishes fake plugins.
The output is NOT an installable ZIP. No Jellyfin files touched.
"""
import pathlib
import subprocess
import tempfile
import zipfile
root = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='jf-pack-test-') as directory:
    root_temp = pathlib.Path(directory)
    pub = root_temp / 'publish'
    pub.mkdir()
    expected = ['Jellyfin.Plugin.ComposerSharedMetadata.dll', 'Microsoft.Data.Sqlite.dll', 'SQLitePCLRaw.core.dll', 'SQLitePCLRaw.provider.e_sqlite3.dll', 'libe_sqlite3.so']
    for name in expected: (pub / name).write_bytes(b'not-a-real-binary-test-only')
    command=['python3',str(root/'packaging/package_release.py'),'--publish-dir',str(pub),'--rid','linux-x64','--output-dir',str(root_temp/'dist')]
    check=subprocess.run(command,capture_output=True,text=True,check=True)
    assert 'DRY RUN' in check.stdout
    assert not list((root_temp/'dist').glob('*.zip')) if (root_temp/'dist').exists() else True
    built=subprocess.run(command+['--apply'],capture_output=True,text=True,check=True)
    zipped=list((root_temp/'dist').glob('*.zip'))
    assert len(zipped)==1
    with zipfile.ZipFile(zipped[0]) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist())==len(expected)+1
        assert 'meta.json' in archive.namelist()
        assert 'Jellyfin.Plugin.ComposerSharedMetadata.dll' in archive.namelist()
        assert not any('/' in name for name in archive.namelist()), 'release ZIP may not nest the plugin DLL'
print('PASS: packaging default dry-run, required dependencies, CRC and install ZIP layout (fake binaries only in temporary test)')
