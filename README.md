# Composer Browser v3.7.2 — back navigation and portrait persistence

**Jellyfin 12.2; browser-only Injector hotfix. Requires working Composer Shared Metadata plugin v1.2.1 or later.** No server plugin rebuild is needed for the fixes in this ZIP. No direct Jellyfin database or SQLite writes except existing administrator-triggered editor Save.

1. Back up the current JavaScript Injector code and Jellyfin `/config` (including plugin-owned SQLite storage) before upgrading.
2. Disable every previous Composer Browser Injector entry (v3.7.0, v3.7.1 and older) and replace with **only** `web/jellyfin_composers_api_browser_v3_7_2.js` in one enabled entry.
3. Save Injector settings and hard-refresh the Jellyfin web page (Ctrl+Shift+R).
4. In console, check `window.__jfComposerApiV31.status().version` is `3.7.2`.
5. Open Music → Composers → a composer; click the top Back button (returns to list), then Back again (closes the overlay and reveals Music). If opened from the sidebar while elsewhere, the list Back returns to the underlying Jellyfin screen.
6. Verify Annabelle Chvostek's portrait remains visible after closing and reopening Composers; test another known persisted portrait. Do not reupload images solely to test the fix.

**Root cause fixed:** Reloading SQLite overlay records previously cleared the already-loaded image data URL even when the record revision was unchanged, leaving `_jfcaSharedImageLoaded=true`. The subsequent portrait loader skipped re-fetching, so the image disappeared while the biography remained. This update preserves the image until the record revision changes, and ignores stale in-flight image responses after an update.

**If Annabelle's photo is still missing:** The fix cannot restore a picture if the SQLite record no longer has an image. Check whether the record has a nonempty `imageFile` marker through the authenticated records API and whether `/ComposerSharedMetadata/image-data?key=...` works. Never paste portrait data URLs, authentication tokens or private biographies into an issue. Preserve the SQLite DB and contact us with the HTTP status and Jellyfin CSM logs.

**Testing:** Run `node --check web/jellyfin_composers_api_browser_v3_7_2.js` and `node tests/test_composer_api_v3_7_2.js` (Node 18+). Isolated regressions simulate Jellyfin 12.2; live installation unverified.

**Rollback:** Restore the old single Injector script only after backing up the v3.7.2 code; metadata is untouched by an Injector version change. The plugin GUID and SQLite schema are unchanged.
