# Composer Shared Metadata — native Jellyfin plugin v1.1.0 + Browser v3.6.0

**Target:** Jellyfin 12.2, .NET 10; Jellyfin Web JavaScript Injector. **No separate Python service. No writes to `jellyfin.db`.**

## IMPORTANT — package status

This archive is **source and automated-build files**, **NOT a ready-to-install plugin binary**. The authoring environment lacks a .NET 10 SDK and cannot reach NuGet; consequently the C# could **not** be compiled, installed or live-tested. The GitHub Actions workflow will build the real plugin DLL and package platform-specific installation ZIPs; inspect CI logs and run on a test Jellyfin server before production deployment. Do **not** put this source ZIP in Jellyfin's plugin folder. The standalone Composer Browser JavaScript is source-only and has passed Node simulations, but it requires a functioning compiled native plugin for shared edits.

## Why this is a native plugin

Source files `.cs` and `.csproj` are **not installed directly**; Jellyfin loads a compiled .NET plugin DLL. The deployment ZIP produced by GitHub Actions includes the compiled DLL, SQLite managed/native runtime binaries and `meta.json`. The Jellyfin server does not need to compile or run Python.

## Architecture

- `plugin/ComposerSqliteStore.cs`: SQLite metadata store under **`<PluginConfigurationsPath>/ComposerSharedMetadata/composer_metadata.sqlite3`**. Path is inside the persistent Jellyfin configuration volume; it is not `jellyfin.db`. Reads never initialize DB. First explicit admin save creates the store. Image blob stored with biography in same database. No direct Jellyfin People or tracks writes.
- `plugin/ComposerMetadataController.cs`: `GET /ComposerSharedMetadata/health`, `/records`, `/image-data?key=...`, `/image?key=...`; `PUT /ComposerSharedMetadata/record?key=...`. All requests must authenticate as a Jellyfin user. PUT requires the Jellyfin elevated-administrator policy. No delete, bulk overwrite, raw SQL or API key in JavaScript.
- `web/jellyfin_composers_api_browser_v3_6_0.js`: preserves the prior tested v3.3/v3.4 list, pagination, split composer display, orphan filtering, responsive layout, same-name artist portrait fallback, credited albums, Music tab, administrator editor, preview+confirmation, and browser-local JSON backup import. Real and virtual composer edits are **overlays** in separate SQLite, so native Jellyfin clients will still show original People metadata.
- `tests/`: .NET SQLite smoke tests and Node browser simulations. `packaging/` and `.github/workflows/` compile/release install ZIPs automatically from source.

## Build with GitHub Actions — no compilation on your Jellyfin server

1. **Export existing virtual edits on the original computer first**. Use the v3.3 **Export virtual edits** feature and preserve that JSON backup. Keep the original browser's localStorage unchanged until you have verified migration.
2. Create a GitHub repository or branch for this plugin, then **upload the contents of this source ZIP preserving `.github/workflows/build-and-package.yml` and its directory path**. This does not require changing PeopleToolkit or overwriting an existing repository.
3. On GitHub, **Actions → Build native Composer plugin → Run workflow**. After it completes successfully, download the artifact named `jellyfin-composer-plugin-1.1.0`. It contains two installation ZIPs, one for `linux-x64` and one for `linux-arm64`, and checksums. No DLL compilation on your server.
4. Confirm your Jellyfin container CPU architecture (`docker exec <jellyfin-container> uname -m`): `x86_64` → `linux-x64`, `aarch64` → `linux-arm64`.
5. **Back up Jellyfin's `/config` volume**; locate the actual mounted `/config/plugins/` folder on your Docker host. Stop Jellyfin. Extract **the platform-specific compiled installation ZIP** so it creates `/config/plugins/ComposerSharedMetadata_1.1.0/` containing the DLL, dependencies and `meta.json`. Do not put the outer source ZIP or the platform ZIP itself inside that folder. Restart Jellyfin.
6. Check Dashboard → Plugins for **Composer Shared Metadata** and check logs for assembly or SQLite errors. Run the *read-only* health check from a Jellyfin browser session:

   ```javascript
   window.ApiClient.getJSON(window.ApiClient.getUrl('ComposerSharedMetadata/health'))
   ```

   Expected `{status:"ready",storage:"plugin-sqlite",pluginVersion:"1.1.0",schemaVersion:1}`. Health does not create the SQLite file; that happens only on an explicit admin save.
7. Disable previous Composer Browser Injector versions and navigation hotfixes. Paste only `web/jellyfin_composers_api_browser_v3_6_0.js` into one Injector entry. Save, hard refresh, open Composers. Run:

   ```javascript
   window.__jfComposerApiV31.status()
   ```

   Expect `version:"3.6.0"`, and after loading, `sharedPluginReady:true`. The People/Audio data continues to come from Jellyfin's native read-only APIs.
8. On the computer holding local edits, select **Migrate local edits to server**, or select **Import JSON backup to server** and choose the exported backup. Preview and confirm. No existing shared record is overwritten by bulk migration. Check Annabelle Chvostek on a different computer after a hard refresh. **Do not clear the original local backup until migration is confirmed.**

## Safety, concurrency and visibility

- Storage key for virtual composer: normalized name (`sample composer`); for real Person: `person:<jellyfin-Person-ID>`. Both types use the **same separate database**, never Jellyfin's native database.
- Each confirmed editor save changes **one key** only, requiring `ExpectedRevision` to match. HTTP 409 prevents silent overwrites from a second browser.
- PNG/JPEG/WebP portraits limited to 6 MiB, with MIME signature checks; biographies limited to 100,000 characters. Omitted image preserves existing portrait.
- Browser continues working for read-only Composer browsing if plugin is unavailable, but shared writes are blocked (no browser-local fallback save).
- Shared metadata is readable to all *authenticated Jellyfin users*. No library-level visibility filtering is implemented in this plugin. Do not store secrets in biographies.
- The plugin has no endpoints that modify native People or music files; **all overlays remain external to `jellyfin.db`.**

## Backup / rollback

- Back up the entire `<PluginConfigurationsPath>/ComposerSharedMetadata` directory, particularly `composer_metadata.sqlite3` (and any SQLite journal/WAL files) together. For hot online backups, use SQLite's `backup` API or `sqlite3 .backup` against the live file; do not merely copy a live WAL database file.
- For rollback, disable the v3.6 Injector entry, stop Jellyfin, and remove/disable **only** this plugin directory (not its data directory). Restart. Native Jellyfin People and track relations are unchanged. Keep the SQLite backup to restore later.
- **Do not run the previous JSON-file plugin and this SQLite plugin simultaneously.** They share the same plugin GUID and endpoints. The browser-local v3.3 backup is not automatically deleted or changed.

## Build/validation commands (for CI, not Jellyfin server)

```bash
dotnet build plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj -c Release
dotnet run --project tests/StoreSmoke.csproj -c Release
node --check web/jellyfin_composers_api_browser_v3_6_0.js
node tests/test_composer_api_v3_6_0.js
dotnet publish plugin/Jellyfin.Plugin.ComposerSharedMetadata.csproj -c Release -r linux-x64 --self-contained false -o out/linux-x64
python3 packaging/package_release.py --publish-dir out/linux-x64 --rid linux-x64  # dry run
python3 packaging/package_release.py --publish-dir out/linux-x64 --rid linux-x64 --apply
```

## Limitations

This plugin source has been compiled or live-tested on Jellyfin 12.2. The CI output cannot be guaranteed installable until the workflow completes and the plugin loads successfully on a test server. A build failure is an actionable compatibility finding, not a successful release. If the manual installed plugin loads but the endpoints return 404, collect Jellyfin logs; controller registration differences may need adjustment. Testing a single preview and save is advised before migrating all edits.
