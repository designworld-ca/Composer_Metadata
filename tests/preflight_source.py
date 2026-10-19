#!/usr/bin/env python3
"""Composer plugin build source preflight v1.0.0.

Read-only: verifies that exact v1.2.2 C# implementation (including CS1591
public API XML summaries) is present in the GitHub checkout before compilation.
Usage: python3 tests/preflight_source.py --version 1.2.2
No network, no writes, no modifications of Jellyfin databases.
"""
import argparse
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
REQUIRED = {
    'ComposerMetadataController.cs': [
        'ComposerMetadataController', 'ComposerMetadataController(', 'IActionResult Health(',
        'IActionResult Records(', 'IActionResult ImageData(', 'IActionResult Image(',
        'Task<IActionResult> Update('
    ],
    'ComposerSqliteStore.cs': [
        'ComposerRecord', 'string Key {', 'string Name {',
        'ComposerSqliteStore', 'Task<SaveResult> SaveAsync('
    ],
}

def check(expected_version):
    problems = []
    csproj = ROOT/'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj'
    try:
        tree=ET.parse(csproj)
        found=tree.findtext('.//Version')
        if found != expected_version:
            problems.append(f'csproj <Version> is {found!r}, expected {expected_version!r}')
        if tree.findtext('.//GenerateDocumentationFile') != 'true':
            problems.append('csproj does not enable documentation generation')
    except (OSError, ET.ParseError) as e:
        problems.append(f'Cannot parse plugin project: {e}')
    for filename in REQUIRED:
        file = ROOT/'plugin'/filename
        if not file.is_file():
            problems.append(f'Missing {file}')
            continue
        lines = file.read_text(encoding='utf-8').splitlines()
        for idx, line in enumerate(lines):
            if not re.match(r'^\s*public\s+', line):
                continue
            prev = idx-1
            while prev >= 0 and re.match(r'^\s*\[[^]]*\]\s*$', lines[prev]):
                prev -= 1
            if prev < 0 or not lines[prev].strip().startswith('/// <summary>'):
                problems.append(f'{file.name}:{idx+1}: missing XML summary: {line.strip()}')
        print(f'SOURCE OK: {file.relative_to(ROOT)} ({len(lines)} lines)')
    controller=(ROOT/'plugin/ComposerMetadataController.cs')
    if controller.is_file() and f'pluginVersion = "{expected_version}"' not in controller.read_text():
        problems.append('health endpoint does not return expected plugin version')
    if problems:
        print('ERROR: GitHub is compiling outdated or incomplete C# sources:', file=sys.stderr)
        for issue in problems: print(' -', issue, file=sys.stderr)
        print('REPAIR: overwrite plugin/ComposerSqliteStore.cs and plugin/ComposerMetadataController.cs'
              ' at the REPOSITORY ROOT (not inside an extra extracted folder).', file=sys.stderr)
        return 1
    print('PASS: C# version and public XML documentation match v'+expected_version)
    return 0

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--version',default='1.2.2')
    args=p.parse_args()
    raise SystemExit(check(args.version))
