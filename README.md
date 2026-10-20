# Composer Metadata — Linux x64 release consistency fix v1.0.3

**Purpose:** Prevent a `v1.2.2` GitHub release from accidentally receiving an Actions artifact whose ZIP contains `meta.json` version `1.2.1.0`.

**Deliverable type:** Source/workflow overlay ZIP, **not** a compiled Jellyfin plugin. It does not contain new C# code, replace any plugin binaries, or change the Composer Browser.

**Target:** Jellyfin 12.2, native Composer Shared Metadata Linux x64 plugin, GitHub repository `designworld-ca/Composer_Metadata`. All publishing is manual; the plugin's SQLite schema, GUID `4c65902b-e89d-4549-a313-2a204c622e77`, Jellyfin configuration, and previously published release assets remain unchanged.

## What failed

The publisher used the project version to choose an **Actions artifact name** `jellyfin-composer-plugin-1.2.2`, but downloaded an installation ZIP that identified itself as **1.2.1.0**. The release validator refused to publish v1.2.2 using that wrong ZIP. The presence of the misleading artifact means some combination of prior build/packaging workflow and project metadata was out of sync; the live repository's exact mismatch is not independently verified in this offline environment.

Do **not** rename the ZIP, edit `meta.json` manually, overwrite v1.2.1, delete releases, or alter the SQLite database to get past this check. The correct fix is to build a consistent new artifact.

## Included files

- `.github/workflows/build-and-package.yml` — build archive name, artifact name and release tag derive from project version. It validates the ZIP **before upload**. The separate publishing workflow, not an automatic tag action, handles GitHub Releases.
- `.github/workflows/publish-composer-manifest.yml` — after finding each matching-named artifact, **downloads and validates its actual ZIP contents**; skips incorrectly versioned runs; accepts an explicitly chosen run only if valid; never replaces an existing release asset with different bytes.
- `packaging/package_release.py` — derives installation filename and `meta.json` version directly from `plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj`. Default is preview; `--apply` is required to create ZIP files.
- `tools/select_composer_build.py`, `tools/prepare_x64_release.py`, `tools/make_plugin_manifest.py` — retained validated tools required by the two workflows.
- `tests/*` — offline tests, including mocked GitHub artifact selection with an incorrectly labeled v1.2.1 ZIP and correct v1.2.2 ZIP.

## Update the GitHub repository

1. Extract this overlay into the **root** of `https://github.com/designworld-ca/Composer_Metadata`, preserving the hidden `.github/` folder. Review the diff against your current files before committing, as your GitHub repository may include newer local modifications. Replace the matching workflow, packaging, and helper files.
2. Verify the existing `plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj` actually declares `<Version>1.2.2</Version>` and `<AssemblyVersion>1.2.2.0</AssemblyVersion>`. **This ZIP intentionally does not overwrite that project file**, to preserve your recent NuGet/security fixes.
3. Commit and push to `main`. The push normally starts **Build native Composer plugin**; alternatively run that build workflow manually. Make sure it completes successfully **after these changes were committed**. Successful runs before this fix may contain mislabeled artifacts and should not be reused.
4. The successful build must show `Validate compiled ZIP version before publishing artifact` passing and create artifact `jellyfin-composer-plugin-1.2.2`. Its installation ZIP must have a filename ending `1.2.2-linux-x64-install.zip` and `meta.json` version `1.2.2.0`.
5. Run **Publish Composer repository manifest**. Leave inputs blank. The publisher now checks each candidate's embedded version and should choose a valid 1.2.2 ZIP (or fail clearly if none exists).
6. Verify the GitHub `v1.2.2` release and `manifest.json` are correct before updating the Jellyfin installation. Back up Jellyfin's `/config`, including the independent Composer SQLite file, as normal for an update.

**If there is no valid v1.2.2 build**, the publisher will now report `No VALID successful build with a v1.2.2 Linux x64 ZIP found`. This is intentional: fix and rerun the native build rather than forcing publication.

**If an existing GitHub Release v1.2.2 contains a different ZIP**, release immutability protection remains active. Compare hashes and investigate; for changed binaries after publication, increment the plugin version and publish a new release rather than clobbering assets.

## Preview and test (read-only)

```bash
python3 tools/select_composer_build.py --project plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj
python3 -m unittest discover -s tests -p test_release_consistency_v103.py -v
python3 -m unittest discover -s tests -p test_publisher_workflow.py -v
python3 -m unittest discover -s tests -p test_select_composer_build.py -v
python3 -m unittest discover -s tests -p test_x64_release.py -v
```

A source preview does not need .NET or GitHub credentials. The actual GitHub Actions build requires NuGet/.NET access, and the publication requires normal repository workflow permissions. **Neither was executed live during creation of this ZIP.**

## Rollback and safety

This overlay has no effect on your running Jellyfin plugin until you separately publish and install an updated compiled release. It cannot modify `jellyfin.db` or `composer_metadata.sqlite3`. To roll back workflow changes, revert the overlay commit in GitHub. Keep the existing v1.2.1 release and your working v3.7.2 Composer Browser until v1.2.2 is verified.
