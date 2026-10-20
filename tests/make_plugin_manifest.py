#!/usr/bin/env python3
"""Create/update a Jellyfin repository manifest entry from a *compiled* plugin ZIP.

Version: 1.0.1 (repository metadata publisher; plugin version derived from compiled ZIP)
Purpose: Resolve missing repository metadata for manually installed Composer plugin.
Requirements: Python 3.10+ standard library, real public GitHub Release ZIP.
Safety: Read-only by default. --apply writes ONLY --manifest (never Jellyfin DB).
         Refuses to invent checksums, release versions or DLL files.
Usage: python3 tools/make_plugin_manifest.py --archive releases/x64.zip \\
         --repo designworld-ca/Composer_Metadata --tag v1.1.1 \\
         --manifest manifest.json
       python3 tools/make_plugin_manifest.py ... --apply
External services: none. The published sourceUrl is constructed, not verified.
Assumptions: Jellyfin 12.2, compiled plugin packaging includes meta.json and DLL.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
from urllib.parse import quote
from zipfile import ZipFile, BadZipFile

VERSION = "1.0.1"
GUID = "4c65902b-e89d-4549-a313-2a204c622e77"
DLL = "Jellyfin.Plugin.ComposerSharedMetadata.dll"


def read_package(archive: Path):
    if not archive.is_file() or archive.suffix.lower() != ".zip":
        raise ValueError("Compiled ZIP archive missing")
    with ZipFile(archive) as z:
        if z.testzip() is not None:
            raise ValueError("ZIP CRC check failed")
        names = z.namelist()
        metas = [n for n in names if n.endswith("meta.json") and n.split("/")[-1] == "meta.json"]
        if len(metas) != 1:
            raise ValueError("Expected exactly one plugin meta.json in ZIP")
        prefix = metas[0][:-len("meta.json")]
        if prefix + DLL not in names:
            raise ValueError("Missing compiled plugin DLL alongside meta.json")
        meta = json.loads(z.read(metas[0]).decode("utf-8"))
    if str(meta.get("guid", "")).lower() != GUID:
        raise ValueError("Plugin GUID mismatch: will not register the wrong plugin")
    version = str(meta.get("version", ""))
    target_abi = str(meta.get("targetAbi", ""))
    if not version or not target_abi:
        raise ValueError("meta.json must include version and targetAbi")
    if not target_abi.startswith("12.2."):
        raise ValueError("Expected Jellyfin 12.2 targetAbi; got " + target_abi)
    return meta, version, target_abi


def make_manifest(archive: Path, repo: str, tag: str, manifest: Path, timestamp: str):
    meta, version, target_abi = read_package(archive)
    if not repo or repo.count("/") != 1 or " " in repo:
        raise ValueError("--repo must have form owner/repository")
    if not tag or "/" in tag or " " in tag:
        raise ValueError("Invalid release tag")
    data = archive.read_bytes()
    checksum = hashlib.md5(data).hexdigest()  # Required by Jellyfin repository format.
    release_url = "https://github.com/" + repo + "/releases/download/" + quote(tag, safe="") + "/" + quote(archive.name, safe="")
    entry = {
        "version": version,
        "changelog": "Composer metadata plugin, independently stored in SQLite; Jellyfin 12.2.",
        "targetAbi": target_abi,
        "sourceUrl": release_url,
        "checksum": checksum,
        "timestamp": timestamp,
    }
    if manifest.exists():
        records = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(records, list):
            raise ValueError("Existing manifest is not a JSON array")
    else:
        records = []
    matches = [r for r in records if str(r.get("guid", "")).lower() == GUID]
    if len(matches) > 1:
        raise ValueError("Duplicate plugin GUID entries in manifest")
    if matches:
        record = matches[0]
    else:
        record = {"guid": GUID, "name": "Composer Shared Metadata",
                  "description": "Shared composer biographies and portraits stored separately from Jellyfin's database.",
                  "overview": "Read/edit composer metadata without modifying jellyfin.db",
                  "owner": "designworld-ca", "category": "Metadata", "versions": []}
        records.append(record)
    versions = record.setdefault("versions", [])
    # Keep the previously published timestamp on a no-change rerun.
    for old in versions:
        if (old.get("version") == version and old.get("sourceUrl") == release_url
                and old.get("checksum", "").lower() == checksum):
            entry["timestamp"] = old.get("timestamp", timestamp)
            break
    # Version and URL are matched exactly. Multiple platform-specific ZIPs should
    # NOT share a version; one manifest record points to just one release archive.
    versions[:] = [v for v in versions if v.get("version") != version]
    versions.insert(0, entry)
    return records, release_url, checksum


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--archive", required=True)
    p.add_argument("--repo", default="designworld-ca/Composer_Metadata")
    p.add_argument("--tag", required=True)
    p.add_argument("--manifest", default="manifest.json")
    p.add_argument("--timestamp", default=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()
    archive, manifest = Path(args.archive), Path(args.manifest)
    try:
        records, url, checksum = make_manifest(archive, args.repo, args.tag, manifest, args.timestamp)
    except (ValueError, OSError, BadZipFile, json.JSONDecodeError) as e:
        p.error(str(e))
    print("Validated compiled plugin ZIP:", archive)
    print("Repository download URL:", url)
    print("Jellyfin manifest MD5:", checksum)
    print("Will add or update:", manifest)
    if not args.apply:
        print("DRY RUN: No files written; use --apply after publishing this ZIP as a GitHub Release asset.")
        return
    manifest.parent.mkdir(parents=True, exist_ok=True)
    output = json.dumps(records, indent=2, ensure_ascii=False) + "\n"
    if manifest.exists() and manifest.read_text(encoding="utf-8") == output:
        print("UNCHANGED:", manifest)
        return
    manifest.write_text(output, encoding="utf-8")
    print("WROTE:", manifest)

if __name__ == "__main__":
    main()
