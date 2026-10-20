# Changelog — Publisher consistency v1.0.3

- **Fixed:** packaging version and `meta.json` now read the native plugin project version, not a hardcoded number.
- **Fixed:** build derives versioned Actions artifact name from the project and validates the compiled ZIP before upload.
- **Fixed:** publisher checks each candidate ZIP *before* selecting a run; rejects mislabeled v1.2.1 releases even if artifact is named 1.2.2.
- **Preserved:** existing GitHub Release checksum protection; no overwrites or deletions.
- **Preserved:** Linux x64 only, plugin GUID, SQLite schema, Jellyfin database and browser behavior.
- **Tests:** fake package archives, invalid explicitly selected run, mislabeled artifact fallback, shell-syntax and version consistency tests.
