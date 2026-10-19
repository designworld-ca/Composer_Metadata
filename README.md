# Composer Shared Metadata v1.2.2 — GitHub CI repair v1.0.0

**Purpose:** Address the stale C# files and capture the actual cause of the failed GitHub Actions build run 39182634665. **This is a source / CI patch, not an installable Jellyfin plugin.** No Jellyfin server reinstall, no JavaScript Injector replacement, and no SQLite database change are needed to try it.

## Why this patch

The source-code locations in your 10 `CS1591` warnings match `v1.2.1`, where `ComposerRecord` appears at line 15 and the public API lacks XML documentation. The previously issued v1.2.2 source ZIP already contains those summaries; however, it appears they were *not* in the GitHub checkout for commit `499ff19`. The warning annotations do not include the real cause of **exit code 1**; it would be misleading to say the warnings caused the failure.

## Apply (GitHub repository root)

1. In **https://github.com/designworld-ca/Composer_Metadata**, extract the ZIP to the **repository root**. Overwrite exactly these files:
   - `plugin/ComposerSqliteStore.cs`
   - `plugin/ComposerMetadataController.cs`
   - `.github/workflows/build-and-package.yml`
   - `tests/preflight_source.py`
   - `tests/test_documentation_warnings.py` (unchanged v1.2.2 warning regression checks)
2. Ensure the repository contains `plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj` with `<Version>1.2.2</Version>` and `<GenerateDocumentationFile>true</GenerateDocumentationFile>`. This package does not overwrite the csproj.
3. Confirm the two `.cs` files now contain `/// <summary>` immediately before their public classes/members. Commit to `main` and push.
4. Run **Actions → Build native Composer plugin**. The new **Verify corrected source and version BEFORE compilation** step fails early, with an actionable error, if GitHub still has the older files.
5. If another step fails, download the **composer-build-diagnostics** artifact from that GitHub Actions run and inspect the log corresponding to the first failed step. It will be available even when the build is unsuccessful. Share the first actual `error ...` line so the underlying issue can be corrected precisely.

## Verify locally without building

`python3 tests/preflight_source.py --version 1.2.2`

The workflow also runs this on the exact checked-out commit. Run `python3 -m unittest discover -s tests -p test_documentation_warnings.py -v` to check all public XML docs.

## Safety and compatibility

- Same plugin GUID `4c65902b-e89d-4549-a313-2a204c622e77`, version `1.2.2`, SQLite schema 1, and API behavior.
- This patch deliberately does **not** touch the working Browser v3.7.2, Jellyfin runtime, Composer images, biographies, or `composer_metadata.sqlite3`.
- Keep v1.2.1 installed and running until a full v1.2.2 GitHub build succeeds and you've backed up Jellyfin `/config`.
- Build remains targeted exclusively to Linux x64; no ARM64 artifact is introduced.
- The complete v1.2.2 source release from the previous delivery should remain your base: this ZIP only replaces five files.

## Limitations

This environment cannot retrieve the private job log content from the public GitHub run, and has no .NET SDK/NuGet access for a real compile. Offline validation cannot prove which command produced the `exit code 1`; the new diagnostics explicitly capture it. The `CS1591` warnings are not treated as build errors by default and will disappear when the corrected C# files are actually compiled.
