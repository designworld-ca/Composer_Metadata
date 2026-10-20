# Composer Metadata — Logging Test Repair v1.0.4

This **test-only** hotfix corrects the GitHub Actions failure:

`AssertionError: "VERSION = '1.2.1'" not found in packaging/package_release.py`

The v1.0.3 packager intentionally derives the plugin version from the C# project rather than a hard-coded `VERSION`. The older test was incorrect for that new design.

## Apply

1. Copy **only** `tests/test_logging.py` into the repository root's `tests/` folder, replacing the old file. Keep your current `packaging/package_release.py` v1.0.3 and all other build/publisher fixes.
2. Commit and push the updated test to the `main` branch of `designworld-ca/Composer_Metadata`.
3. Re-run **Build native Composer plugin**. On success, run **Publish Composer repository manifest** using the new successful build.

No plugin reinstall, JavaScript Injector change, or SQLite schema migration is needed to repair CI.

## Verification (read-only except temporary test files)

```bash
python3 -m unittest discover -s tests -p test_logging.py -v
```

Expected: **5 tests pass**, including checking the real packaged `meta.json` version against `<Version>` in the current `.csproj`, using fake binaries in an automatically deleted temporary directory. **Do not install any ZIP created by the tests:** these contain placeholders, not a working plugin.

The test deliberately retains the logging/privacy checks and explicitly verifies that the stored SQLite schema and `schemaVersion = 1` are unchanged.

## Scope and limitations

- Only `tests/test_logging.py` is replaced; plugin binaries, Jellyfin data, and the GitHub release are not modified.
- This fixes the displayed logging-test failure, but a full live build might reveal another issue.
- GitHub's public repository was not readable from the current tool session. The repair is based on the exact error and packaging code provided, and was tested against the latest supplied source packages.
