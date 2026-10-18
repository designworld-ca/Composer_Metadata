#!/usr/bin/env python3
"""prepare_x64_release.py — Version 1.0.1

PURPOSE
-------
Validate the actual compiled Composer plugin Linux x64 installation ZIP
and determine the exact GitHub Release tag from its plugin meta.json.

SAFETY
------
Read-only by default. --apply only appends validated output values to a
specified GitHub Actions GITHUB_OUTPUT file. Never touches Jellyfin databases,
existing releases, or plugin installation files. Requires an existing compiled
archive, refuses an ARM64 archive, wrong plugin GUID or invalid target ABI.

DEPENDENCIES / REQUIREMENTS
---------------------------
Python 3.10+ standard library, tools/make_plugin_manifest.py and a compiled
Jellyfin 12.2 installation archive produced by the project's build workflow.
No API key, GitHub credentials, .NET SDK, or credentials are needed.

USAGE
-----
python3 tools/prepare_x64_release.py --archive downloaded/....linux-x64-install.zip
python3 tools/prepare_x64_release.py --archive ... --release-tag v1.1.0 \
    --github-output "$GITHUB_OUTPUT" --apply
"""
from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

from make_plugin_manifest import read_package

VERSION = '1.0.1'
VERSION_RE = re.compile(r'^(\d+)\.(\d+)\.(\d+)\.0$')
SUFFIX = '-linux-x64-install.zip'


def inspect_release(archive: Path, requested_tag: str = '') -> dict[str, str]:
    if not archive.name.endswith(SUFFIX):
        raise ValueError('Release must be compiled Linux x64 installation ZIP ending ' + SUFFIX)
    meta, plugin_version, target_abi = read_package(archive)
    match = VERSION_RE.fullmatch(plugin_version)
    if not match:
        raise ValueError('Unexpected plugin version ' + plugin_version + '; expected M.m.p.0')
    version = '.'.join(match.groups())
    tag = 'v' + version
    if requested_tag and requested_tag != tag:
        raise ValueError('Release tag mismatch: archive version ' + plugin_version +
                         ' requires ' + tag + ', got ' + requested_tag)
    if not target_abi.startswith('12.2.'):
        raise ValueError('Target ABI must match Jellyfin 12.2')
    if plugin_version.split('.')[:3] != archive.name[:-len(SUFFIX)].split('-')[-1].split('.')[:3]:
        raise ValueError('Archive filename version does not match meta.json version')
    return {
        'RELEASE_TAG': tag,
        'ASSET_NAME': archive.name,
        'ASSET_SHA256': hashlib.sha256(archive.read_bytes()).hexdigest(),
        'PLUGIN_VERSION': plugin_version,
        'TARGET_ABI': target_abi,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive', type=Path, required=True)
    p.add_argument('--release-tag', default='', help='Optional tag; must match the compiled archive version')
    p.add_argument('--github-output', type=Path, help='GitHub Actions output file for the values')
    p.add_argument('--apply', action='store_true', help='Write outputs, never changes the compiled archive')
    args = p.parse_args()
    try:
        values = inspect_release(args.archive, args.release_tag)
    except (ValueError, OSError, KeyError) as exc:
        p.error(str(exc))
    for key, value in values.items():
        print(key + '=' + value)
    if not args.apply:
        print('DRY RUN: no outputs written')
        return
    if not args.github_output:
        p.error('--apply requires --github-output')
    with args.github_output.open('a', encoding='utf-8') as f:
        for key, value in values.items():
            f.write(key + '=' + value + '\n')
    print('WROTE: GitHub Actions output variables (no Jellyfin data changed)')


if __name__ == '__main__':
    main()
