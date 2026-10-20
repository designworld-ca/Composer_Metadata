#!/usr/bin/env python3
"""select_composer_build.py — v1.0.2

PURPOSE
-------
Resolve the exact Composer plugin version, release tag and GitHub Actions
artifact name from the checked-out plugin .csproj, not the newest successful
build (which may belong to a previous release).

REQUIREMENTS
------------
Python >=3.10 standard library. Expects a checked-out Composer project
with a three-part <Version> and a four-part <AssemblyVersion> ending in .0.

SAFETY
------
Dry-run by default. --apply explicitly appends only validated key-value
outputs to --github-output. Never accesses GitHub or touches Jellyfin files,
existing releases, or SQLite databases. A manually supplied tag must match.

USAGE
-----
python3 tools/select_composer_build.py --project plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj
python3 tools/select_composer_build.py --project plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj \\
  --release-tag v1.2.2 --github-output "$GITHUB_OUTPUT" --apply
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import xml.etree.ElementTree as ET

VERSION = '1.0.2'
VERSION_RE = re.compile(r'^\d+\.\d+\.\d+$')


def expected_build(project: Path, requested_tag: str = '') -> dict[str, str]:
    if not project.is_file():
        raise ValueError('Plugin .csproj missing: ' + str(project))
    try:
        root = ET.parse(project).getroot()
    except ET.ParseError as exc:
        raise ValueError('Invalid plugin project XML') from exc
    version_tags = [(e.text or '').strip() for e in root.iter() if e.tag.split('}')[-1] == 'Version']
    assembly_tags = [(e.text or '').strip() for e in root.iter() if e.tag.split('}')[-1] == 'AssemblyVersion']
    if len(version_tags) != 1 or not VERSION_RE.fullmatch(version_tags[0]):
        raise ValueError('Project must declare exactly one concrete M.m.p <Version>')
    version = version_tags[0]
    if len(assembly_tags) != 1 or assembly_tags[0] != version + '.0':
        raise ValueError('AssemblyVersion must be ' + version + '.0')
    tag = 'v' + version
    if requested_tag and requested_tag != tag:
        raise ValueError('Release tag mismatch: the checked-out project is ' +
                         version + ' and requires ' + tag + '; input was ' + requested_tag)
    return {
        'EXPECTED_VERSION': version,
        'EXPECTED_TAG': tag,
        'EXPECTED_ARTIFACT': 'jellyfin-composer-plugin-' + version,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--release-tag', default='')
    parser.add_argument('--github-output', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        expected = expected_build(args.project, args.release_tag)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    for key, value in expected.items():
        print(f'{key}={value}')
    if not args.apply:
        print('DRY RUN: no files or releases changed')
        return
    if not args.github_output:
        parser.error('--apply requires --github-output')
    with args.github_output.open('a', encoding='utf-8') as stream:
        for key, value in expected.items():
            stream.write(f'{key}={value}\n')
    print('WROTE: validated GitHub Actions output variables only')


if __name__ == '__main__':
    main()
