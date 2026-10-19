# Composer Shared Metadata — targeted CI source/preflight repair v1.0.1

**Purpose:** The GitHub Actions build run 39183563689 failed at source preflight. Its summary displayed only the generic error, not the individual mismatches. This repair makes every mismatch visible in the Actions summary and includes all three expected v1.2.2 C# project files.

**This is not a compiled plugin ZIP.** Keep the working Jellyfin plugin v1.2.1 and Composer Browser v3.7.2 installed. No changes to Jellyfin configuration, composer biographies, image BLOBs, or `composer_metadata.sqlite3` are necessary.

## Root cause and confidence

- The summary proves the preflight step failed; it does **not** prove which individual condition failed. The original script checked the C# source XML comments, project version, documentation setting, and API health version. Its summary mistakenly filtered out lines prefixed ` - `.
- Running the preflight offline on the complete previously delivered v1.2.2 source succeeds. Therefore the prior archive is internally consistent, but the checked-out GitHub commit is not yet confirmed to match it.
- We cannot independently retrieve the precise contents of your failed GitHub job from this runtime. The revised workflow displays the whole preflight report to resolve the ambiguity.

## Apply directly to your repository

1. Open https://github.com/designworld-ca/Composer_Metadata and select the **main** branch.
2. Extract this ZIP. Copy the three files from `plugin/` into the existing **repository-root** `plugin/` folder, replacing their exact filename matches:
   - `plugin/ComposerMetadataController.cs`
   - `plugin/ComposerSqliteStore.cs`
   - `plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj`
3. Also overwrite `.github/workflows/build-and-package.yml`, `tests/preflight_source.py` and `tests/test_documentation_warnings.py`. Preserve the hidden `.github` folder path; do not upload an enclosing parent directory.
4. **Commit the files to `main`**. GitHub Actions builds the committed source; a local extracted ZIP or an uncommitted upload is not included.
5. Run **Actions → Build native Composer plugin → Run workflow**, choosing **main**. In its `Verify corrected source...` step look for `PREFLIGHT PASSED: plugin source and documentation match v1.2.2`.
6. If the job fails again, the GitHub Actions Summary now shows **every** missing file/version/comment rather than merely the first generic error. The `composer-build-diagnostics` artifact retains the complete logs.

Direct browser links to check the committed files:

- https://github.com/designworld-ca/Composer_Metadata/blob/main/plugin/ComposerMetadataController.cs
- https://github.com/designworld-ca/Composer_Metadata/blob/main/plugin/ComposerSqliteStore.cs
- https://github.com/designworld-ca/Composer_Metadata/blob/main/plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj

## Verification on a local repository clone

```bash
python3 tests/preflight_source.py --version 1.2.2
python3 -m unittest discover -s tests -p 'test_preflight_source.py' -v
python3 -m unittest discover -s tests -p 'test_documentation_warnings.py' -v
```

All commands above are read-only to the Jellyfin environment. The unit tests only create disposable test files in their temporary test directories.

## Safety and scope

- Native plugin GUID **4c65902b-e89d-4549-a313-2a204c622e77** is unchanged; version v1.2.2, SQLite schema v1.
- No changes to database code behavior, editor JavaScript, API contract, C# logging, or release packaging.
- Runner is `ubuntu-24.04`, only `linux-x64` native publish, and `actions/upload-artifact@v6`.
- No .NET SDK or live GitHub Actions execution is available in this runtime; the next CI run remains the definitive compile test.
