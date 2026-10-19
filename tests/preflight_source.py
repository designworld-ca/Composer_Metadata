#!/usr/bin/env python3
"""Composer Metadata plugin preflight v1.0.1 (Jellyfin 12.2 / .NET 10).

Purpose: read-only validation of the plugin project's compiled C# sources before CI.
Usage: python3 tests/preflight_source.py --version 1.2.2 [--root PATH]
Safety: no writes to source, Jellyfin data, or SQLite; no network calls.
Requirements: Python 3.10+, stdlib only.
Expected paths: plugin/*.cs and plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj.
"""
import argparse
import hashlib
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = ('ComposerMetadataController.cs', 'ComposerSqliteStore.cs')


def check(expected_version: str, root: pathlib.Path = ROOT) -> int:
    problems = []  # (relative_path, line, explanation)
    root = root.resolve()
    print(f'CSM PREFLIGHT: checked-out repository root: {root}', flush=True)
    csproj = root/'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj'
    relproj = 'plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj'
    try:
        tree = ET.parse(csproj)
        version = tree.findtext('.//Version')
        assembly_version = tree.findtext('.//AssemblyVersion')
        docs = tree.findtext('.//GenerateDocumentationFile')
        print(f'PROJECT: Version={version!r}, AssemblyVersion={assembly_version!r}, GenerateDocumentationFile={docs!r}', flush=True)
        if version != expected_version:
            problems.append((relproj, 1, f'project <Version> is {version!r}; expected {expected_version!r}'))
        if assembly_version != expected_version + '.0':
            problems.append((relproj, 1, f'project <AssemblyVersion> is {assembly_version!r}; expected {expected_version}.0'))
        if (docs or '').lower() != 'true':
            problems.append((relproj, 1, 'GenerateDocumentationFile must be true'))
    except (OSError, ET.ParseError) as exc:
        problems.append((relproj, 1, f'project missing or unreadable: {exc}'))

    for filename in SOURCES:
        rel = 'plugin/' + filename
        path = root / rel
        try:
            contents = path.read_bytes()
            lines = contents.decode('utf-8').splitlines()
        except (OSError, UnicodeDecodeError) as exc:
            problems.append((rel, 1, f'C# source missing or unreadable: {exc}'))
            continue
        print(f'SOURCE: {rel} | sha256={hashlib.sha256(contents).hexdigest()} | lines={len(lines)}', flush=True)
        missing = 0
        for idx, line in enumerate(lines):
            if not re.match(r'^\s*public\s+', line):
                continue
            prev = idx - 1
            while prev >= 0 and re.match(r'^\s*\[[^]]*\]\s*$', lines[prev]):
                prev -= 1
            if prev < 0 or not lines[prev].strip().startswith('/// <summary>'):
                missing += 1
                problems.append((rel, idx+1, f'CS1591 missing XML summary above: {line.strip()}'))
        print(f'DOCUMENTATION: {rel}: {missing} missing public XML summaries', flush=True)

    controller = root/'plugin/ComposerMetadataController.cs'
    if controller.is_file():
        src = controller.read_text(encoding='utf-8')
        if f'pluginVersion = "{expected_version}"' not in src:
            problems.append(('plugin/ComposerMetadataController.cs', 1,
                             f'health endpoint must declare pluginVersion = "{expected_version}"'))

    if problems:
        print(f'PREFLIGHT FAILED: {len(problems)} mismatch(es) in this GitHub checkout:', file=sys.stderr, flush=True)
        for rel, lineno, issue in problems:
            print(f' - {rel}:{lineno}: {issue}', file=sys.stderr, flush=True)
            # GitHub actions annotation; errors show under workflow summaries as well.
            safe = issue.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
            print(f'::error file={rel},line={lineno},title=Composer source preflight::{safe}', flush=True)
        print('FIX: Replace the three files in plugin/ AT THE REPOSITORY ROOT with those', file=sys.stderr)
        print('     included in composer-ci-diagnostic-repair-v1.0.1.zip, then commit/push.', file=sys.stderr)
        print('     Do not put files inside another ZIP directory or create a duplicate plugin/ folder.', file=sys.stderr)
        return 1
    print(f'PREFLIGHT PASSED: plugin source and documentation match v{expected_version}', flush=True)
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', default='1.2.2')
    parser.add_argument('--root', type=pathlib.Path, default=ROOT,
                        help='Check a different directory (read-only, for offline tests).')
    args = parser.parse_args()
    raise SystemExit(check(args.version, args.root))
