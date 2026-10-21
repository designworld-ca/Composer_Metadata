# Upgrade and diagnostics — 1.2.2 / 3.7.2

- The JavaScript Injector must be upgraded separately from the Jellyfin plugin. Make sure only one Composer script is active.
- First use Browser 3.7.2 with plugin 1.2.1; this can address the Back and image-cache bugs immediately.
- To remove the build warnings, merge the C# and workflow files, run Build native Composer plugin, then publish the newly compiled Linux x64 release and manifest as v1.2.2.
- Before changes, back up the entire Jellyfin `/config` volume and the independent `ComposerSharedMetadata/composer_metadata.sqlite3` file.
- The SQLite schema and plugin GUID remain unchanged. The source ZIP is not installable directly.
- Diagnostic for an absent portrait: in the browser console check whether a shared record for the composer has an `imageFile` marker; if yes and image-data GET fails, inspect the request's HTTP status and Jellyfin CSM logs. Never paste base64 images or authentication headers publicly.
- No destructive maintenance or backfill is attempted.
- `actions/upload-artifact@v6` uses Node 24 and requires a runner version of at least 2.327.1; GitHub-hosted ubuntu-24.04 runners are supported.
