function jellyfinComposerApiBrowserV360() {
    'use strict';
    var VERSION = '3.7.0';
    var KEY = '__jfComposerApiV31';
    if (window[KEY] && window[KEY].loaded) { return; }

    /*
     * Jellyfin Composer API Browser v3.7.0
     * Target: Jellyfin 12.2 Web (Modern/Legacy), JavaScript Injector.
     *
     * PURPOSE
     * - Admin-only on-demand metadata editor for all composers using
     *   Composer Shared Metadata plugin SQLite overlays (no Jellyfin item edits).
     * - Preview and explicit save confirmation before writes. No bulk writes.
     * - For split-name virtual composers: shared plugin metadata with migration from browser-local backups, with
     *   explicit JSON export/import. Never mutate a combined Person record.
     * - Missing Metadata filter; exact-name artist metadata copying.
     * - Do not rename People; changing names could sever credit matching.
     * - Retrieve current Composer People with GET /Persons?PersonTypes=Composer.
     * - Retrieve Composer credits on ALL Audio items using GET /Items and
     *   Fields=People. Only list names found on actual songs.
     * - Split semicolon-delimited Person names for display, e.g.
     *   "Colin Cripps;Kathleen Edwards" becomes TWO composer views.
     * - Album attribution uses real track AlbumIds (one song is enough).
     * - Display composer pictures/biographies and album covers; on demand,
     *   use an exact-name MusicArtist match as a read-only image/bio fallback.
     * - Add Composers beside the actual Material UI Artists tab in Jellyfin 12.2
     *   Music, when visible; also add a matching main-menu link beside Music.
     * - No floating shortcut; use Music tab or main menu link.
     * - No generated track data, no direct SQLite/database access and no API key.
     *
     * SAFETY
     * - READ-ONLY BY DEFAULT. Explicit admin Save sends plugin PUT only.
     * - Existing composer/track links, names and albums are never edited.
     * - Real and virtual People: overlay plugin SQLite overlays; no Jellyfin item updates.
     * - Virtual People: save only shared plugin SQLite overrides, never jellyfin.db.
     * - Jellyfin checks admin authorization on all plugin PUT requests.
     * - Uses only GET APIs until user explicitly previews and confirms Save or Migration.
     * - No direct database or music-file writes, library rescans or deletions.
     * - No token or API-key is embedded or persisted by this script.
     * - Uses the authenticated window.ApiClient already present in Jellyfin Web.
     * - Background prefetch on Jellyfin Web startup; first list displays before track scan finishes.
     * - Does not modify Jellyfin-owned tabs, only inserts/removes its own link.
     * - React may rebuild the tab row, so a periodic scan safely reattaches it.
     * - All navigation insertion is DOM-only and disappears on disabling the script.
     * - v3.1.3 replaced the async pagination IIFE with a named helper;
     *   no functions are declared inside the People pagination loops.
     * - v3.1.4 expands the Composer grid to the available viewport width
     *   instead of limiting the panel body/header to 1200px. Album cards
     *   show only the credited-song count below the title, preventing
     *   [object Object] from Jellyfin 12 AlbumArtists DTO objects.
     * - AlbumArtists objects are safely normalized by Name for fallback
     *   grouping when a song has no AlbumId; IDs remain authoritative.
     * - This is PRESENTATION-ONLY reconciliation. It never deletes orphan
     *   People or splits them inside Jellyfin's database or audio tags.
     * - Persons with no AUDIO credit are excluded from this Music browser.
     *   They are not necessarily database orphans if linked to other media.
     * - Composer Type credit on the track is authoritative.
     * - The initial all-Audio scan may take longer for large libraries.
     * - Permissions: requests are made as the signed-in Jellyfin Web user.
     *
     * INSTALL
     * - DISABLE earlier composer browser v1.x/v2.x AND v2.1.x navigation hotfixes.
     * - Paste this WHOLE file in ONE enabled JavaScript Injector entry.
     * - Save, hard-refresh, open Music > Composers. No static music catalog.
     * - Console diagnostics: window.__jfComposerApiV31.status()
     * - Console open: window.__jfComposerApiV31.show()
     * - Console rescan: window.__jfComposerApiV31.rescan()
     *
     * KNOWN LIMITATIONS
     * - Tested with mocked API/DOM, NOT on the user's live Jellyfin 12.2.
     * - Native-looking tab is a DOM injection, not a registered Jellyfin React
     *   route. Changes to Jellyfin Web button markup can require a new selector.
     * - Album navigation uses Jellyfin Web's #/details?id=... route and may
     *   require adaptation on Web builds with different client routing.
     * - Artist fallback is by exact normalized name only, never fuzzy identity.
     * - The web-only injector does not affect native clients (TV, Roku).
     * - Browser-side cached People list refreshed with Refresh; new composers
     *   require a refresh or new session rather than re-generating JavaScript.
     * - v3.2.1: list portraits use the SAME exact-name MusicArtist fallback as
     *   the detail view (fixes Billy Esteban photo missing from composer grid).
     * - Lazy card image loading is read-only, throttled to four simultaneous
     *   lookups, cached by normalized name, and ignored after page changes.
     * - Original Composer portrait remains highest priority; no fuzzy matching.
     * - Local edits to split-name virtual composers are server-backed; they do
     *   synchronize between browsers via the plugin. Export/import backups are supported.
     * - Plugin writes are unverified on the live Jellyfin 12.2 server;
     *   back up plugin configuration and migrate a single composer first.
     * - No direct /Items metadata writes are made by this browser.
     * - Copy-from-Artist image requires authenticated image access from Web.
     * - Plugin overlays remain separate from Jellyfin metadata scans.
     * - Rename Person is intentionally disabled; could sever track credits.
     */

    // Composer Browser v3.7.0: fast first display, background track indexing, verified SQLite saves.

    var PREFIX = '[Composer API Browser ' + VERSION + ']';
    var PANEL = 'jfca-v31-panel';
    var BODY = 'jfca-v31-body';
    var TITLE = 'jfca-v31-title';
    var SHORTCUT = 'jfca-v31-shortcut';
    var NAV = 'jfca-v31-nav';
    var MUSIC_TAB = 'jfca-v31-music-tab';
    var CSS = 'jfca-v31-style';
    var pageSize = 60;
    var apiPeopleSize = 200;
    var apiTracksSize = 200;
    var apiAudioSize = 500;
    var people = [];
    var rawPeople = [];
    var tracksByName = Object.create(null);
    var originalCreditedNames = Object.create(null);
    var audioScanned = 0;
    var creditedAudio = 0;
    var uncreditedPeople = [];
    var splitPeople = [];
    var detailsCache = {};
    var artistMatchCache = Object.create(null);
    var artistLookupQueue = [];
    var artistLookupActive = 0;
    var ARTIST_LOOKUP_LIMIT = 4;
    var lastLoaded = 0;
    var pending = null;
    var warmPending = null;
    var musicIndexed = false;
    var warmTimer = null;
    var current = null;
    var opened = false;
    var mode = 'list';
    var page = 0;
    var search = '';
    var selectedId = '';
    var requestSerial = 0;
    var errorText = '';
    var navigationInsertions = 0;
    var musicTabInsertions = 0;
    var musicTabPlacement = 'none';
    var albumCount = 0;
    var lastPeopleTotal = 0;
    var LIST_TTL = 5 * 60 * 1000;
    var missingOnly = false;
    var editorDraft = null;
    var adminCheck = null;
    var editorFile = null;
    var editorImageBase64 = '';
    var editorImageMime = '';
    var editorError = '';
    var editorBusy = false;
    var virtualStoreKey = 'jfca-v330-virtual:';
    var MAX_IMAGE_BYTES = 6 * 1024 * 1024;
    // Jellyfin 12.2 Composer Shared Metadata native SQLite plugin v1.2.0 (independent of jellyfin.db).
    var sharedReady = false;
    var sharedRecords = Object.create(null);
    var sharedError = '';
    var sharedLastLoaded = 0;



    function id(value) { return document.getElementById(value); }
    function str(value) { return String(value == null ? '' : value); }
    function norm(value) { return str(value).trim().replace(/\s+/g, ' '); }
    function elem(tag, className, content) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (content !== undefined) { node.textContent = str(content); }
        return node;
    }
    function btn(content, className) {
        var node = elem('button', className || 'jfca-btn', content);
        node.type = 'button';
        return node;
    }
    function client() {
        var c = window.ApiClient;
        if (!c || typeof c.getJSON !== 'function' || typeof c.getUrl !== 'function') {
            throw new Error('Jellyfin Web ApiClient is not ready. Open Jellyfin Web while logged in.');
        }
        return c;
    }
    function url(path, params) {
        var base = client().getUrl(path);
        var query = [];
        Object.keys(params || {}).forEach(function (name) {
            if (params[name] !== undefined && params[name] !== null) {
                query.push(encodeURIComponent(name) + '=' + encodeURIComponent(str(params[name])));
            }
        });
        return base + (query.length ? (base.indexOf('?') < 0 ? '?' : '&') + query.join('&') : '');
    }
    function json(path, params) { return client().getJSON(url(path, params)); }
    function currentUserId() {
        try {
            var c = client();
            return (typeof c.getCurrentUserId === 'function' ? c.getCurrentUserId() : undefined) || undefined;
        } catch (ignored) { return undefined; }
    }
    function getPeoplePage(index) {
        return json('Persons', {
            PersonTypes: 'Composer', StartIndex: index, Limit: apiPeopleSize,
            Fields: 'Overview', EnableImages: 'true', UserId: currentUserId()
        });
    }
    function personNameKey(value) { return norm(value).toLocaleLowerCase(); }
    function localOverridesKey() {
        var c = client();
        var server = typeof c.serverId === 'function' ? c.serverId() : 'default';
        return virtualStoreKey + str(server) + ':' + str(currentUserId());
    }
    function readLocalOverrides() {
        try {
            var raw = window.localStorage.getItem(localOverridesKey());
            var data = raw ? JSON.parse(raw) : {};
            return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        } catch (ignored) { return {}; }
    }
    function applyVirtualOverrides() {
        var overrides = readLocalOverrides();
        for (var i = 0; i < people.length; i++) {
            var person = people[i];
            if (!person._jfcaVirtual) { continue; }
            var saved = overrides[person._jfcaKey];
            if (!saved || typeof saved !== 'object') { continue; }
            person.Overview = norm(saved.Overview);
            person._jfcaImageDataUrl = /^data:image\/(?:jpeg|png|webp);base64,/.test(saved.ImageDataUrl || '') ? saved.ImageDataUrl : '';
        }
    }
    function recordField(record, camel, pascal) {
        return record ? (record[camel] !== undefined ? record[camel] : record[pascal]) : undefined;
    }
    async function loadSharedRecords() {
        try {
            var response = await json('ComposerSharedMetadata/records');
            var fresh = (response && (response.records || response.Records)) || Object.create(null);
            for (var pi = 0; pi < people.length; pi++) {
                var person = people[pi];
                var key = sharedKey(person);
                var oldRevision = Number(recordField(sharedRecords[key], 'revision', 'Revision') || 0);
                var newRevision = Number(recordField(fresh[key], 'revision', 'Revision') || 0);
                if (oldRevision !== newRevision) {
                    person._jfcaSharedImageLoaded = false;
                    person._jfcaImageDataUrl = '';
                    person._jfcaSharedImagePromise = null;
                }
            }
            sharedRecords = fresh;
            sharedReady = true; sharedError = ''; sharedLastLoaded = Date.now();
            applySharedOverrides();
        } catch (error) {
            sharedReady = false;
            sharedError = str(error.message || error);
            console.warn(PREFIX, 'Shared metadata plugin unavailable; virtual edits disabled until restored.', error);
        }
        return sharedReady;
    }
    function sharedKey(person) {
        if (!person) { return ''; }
        return person._jfcaVirtual ? person._jfcaKey : 'person:' + str(person.Id).toLowerCase();
    }
    function applySharedOverrides() {
        if (!sharedReady) { return; }
        for (var i = 0; i < people.length; i++) {
            var person = people[i];
            var shared = sharedRecords[sharedKey(person)];
            if (!shared) { continue; }
            person.Overview = str(recordField(shared, 'overview', 'Overview'));
            person._jfcaSharedImage = !!recordField(shared, 'imageFile', 'ImageFile');
            // Server portrait wins over any old unsynchronized browser-local portrait.
            if (person._jfcaSharedImage) { person._jfcaImageDataUrl = ''; }
        }
    }
    async function fetchSharedPortrait(person) {
        if (!person || !person._jfcaSharedImage) { return; }
        if (person._jfcaSharedImageLoaded) { return; }
        if (person._jfcaSharedImagePromise) { return person._jfcaSharedImagePromise; }
        person._jfcaSharedImagePromise = json('ComposerSharedMetadata/image-data', {key:sharedKey(person)}).then(function (data) {
            var source = data && (data.imageDataUrl || data.ImageDataUrl);
            if (/^data:image\/(?:jpeg|png|webp);base64,/.test(str(source))) {
                person._jfcaImageDataUrl = source;
                person._jfcaSharedImageLoaded = true;
            }
        }).catch(function (error) {
            console.warn(PREFIX, 'Shared portrait unavailable', person.Name, error);
        }).finally(function () { person._jfcaSharedImagePromise = null; });
        return person._jfcaSharedImagePromise;
    }
    function putSharedRecord(key, payload) {
        if (!sharedReady) { return Promise.reject(new Error('Composer Shared Metadata plugin is unavailable. No browser-local save was performed.')); }
        var c = client();
        if (typeof c.ajax !== 'function') { return Promise.reject(new Error('Authenticated Jellyfin API client is unavailable.')); }
        return c.ajax({url:url('ComposerSharedMetadata/record', {key:key}),
            type:'PUT',method:'PUT',contentType:'application/json',data:JSON.stringify(payload)});
    }
    async function saveShared(key, name, biography, imageDataUrl) {
        var existing = sharedRecords[key];
        var revision = Number(recordField(existing, 'revision', 'Revision') || 0);
        await putSharedRecord(key, {Name:name, Overview:biography, ImageDataUrl:imageDataUrl || null, ExpectedRevision:revision});
        // A resolved request is not sufficient: read back the committed revision.
        if (!await loadSharedRecords()) {
            throw new Error('Save request completed, but verification failed. Check the plugin before trying again.');
        }
        var updated = sharedRecords[key];
        var savedRevision = Number(recordField(updated, 'revision', 'Revision') || 0);
        if (!updated || savedRevision <= revision ||
            str(recordField(updated, 'overview', 'Overview')) !== biography ||
            (imageDataUrl && !recordField(updated, 'imageFile', 'ImageFile'))) {
            throw new Error('Metadata could not be verified after saving. Reload before trying again to avoid a revision conflict.');
        }
        detailsCache = {};
        return updated;
    }
    async function migrateVirtualItems(items) {
        if (!await isAdmin()) { throw new Error('Administrator permission is required.'); }
        if (!await loadSharedRecords()) { throw new Error('Install/enable the Composer Shared Metadata plugin before importing.'); }
        var keys = Object.keys(items || {}).filter(function (key) {
            return !!tracksByName[key] && !!items[key] && typeof items[key] === 'object';
        });
        var newKeys = keys.filter(function (key) { return !sharedRecords[key]; });
        if (!newKeys.length) { window.alert('Nothing new to import. Existing shared records were left unchanged.'); return; }
        if (!window.confirm('Preview: ' + newKeys.length + ' virtual composer edits will be COPIED to Jellyfin plugin storage. ' +
            (keys.length-newKeys.length) + ' already-shared records will be SKIPPED. Proceed?')) { return; }
        var completed = 0;
        try {
            for (var i = 0; i < newKeys.length; i++) {
                var key = newKeys[i], item = items[key];
                var imageUrl = /^data:image\/(?:jpeg|png|webp);base64,/.test(str(item.ImageDataUrl)) ? item.ImageDataUrl : null;
                await saveShared(key, norm(item.Name) || (tracksByName[key] && tracksByName[key].name) || key,
                    str(item.Overview).slice(0,100000), imageUrl);
                completed++;
            }
        } finally {
            applyVirtualOverrides(); applySharedOverrides();
            detailsCache = {}; renderList();
        }
        window.alert('Migrated ' + completed + ' virtual composer records into shared plugin storage. Local backups were preserved.');
    }
    function hasMetadataGap(person) {
        var localImage = !!person._jfcaImageDataUrl;
        var personImage = !!(person.ImageTags && person.ImageTags.Primary);
        return !norm(person.Overview) || !(localImage || personImage || person._jfcaSharedImage);
    }
    async function isAdmin() {
        if (adminCheck) { return adminCheck; }
        adminCheck = json('Users/Me').then(function (user) {
            return !!(user && user.Policy && user.Policy.IsAdministrator === true);
        }).catch(function (error) {
            console.warn(PREFIX, 'Unable to verify administrator privileges', error);
            return false;
        });
        return adminCheck;
    }
    function fileToBase64(file) {
        if (!file || !/^(image\/jpeg|image\/png|image\/webp)$/.test(file.type)) {
            return Promise.reject(new Error('Choose a PNG, JPEG, or WebP image.'));
        }
        if (file.size > MAX_IMAGE_BYTES) {
            return Promise.reject(new Error('Image exceeds the 6 MB upload limit.'));
        }
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                var result = str(reader.result);
                var comma = result.indexOf(',');
                if (comma < 0) { reject(new Error('Image encoding failed.')); return; }
                resolve({base64:result.slice(comma+1), mime:file.type, dataUrl:result});
            };
            reader.onerror = function () { reject(new Error('Cannot read the selected image.')); };
            reader.readAsDataURL(file);
        });
    }
    async function fetchArtistImageBase64(artist) {
        if (!artist || !artist.Id || !(artist.ImageTags && artist.ImageTags.Primary)) {
            throw new Error('The matching Artist has no primary image.');
        }
        // Copy the same artwork via Jellyfin itself; do not use remote URLs.
        var imageResponse = await fetch(image(artist.Id, artist.ImageTags.Primary, 900, true), {
            credentials:'same-origin'
        });
        if (!imageResponse.ok) { throw new Error('Could not fetch Artist image (' + imageResponse.status + '). Use Upload Picture instead.'); }
        var blob = await imageResponse.blob();
        var mime = blob.type === 'image/png' ? 'image/png' : blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
        var file = new File([blob], 'artist-image', {type:mime});
        return fileToBase64(file);
    }
    function splitComposerNames(name) {
        var result = [];
        var seen = Object.create(null);
        var parts = norm(name).split(';');
        for (var i = 0; i < parts.length; i++) {
            var part = norm(parts[i]);
            var key = personNameKey(part);
            if (part && !seen[key]) { seen[key] = true; result.push(part); }
        }
        return result;
    }
    function comparePeopleByName(a, b) {
        return norm(a.Name).localeCompare(norm(b.Name));
    }
    // This is a separate named helper: no async function expression is
    // created inside readPeople(), and no callbacks are defined in its loops.
    async function fetchPeoplePages() {
        var all = [], index = 0, pages = 0, total = Infinity, seen = {};
        while (index < total && pages < 100) {
            var r = await getPeoplePage(index);
            var items = Array.isArray(r && r.Items) ? r.Items : [];
            total = (typeof r.TotalRecordCount === 'number') ? r.TotalRecordCount : Infinity;
            if (!items.length) { break; }
            for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
                var person = items[itemIndex];
                if (person && person.Id && !seen[person.Id]) {
                    seen[person.Id] = true;
                    all.push(person);
                }
            }
            index += items.length;
            pages++;
            if (index >= total || (!Number.isFinite(total) && items.length < apiPeopleSize)) { break; }
        }
        all.sort(comparePeopleByName);
        rawPeople = all;
        lastPeopleTotal = Number.isFinite(total) ? total : all.length;
        return rawPeople;
    }
    // A single paginated Audio scan avoids 567 per-person queries on startup.
    // Collect only the track data needed to build album cards.
    async function fetchTrackComposerIndex() {
        var index = 0, pages = 0, total = Infinity;
        var byName = Object.create(null);
        var sourceNames = Object.create(null);
        var scanned = 0, credited = 0;
        while (index < total && pages < 1000) {
            var response = await json('Items', {
                IncludeItemTypes: 'Audio', Recursive: 'true',
                Fields: 'People', StartIndex: index, Limit: apiAudioSize,
                EnableTotalRecordCount: 'true', EnableUserData: 'false',
                UserId: currentUserId()
            });
            var tracks = Array.isArray(response && response.Items) ? response.Items : [];
            total = typeof response.TotalRecordCount === 'number' ? response.TotalRecordCount : Infinity;
            if (!tracks.length) { break; }
            for (var i = 0; i < tracks.length; i++) {
                var track = tracks[i];
                scanned++;
                if (!track || !track.Id || !Array.isArray(track.People)) { continue; }
                var creditedOnTrack = Object.create(null);
                for (var j = 0; j < track.People.length; j++) {
                    var person = track.People[j];
                    if (!person || norm(person.Type).toLowerCase() !== 'composer') { continue; }
                    sourceNames[personNameKey(person.Name)] = true;
                    var names = splitComposerNames(person.Name);
                    for (var k = 0; k < names.length; k++) {
                        var key = personNameKey(names[k]);
                        if (creditedOnTrack[key]) { continue; }
                        creditedOnTrack[key] = true;
                        if (!byName[key]) {
                            byName[key] = {name:names[k], tracks:[], seen:Object.create(null), sourceIds:Object.create(null)};
                        }
                        if (!byName[key].seen[track.Id]) {
                            byName[key].seen[track.Id] = true;
                            byName[key].tracks.push({
                                Id:track.Id, Name:track.Name, Album:track.Album,
                                AlbumId:track.AlbumId, AlbumArtists:track.AlbumArtists,
                                IndexNumber:track.IndexNumber,
                                ParentIndexNumber:track.ParentIndexNumber,
                                ProductionYear:track.ProductionYear
                            });
                        }
                        if (person.Id) { byName[key].sourceIds[person.Id] = true; }
                    }
                }
                if (Object.keys(creditedOnTrack).length) { credited++; }
            }
            index += tracks.length;
            pages++;
            if (index >= total || (!Number.isFinite(total) && tracks.length < apiAudioSize)) { break; }
        }
        if (pages === 1000 && index < total) {
            throw new Error('Audio scan reached its page limit; cannot safely determine active composers.');
        }
        // Refuse to hide every Person if the audio endpoint failed to include
        // People relationships. This is not evidence that 567 People are orphans.
        if (scanned > 0 && credited === 0 && rawPeople.length > 0) {
            throw new Error('No Composer credits appeared in scanned Audio People fields. Nothing was filtered; check Fields=People on this Jellyfin server.');
        }
        tracksByName = byName;
        originalCreditedNames = sourceNames;
        audioScanned = scanned;
        creditedAudio = credited;
    }
    function createComposerDisplay() {
        var standalone = Object.create(null);
        var linked = Object.create(null);
        var newPeople = [];
        var name;
        for (var i = 0; i < rawPeople.length; i++) {
            var p = rawPeople[i];
            var parts = splitComposerNames(p.Name);
            if (parts.length === 1 && parts[0] === norm(p.Name)) {
                var key = personNameKey(parts[0]);
                var previous = standalone[key];
                var quality = (p.ImageTags && p.ImageTags.Primary ? 1 : 0) + (norm(p.Overview) ? 1 : 0);
                var oldQuality = previous ? (previous.ImageTags && previous.ImageTags.Primary ? 1 : 0) + (norm(previous.Overview) ? 1 : 0) : -1;
                if (quality > oldQuality) { standalone[key] = p; }
            }
            if (parts.length > 1) { splitPeople.push({Name:p.Name, Id:p.Id, SplitInto:parts.join(' | ')}); }
            for (var j = 0; j < parts.length; j++) {
                var bucket = tracksByName[personNameKey(parts[j])];
                if (bucket && bucket.sourceIds[p.Id]) { linked[p.Id] = true; }
            }
        }
        for (name in tracksByName) {
            if (!Object.prototype.hasOwnProperty.call(tracksByName, name)) { continue; }
            var entry = tracksByName[name];
            var original = standalone[name];
            var item = original ? Object.assign({}, original) : {
                Id:'jfca-virtual:' + encodeURIComponent(name), Name:entry.name,
                Overview:'', ImageTags:{}
            };
            item.Name = original ? original.Name : entry.name;
            item._jfcaKey = name;
            item._jfcaVirtual = !original;
            newPeople.push(item);
        }
        newPeople.sort(comparePeopleByName);
        uncreditedPeople = [];
        for (var n = 0; n < rawPeople.length; n++) {
            var record = rawPeople[n];
            if (!linked[record.Id] && !originalCreditedNames[personNameKey(record.Name)]) {
                uncreditedPeople.push({Name:record.Name, Id:record.Id});
            }
        }
        people = newPeople;
        applyVirtualOverrides();
        applySharedOverrides();
    }
    async function warmPeopleWork() {
        await fetchPeoplePages();
        // Render an early, provisional list while song credits index in background.
        if (!musicIndexed) {
            people = rawPeople.map(function (p) {
                var item = Object.assign({}, p);
                item._jfcaKey = personNameKey(p.Name);
                item._jfcaVirtual = false;
                return item;
            });
        }
        await loadSharedRecords();
        return people;
    }
    function warmPeople() {
        if (!warmPending) {
            warmPending = warmPeopleWork().catch(function (error) {
                warmPending = null;
                throw error;
            });
        }
        return warmPending;
    }
    async function fetchPeopleAndAudio() {
        await warmPeople();
        splitPeople = [];
        await fetchTrackComposerIndex();
        createComposerDisplay();
        musicIndexed = true;
        lastLoaded = Date.now();
        detailsCache = {};
        artistMatchCache = Object.create(null);
        if (opened && mode === 'list') { renderList(); }
        return people;
    }
    async function readPeople(force) {
        if (!force && musicIndexed && Date.now() - lastLoaded < LIST_TTL) { return people; }
        if (pending) { return pending; }
        if (force) { warmPending = null; musicIndexed = false; }
        var work = fetchPeopleAndAudio();
        pending = work;
        try { return await work; } finally { if (pending === work) { pending = null; } }
    }
    function albumArtistNames(albumArtists) {
        // Jellyfin 12 /Items may provide AlbumArtists as objects like
        // [{Name:'Artist',Id:'...'}], not only strings. Never stringify an object.
        if (!Array.isArray(albumArtists)) {
            return typeof albumArtists === 'string' ? norm(albumArtists) : '';
        }
        var names = [];
        for (var i = 0; i < albumArtists.length; i++) {
            var entry = albumArtists[i];
            var name = typeof entry === 'string' ? entry :
                (entry && typeof entry.Name === 'string' ? entry.Name : '');
            name = norm(name);
            if (name) { names.push(name); }
        }
        return names.join(', ');
    }
    function groupAlbums(tracks) {
        var byKey = {}, list = [];
        tracks.forEach(function (t) {
            if (!t || !t.Id) { return; }
            var albumId = norm(t.AlbumId);
            var artistNames = albumArtistNames(t.AlbumArtists);
            var key = albumId ? 'id:' + albumId : 'name:' +
                norm(t.Album).toLowerCase() + '|' + artistNames.toLowerCase();
            if (!byKey[key]) {
                byKey[key] = {
                    id: albumId, name: norm(t.Album) || '(Unknown album)',
                    artist: artistNames,
                    tracks: [], year: t.ProductionYear || null
                };
                list.push(byKey[key]);
            }
            // If Jellyfin returns duplicate audio items, count a track only once.
            if (!byKey[key]._seen) { byKey[key]._seen = {}; }
            if (!byKey[key]._seen[t.Id]) {
                byKey[key]._seen[t.Id] = true;
                byKey[key].tracks.push(t);
            }
        });
        list.forEach(function (a) {
            delete a._seen;
            a.tracks.sort(function (x, y) {
                return (Number(x.ParentIndexNumber || 0) - Number(y.ParentIndexNumber || 0)) ||
                    (Number(x.IndexNumber || 0) - Number(y.IndexNumber || 0)) ||
                    norm(x.Name).localeCompare(norm(y.Name));
            });
        });
        list.sort(function (a, b) { return a.name.localeCompare(b.name); });
        return list;
    }
    // Use ONE exact-name fallback strategy in both list and detail views.
    // A small queue avoids opening dozens of simultaneous music-artist searches
    // when a page contains many Composers lacking Person image tags.
    async function runArtistLookup(job) {
        artistLookupActive++;
        var matched = null;
        try {
            var response = await json('Items', {
                IncludeItemTypes: 'MusicArtist', Recursive: 'true',
                SearchTerm: job.name, Limit: 100, Fields: 'Overview',
                EnableImages: 'true', UserId: currentUserId()
            });
            var matches = [];
            var items = Array.isArray(response && response.Items) ? response.Items : [];
            for (var i = 0; i < items.length; i++) {
                if (personNameKey(items[i].Name) === personNameKey(job.name)) {
                    matches.push(items[i]);
                }
            }
            // Don't borrow metadata from a homonym or ambiguous artist.
            if (matches.length === 1) { matched = matches[0]; }
        } catch (error) {
            console.warn(PREFIX, 'Artist metadata fallback unavailable:', error.message || error);
        } finally {
            artistLookupActive--;
            job.resolve(matched);
            pumpArtistLookups();
        }
    }
    function pumpArtistLookups() {
        while (artistLookupActive < ARTIST_LOOKUP_LIMIT && artistLookupQueue.length) {
            runArtistLookup(artistLookupQueue.shift());
        }
    }
    function queueArtistLookup(name) {
        return new Promise(function (resolve) {
            artistLookupQueue.push({name:name, resolve:resolve});
            pumpArtistLookups();
        });
    }
    function artistFallback(person) {
        if ((person.ImageTags && person.ImageTags.Primary) && norm(person.Overview)) {
            return Promise.resolve(null);
        }
        var key = personNameKey(person.Name);
        if (!artistMatchCache[key]) { artistMatchCache[key] = queueArtistLookup(person.Name); }
        return artistMatchCache[key];
    }
    function loadMissingListPortrait(person, tile, frame) {
        if (person._jfcaSharedImage) {
            fetchSharedPortrait(person).then(function () {
                if (!opened || mode !== 'list' || !tile.isConnected || !frame.isConnected) { return; }
                if (!person._jfcaImageDataUrl) { return; }
                var sharedImage = frame.querySelector('.jfca-img');
                if (!sharedImage) {
                    sharedImage = elem('img', 'jfca-img'); sharedImage.alt = person.Name || 'Composer';
                    sharedImage.loading = 'lazy'; frame.appendChild(sharedImage);
                }
                sharedImage.src = person._jfcaImageDataUrl;
            });
            return;
        }
        if ((person.ImageTags && person.ImageTags.Primary) || person._jfcaImageDataUrl) { return; }
        // The list may have been replaced by Search, Next, Back or navigation
        // while this asynchronous lookup was running. Never update stale cards.
        artistFallback(person).then(function (artist) {
            if (!opened || mode !== 'list' || !tile.isConnected || !frame.isConnected) { return; }
            if (!artist || !(artist.ImageTags && artist.ImageTags.Primary)) { return; }
            if (frame.querySelector('.jfca-img')) { return; }
            var source = image(artist.Id, artist.ImageTags.Primary, 280, false);
            if (!source) { return; }
            var pic = elem('img', 'jfca-img');
            pic.alt = person.Name || 'Composer';
            pic.loading = 'lazy';
            pic.addEventListener('error', function () { pic.remove(); });
            pic.src = source;
            frame.appendChild(pic);
        });
    }
    function image(idValue, imageTag, width, force) {
        if (!idValue || (!imageTag && !force)) { return ''; }
        try {
            var api = client();
            if (typeof api.getScaledImageUrl === 'function') {
                return api.getScaledImageUrl(idValue, {
                    type: 'Primary', tag: imageTag || undefined, maxWidth: width || 360
                });
            }
            return url('Items/' + encodeURIComponent(idValue) + '/Images/Primary', {
                maxWidth: width || 360, tag: imageTag || undefined
            });
        } catch (error) { return ''; }
    }
    function portrait(item, alt, width, className, alwaysTry) {
        var block = elem('div', 'jfca-picture ' + (className || ''));
        block.appendChild(elem('span', 'jfca-initial', norm(alt).slice(0, 1).toUpperCase() || '♪'));
        var tag = item && item.ImageTags && item.ImageTags.Primary;
        if (item && item._jfcaImageDataUrl) {
            var local = elem('img', 'jfca-img');
            local.src = item._jfcaImageDataUrl; local.alt = alt || 'Portrait';
            block.appendChild(local); return block;
        }
        var src = image(item && item.Id, tag, width, !!alwaysTry);
        if (src) {
            var pic = elem('img', 'jfca-img');
            pic.loading = 'lazy'; pic.alt = alt || 'Artwork';
            pic.addEventListener('error', function () { pic.remove(); });
            pic.src = src;
            block.appendChild(pic);
        }
        return block;
    }
    function css() {
        if (id(CSS)) { return; }
        var s = elem('style'); s.id = CSS;
        s.textContent = [
            '#'+NAV+'{cursor:pointer;color:inherit;text-align:left}',
            '#'+MUSIC_TAB+'{cursor:pointer;color:inherit}',
            '#'+PANEL+'{display:none;position:fixed;inset:0;z-index:9000;overflow:auto;background:var(--jf-palette-background-default,#171b20);color:var(--jf-palette-text-primary,#f5f6f7);font:inherit}',
            '#'+PANEL+'.jfca-open{display:block}',
            '#'+PANEL+' *{box-sizing:border-box}',
            '#'+PANEL+' .jfca-top{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;background:var(--jf-palette-background-paper,#242a31);padding:12px clamp(12px,2vw,36px);box-shadow:0 2px 12px #0005}',
            '#'+PANEL+' .jfca-title{flex:1;font-weight:bold;font-size:19px}',
            '#'+PANEL+' .jfca-btn{border:1px solid #aeb9c64a;border-radius:7px;padding:10px 13px;color:inherit;background:#7c8da822;cursor:pointer;font:inherit}',
            '#'+PANEL+' .jfca-btn:hover{background:#7c8da844}',
            '#'+PANEL+' .jfca-btn:disabled{opacity:.35;cursor:default}',
            '#'+PANEL+' .jfca-body{width:100%;max-width:none;margin:0;padding:clamp(12px,1.8vw,32px) clamp(12px,2vw,36px) 90px}',
            '#'+PANEL+' .jfca-info{opacity:.8;margin:0 0 18px;line-height:1.5}',
            '#'+PANEL+' .jfca-search{display:block;margin:0 0 22px;padding:12px;background:#9eafc51b;color:inherit;border:1px solid #aaa6;border-radius:8px;width:min(100%,510px);font:inherit}',
            '#'+PANEL+' .jfca-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr));gap:clamp(12px,1.2vw,22px)}',
            '#'+PANEL+' .jfca-card{background:transparent;border:0;color:inherit;min-width:0;text-align:left;cursor:pointer;font:inherit;border-radius:9px;padding:0 0 9px}',
            '#'+PANEL+' .jfca-card:hover{background:#7c8da827}',
            '#'+PANEL+' .jfca-card:focus-visible{outline:2px solid #14a6de}',
            '#'+PANEL+' .jfca-picture{position:relative;display:flex;align-items:center;justify-content:center;aspect-ratio:1/1;overflow:hidden;background:linear-gradient(135deg,#46576a,#25333e);border-radius:9px}',
            '#'+PANEL+' .jfca-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
            '#'+PANEL+' .jfca-initial{font-size:48px;color:#fffb}',
            '#'+PANEL+' .jfca-name{padding:9px 4px 0;overflow-wrap:anywhere;font-weight:600}',
            '#'+PANEL+' .jfca-sub{padding:5px 4px;opacity:.7;font-size:13px}',
            '#'+PANEL+' .jfca-paging{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 18px;flex-wrap:wrap}',
            '#'+PANEL+' .jfca-hero{display:flex;gap:22px;align-items:flex-start;margin-bottom:27px}',
            '#'+PANEL+' .jfca-hero .jfca-picture{width:180px;flex:0 0 180px}',
            '#'+PANEL+' .jfca-about{min-width:0;line-height:1.5}',
            '#'+PANEL+' .jfca-about p{white-space:pre-wrap;max-height:360px;overflow:auto}',
            '#'+PANEL+' .jfca-tracks{margin:8px 0 0;padding-left:18px}',
            '#'+PANEL+' .jfca-track{padding:3px 0;line-height:1.3}',
            '#'+PANEL+' .jfca-track button{color:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:#777;background:none;border:0;text-align:left;font:inherit}',
            '#'+PANEL+' .jfca-album-name{font-weight:600;padding:8px 4px 0}',
            '#'+PANEL+' .jfca-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px}',
            '#'+PANEL+' .jfca-editor{max-width:900px;display:grid;gap:12px}',
            '#'+PANEL+' .jfca-field{display:block;width:100%;padding:10px;box-sizing:border-box;border-radius:7px;background:#aabbcc1e;border:1px solid #aaa7;color:inherit;font:inherit}',
            '#'+PANEL+' .jfca-editor textarea{min-height:220px;resize:vertical}',
            '#'+PANEL+' .jfca-editor label{display:block;font-weight:600}',
            '#'+PANEL+' .jfca-editor .jfca-hint{opacity:.75;line-height:1.5}',
            '#'+PANEL+' .jfca-editor .jfca-actions{display:flex;flex-wrap:wrap;gap:10px}',
            '#'+PANEL+' .jfca-preview{padding:12px;border:1px solid #aaa7;border-radius:8px;white-space:pre-wrap}',
            '#'+PANEL+' .jfca-warning{color:#ffcc80}',
            '@media(max-width:600px){#'+PANEL+' .jfca-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#'+PANEL+' .jfca-hero{display:block}#'+PANEL+' .jfca-hero .jfca-picture{margin-bottom:14px;width:140px}#'+PANEL+' .jfca-top{padding:8px}#'+PANEL+' .jfca-title{font-size:15px}}'
        ].join('\n');
        document.head.appendChild(s);
    }
    function shell() {
        if (id(PANEL)) { return; }
        css();
        var p = elem('section'); p.id = PANEL;
        p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true');
        p.setAttribute('aria-label', 'Composers');
        var top = elem('div', 'jfca-top');
        var back = btn('← Back'); back.dataset.action = 'back';
        var title = elem('span', 'jfca-title', 'Composers'); title.id = TITLE;
        var refresh = btn('↻ Refresh'); refresh.dataset.action = 'refresh';
        var close = btn('✕ Close'); close.dataset.action = 'close';
        top.appendChild(back); top.appendChild(title); top.appendChild(refresh); top.appendChild(close);
        p.appendChild(top);
        var body = elem('main', 'jfca-body'); body.id = BODY;
        p.appendChild(body);
        p.addEventListener('click', panelClick, false);
        p.addEventListener('input', panelInput, false);
        p.addEventListener('change', function (event) {
            if (event.target && event.target.id === 'jfca-image-upload') {
                editorFile = event.target.files && event.target.files[0] || null;
                editorImageBase64 = ''; editorImageMime = '';
                if (editorFile) { editorNotice('Selected ' + editorFile.name + '. Save to upload.', false); }
            }
        }, false);
        document.body.appendChild(p);
    }
    function info(message) { id(BODY).appendChild(elem('p', 'jfca-info', message)); }
    function clear(title) {
        id(TITLE).textContent = title;
        id(BODY).replaceChildren();
    }
    function pager(host, found) {
        var pages = Math.max(1, Math.ceil(found / pageSize));
        var wrapper = elem('div', 'jfca-paging');
        var prev = btn('← Previous'); prev.dataset.action = 'prev'; prev.disabled = page <= 0;
        var next = btn('Next →'); next.dataset.action = 'next'; next.disabled = page + 1 >= pages;
        wrapper.appendChild(prev);
        wrapper.appendChild(elem('span', '', 'Page ' + (page + 1) + ' of ' + pages));
        wrapper.appendChild(next);
        host.appendChild(wrapper);
    }
    function filteredPeople() {
        var q = search.toLocaleLowerCase();
        return people.filter(function (p) {
            return norm(p.Name).toLocaleLowerCase().indexOf(q) >= 0 &&
                (!missingOnly || hasMetadataGap(p));
        });
    }
    function renderList() {
        if (!opened || mode !== 'list') { return; }
        clear('Composers');
        info(musicIndexed ? (people.length + ' composers credited on songs (' + rawPeople.length + ' raw People; ' + audioScanned + ' songs scanned; ' + uncreditedPeople.length + ' People without audio credits hidden).') : (people.length + ' Composer People available. Indexing track credits in background; combined and orphan entries will be reconciled.'));
        if (errorText) { info('Last request error: ' + errorText); }
        var box = elem('input', 'jfca-search');
        box.type = 'search'; box.placeholder = 'Search composers'; box.value = search;
        box.setAttribute('aria-label', 'Search composers');
        id(BODY).appendChild(box);
        var toolbar = elem('div', 'jfca-toolbar');
        var missing = elem('label');
        var check = elem('input'); check.type = 'checkbox'; check.className = 'jfca-missing'; check.checked = missingOnly;
        missing.appendChild(check); missing.appendChild(elem('span', '', ' Missing in Composer record'));
        toolbar.appendChild(missing);
        if (!sharedReady) { info('Composer Shared Metadata plugin not connected. Virtual changes cannot be saved across devices. ' + sharedError); }
        var migrateButton = btn('Migrate local edits to server'); migrateButton.dataset.action = 'migrate-local'; toolbar.appendChild(migrateButton);
        var exportButton = btn('Export original local edits'); exportButton.dataset.action = 'export-virtual'; toolbar.appendChild(exportButton);
        var importButton = btn('Import JSON backup to server'); importButton.dataset.action = 'import-virtual'; toolbar.appendChild(importButton);
        id(BODY).appendChild(toolbar);
        var results = filteredPeople();
        if (page >= Math.ceil(results.length / pageSize)) { page = 0; }
        pager(id(BODY), results.length);
        var grid = elem('div', 'jfca-grid');
        results.slice(page * pageSize, (page + 1) * pageSize).forEach(function (p) {
            var tile = btn('', 'jfca-card');
            tile.dataset.personId = p.Id;
            var frame = portrait(p, p.Name, 280);
            tile.appendChild(frame);
            tile.appendChild(elem('div', 'jfca-name', p.Name));
            grid.appendChild(tile);
            loadMissingListPortrait(p, tile, frame);
        });
        id(BODY).appendChild(grid);
        pager(id(BODY), results.length);
    }
    function loading(title, message) { clear(title); info(message); }
    function renderDetail(detail) {
        if (!opened || mode !== 'detail' || selectedId !== detail.person.Id) { return; }
        var p = detail.person, a = detail.artist;
        clear(p.Name);
        var hero = elem('div', 'jfca-hero');
        hero.appendChild(portrait(p._jfcaImageDataUrl || (p.ImageTags && p.ImageTags.Primary) ? p : (a || p), p.Name, 360));
        var about = elem('div', 'jfca-about');
        about.appendChild(elem('h1', '', p.Name));
        about.appendChild(elem('p', '', norm(p.Overview) || norm(a && a.Overview) || 'No biography available.'));
        var editButton = btn('✎ Edit metadata'); editButton.dataset.action = 'edit';
        about.appendChild(editButton);
        hero.appendChild(about);
        id(BODY).appendChild(hero);
        var nTracks = detail.albums.reduce(function (sum, album) { return sum + album.tracks.length; }, 0);
        info(detail.albums.length + ' albums • ' + nTracks + ' songs credited to this composer');
        if (!detail.albums.length) {
            info('Jellyfin returned no audio tracks with this Composer Person ID. This may be an orphan or a person used outside Music.');
            return;
        }
        var grid = elem('div', 'jfca-grid');
        detail.albums.forEach(function (album) {
            var tile = elem('div');
            if (album.id) {
                var open = btn('', 'jfca-card');
                open.dataset.albumId = album.id;
                open.appendChild(portrait({Id:album.id}, album.name, 320, '', true));
                open.appendChild(elem('div', 'jfca-album-name', album.name));
                tile.appendChild(open);
            } else {
                tile.appendChild(elem('div', 'jfca-album-name', album.name));
            }
            // Album artist names may be DTO objects; the user-facing caption
            // intentionally shows only the number of composer-credited songs.
            tile.appendChild(elem('div', 'jfca-sub', album.tracks.length + ' credited ' +
                (album.tracks.length === 1 ? 'song' : 'songs')));
            var tracks = elem('ul', 'jfca-tracks');
            album.tracks.forEach(function (t) {
                var li = elem('li', 'jfca-track');
                var b = btn(t.Name || '(Unnamed track)'); b.dataset.trackId = t.Id;
                li.appendChild(b); tracks.appendChild(li);
            });
            tile.appendChild(tracks);
            grid.appendChild(tile);
        });
        id(BODY).appendChild(grid);
    }
    function editorNotice(message, isError) {
        var place = id('jfca-editor-message');
        if (place) { place.textContent = message; place.className = isError ? 'jfca-warning' : 'jfca-hint'; }
    }
    function safeEditorDraft() {
        if (!editorDraft) { throw new Error('Open a Composer editor first.'); }
        return editorDraft;
    }
    async function openEditor() {
        if (!current || !current.person) { return; }
        var p = current.person;
        var admin = await isAdmin();
        if (!admin) { info('Editing requires a Jellyfin administrator session.'); return; }
        mode = 'edit';
        editorFile = null; editorImageBase64 = ''; editorImageMime = '';
        editorError = ''; editorBusy = false;
        editorDraft = {person:p, artist:current.artist, name:p.Name, overview:norm(p.Overview),
            lock:false, stage:'edit', local:true};
        renderEditor();
    }
    function editorFormRow(name, content) {
        var wrapper = elem('div');
        var label = elem('label', '', name);
        wrapper.appendChild(label); wrapper.appendChild(content);
        return wrapper;
    }
    function renderEditor() {
        var draft = safeEditorDraft();
        if (!opened || mode !== 'edit') { return; }
        clear('Edit: ' + draft.name);
        var editor = elem('div', 'jfca-editor');
        var intro = elem('p', 'jfca-hint',
            'Composer metadata is stored in the separate plugin SQLite database, not jellyfin.db. ' +
            'Jellyfin Person records, track credits and music files are not changed.');
        editor.appendChild(intro);
        var nameField = elem('input', 'jfca-field'); nameField.value = draft.name; nameField.readOnly = true;
        editor.appendChild(editorFormRow('Composer name (read-only, to preserve track credits)', nameField));
        var overview = elem('textarea', 'jfca-field'); overview.value = draft.overview;
        overview.id = 'jfca-edit-overview'; overview.disabled = editorBusy;
        editor.appendChild(editorFormRow('Biography', overview));
        var file = elem('input', 'jfca-field'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp';
        file.id = 'jfca-image-upload'; file.disabled = editorBusy;
        editor.appendChild(editorFormRow('Portrait (PNG, JPG or WebP; up to 6 MB)', file));
        var actions = elem('div', 'jfca-actions');
        var copy = btn('Copy from matching Artist'); copy.dataset.action = 'copy-artist';
        copy.disabled = !draft.artist || editorBusy; actions.appendChild(copy);
        var save = btn('Save changes to shared database');
        save.dataset.action = 'save-edit'; save.disabled = editorBusy; actions.appendChild(save);
        var cancel = btn('Cancel'); cancel.dataset.action = 'cancel-edit'; actions.appendChild(cancel);
        editor.appendChild(actions);
        var message = elem('p', 'jfca-hint', editorError); message.id = 'jfca-editor-message';
        editor.appendChild(message);
        id(BODY).appendChild(editor);
    }
    async function preparePreview() {
        var d = safeEditorDraft();
        if (d.stage !== 'edit') { return; }
        var overview = id('jfca-edit-overview');
        d.overview = str(overview ? overview.value : d.overview).trim();
        var lock = id('jfca-lock-data');
        if (lock) { d.lock = !!lock.checked; }
        editorError = '';
        if (editorFile) {
            try {
                var encoded = await fileToBase64(editorFile);
                editorImageBase64 = encoded.base64;
                editorImageMime = encoded.mime;
            } catch (error) { editorNotice(str(error.message || error), true); return; }
        }
        d.stage = 'preview'; renderEditor();
    }
    async function copyFromArtist() {
        var d = safeEditorDraft();
        if (!d.artist) { editorNotice('No unambiguous matching Music Artist.', true); return; }
        if (d.artist.Overview) { d.overview = str(d.artist.Overview).trim(); }
        var textfield = id('jfca-edit-overview');
        if (textfield) { textfield.value = d.overview; }
        if (d.artist.ImageTags && d.artist.ImageTags.Primary) {
            editorNotice('Retrieving the matching Artist picture…', false);
            try {
                var encoded = await fetchArtistImageBase64(d.artist);
                editorImageBase64 = encoded.base64; editorImageMime = encoded.mime;
                editorFile = null;
                editorNotice('Artist biography and portrait staged. Click Save to upload.', false);
            } catch (error) {
                editorNotice('Biography copied. Portrait could not be copied: ' + str(error.message || error), true);
            }
        } else {
            editorNotice('Artist biography copied. The Artist has no primary picture.', false);
        }
    }
    async function saveEdit() {
        var d = safeEditorDraft();
        if (editorBusy) { return; }
        var field = id('jfca-edit-overview');
        d.overview = str(field ? field.value : d.overview).trim();
        if (d.overview === norm(d.person.Overview) && !editorFile && !editorImageBase64) {
            editorNotice('There are no changes to save.', false); return;
        }
        editorBusy = true; editorNotice('Saving to SQLite…', false);
        try {
            if (editorFile) {
                var encoded = await fileToBase64(editorFile);
                editorImageBase64 = encoded.base64;
                editorImageMime = encoded.mime;
            }
            if (!await isAdmin()) { throw new Error('Administrator permission could not be verified.'); }
            if (!sharedReady) { throw new Error('Shared plugin unavailable. No data was saved.'); }
            await saveShared(sharedKey(d.person), d.name, d.overview,
                editorImageBase64 ? 'data:' + editorImageMime + ';base64,' + editorImageBase64 : null);
            d.person.Overview = d.overview;
            var updated = sharedRecords[sharedKey(d.person)];
            d.person._jfcaSharedImage = !!recordField(updated, 'imageFile', 'ImageFile');
            d.person._jfcaSharedImageLoaded = false;
            d.person._jfcaImageDataUrl = '';
            await fetchSharedPortrait(d.person);
            detailsCache = {}; artistMatchCache = Object.create(null);
            mode = 'detail'; selectedId = d.person.Id; editorDraft = null;
            await openDetail(selectedId);
            info('Saved and verified in Composer SQLite. Metadata remains independent of Jellyfin People/DB.');
        } catch (error) {
            editorError = str(error.message || error);
            editorNotice(editorError, true);
        } finally { editorBusy = false; }
    }
    function exportVirtual() {
        var contents = JSON.stringify({format:'jfca-virtual-metadata-1',items:readLocalOverrides()}, null, 2);
        var blob = new Blob([contents], {type:'application/json'});
        var href = URL.createObjectURL(blob);
        var anchor = elem('a'); anchor.href = href; anchor.download = 'jellyfin-virtual-composers-backup.json';
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(function () { URL.revokeObjectURL(href); }, 2000);
    }
    function importVirtual() {
        var chooser = elem('input'); chooser.type = 'file'; chooser.accept = 'application/json,.json';
        chooser.addEventListener('change', function () {
            if (!chooser.files || !chooser.files[0]) { return; }
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var incoming = JSON.parse(str(reader.result));
                    if (!incoming || incoming.format !== 'jfca-virtual-metadata-1' ||
                        !incoming.items || typeof incoming.items !== 'object' || Array.isArray(incoming.items)) {
                        throw new Error('Not a valid v3.3 virtual composer backup.');
                    }
                    migrateVirtualItems(incoming.items).catch(function (error) {
                        window.alert('Import failed: ' + str(error.message || error));
                    });
                } catch (error) { window.alert('Import failed: ' + str(error.message || error)); }
            };
            reader.readAsText(chooser.files[0]);
        });
        chooser.click();
    }
    async function openDetail(personId) {
        var p = people.find(function (entry) { return entry.Id === personId; });
        if (!p) { return; }
        mode = 'detail'; selectedId = personId;
        if (!musicIndexed) {
            loading(p.Name, 'Finishing music-credit indexing for this composer…');
            await readPeople(false);
            p = people.find(function (entry) { return entry.Id === personId; });
            if (!p) {
                loading('Composers', 'This entry has no matching song credits. Return to the updated list.');
                return;
            }
        }
        await fetchSharedPortrait(p);
        var serial = ++requestSerial;
        loading(p.Name, 'Loading albums for credited songs…');
        try {
            if (!detailsCache[personId]) {
                var creditedTracks = (tracksByName[p._jfcaKey] || {tracks:[]}).tracks;
                var alternate = await artistFallback(p);
                detailsCache[personId] = {person:p, artist:alternate, albums:groupAlbums(creditedTracks)};
            }
            if (serial !== requestSerial || !opened) { return; }
            current = detailsCache[personId];
            albumCount = current.albums.length;
            renderDetail(current);
        } catch (err) {
            if (serial !== requestSerial || !opened) { return; }
            errorText = str(err.message || err);
            loading(p.Name, 'Jellyfin API error: ' + errorText);
            console.warn(PREFIX, err);
        }
    }
    async function show(force) {
        if (!document.body) { return; }
        shell(); opened = true; mode = 'list'; selectedId = ''; current = null;
        requestSerial++;
        id(PANEL).classList.add('jfca-open');
        loading('Composers', 'Loading People from Jellyfin…');
        try {
            if (!force) {
                await warmPeople();
                // Refresh shared edits on every opening, including changes saved on other browsers.
                if (sharedReady && musicIndexed) { await loadSharedRecords(); detailsCache = {}; }
                if (opened && mode === 'list') { renderList(); }
            }
            // Full track indexing is still required for orphan filtering and album attribution,
            // but is intentionally NOT a prerequisite for the first screen.
            await readPeople(!!force);
            if (opened && mode === 'list') { errorText = ''; renderList(); }
        } catch (err) {
            if (opened && mode === 'list') {
                errorText = str(err.message || err);
                loading('Composers', 'Jellyfin API error: ' + errorText);
            }
            console.warn(PREFIX, err);
        }
    }
    function hide() {
        if (editorBusy) { editorNotice('Saving changes to the server. This view will close after verification.', false); return; }
        opened = false; requestSerial++;
        if (id(PANEL)) { id(PANEL).classList.remove('jfca-open'); }

    }
    function navigateItem(itemId) {
        if (!/^[0-9a-f-]{32,36}$/i.test(str(itemId))) { return; }
        var c = client();
        var serverId = typeof c.serverId === 'function' ? c.serverId() : '';
        hide();
        window.location.hash = '#/details?id=' + encodeURIComponent(itemId) +
            (serverId ? '&serverId=' + encodeURIComponent(serverId) : '');
    }
    function panelClick(event) {
        var target = event.target && event.target.closest &&
            event.target.closest('[data-action],[data-person-id],[data-album-id],[data-track-id]');
        if (!target) { return; }
        var action = target.dataset.action;
        if (action === 'close') { hide(); return; }
        if (action === 'edit') { openEditor(); return; }
        if (action === 'migrate-local') { migrateVirtualItems(readLocalOverrides()).catch(function (error) { window.alert(str(error.message || error)); }); return; }
        if (action === 'cancel-edit') { mode='detail'; editorDraft=null; if(current) {renderDetail(current);} return; }
        if (action === 'copy-artist') { copyFromArtist(); return; }
        if (action === 'save-edit') { saveEdit(); return; }
        if (action === 'export-virtual') { exportVirtual(); return; }
        if (action === 'import-virtual') { importVirtual(); return; }
        if (action === 'back') {
            editorDraft = null;
            requestSerial++; mode = 'list'; selectedId = ''; renderList();
            id(PANEL).scrollTop = 0; return;
        }
        if (action === 'refresh') {
            detailsCache = {}; lastLoaded = 0;
            show(true); return;
        }
        if (action === 'prev' || action === 'next') {
            page += action === 'prev' ? -1 : 1;
            renderList(); id(PANEL).scrollTop = 0; return;
        }
        if (target.dataset.personId) { openDetail(target.dataset.personId); return; }
        if (target.dataset.albumId) { navigateItem(target.dataset.albumId); return; }
        if (target.dataset.trackId) { navigateItem(target.dataset.trackId); }
    }
    function panelInput(event) {
        if (event.target && event.target.classList.contains('jfca-missing')) {
            missingOnly = !!event.target.checked; page = 0; renderList(); return;
        }
        if (!event.target || !event.target.classList.contains('jfca-search')) { return; }
        var input = event.target;
        var pos = input.selectionStart;
        search = input.value; page = 0; renderList();
        var replacement = id(BODY).querySelector('.jfca-search');
        if (replacement) {
            replacement.focus();
            try { replacement.setSelectionRange(pos, pos); } catch (ignore) { }
        }
    }
    function launch(event) {
        if (event) { event.preventDefault(); event.stopPropagation(); }
        if (!opened) { show(false); }
    }
    function visible(node) {
        return !!(node && node.isConnected &&
            (!node.getClientRects || node.getClientRects().length > 0));
    }
    function onMusicPage() {
        // The user's Jellyfin 12.2 Music URL is
        // #/music?topParentId=<library-id>&collectionType=music.
        // Do not match #/musicvideos, /details, or the global Music sidebar.
        return /^#\/music(?:[/?#]|$)/i.test(str(window.location && window.location.hash));
    }
    function isMusicLink(node) {
        if (!node || !node.getAttribute) { return false; }
        var href = str(node.getAttribute('href'));
        var label = norm(node.getAttribute('aria-label') || node.textContent).toLowerCase();
        return label === 'music' && /^#\/music(?:[/?#]|$)/i.test(href) &&
            /(?:[?&])collectionType=music(?:[&#]|$)/i.test(href);
    }
    function launchFromNavigation(event) {
        // Avoid Jellyfin/React's delegated click handlers interpreting our
        // additional control as their built-in Music or Artists navigation.
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }
        show(false);
    }
    function addMainMenuLink() {
        var existing = id(NAV);
        if (existing && existing.isConnected) { return; }
        // Jellyfin 12 Modern renders Music as an MUI <a> outside nav/aside;
        // Legacy also renders .lnkMediaFolder.navMenuOption. Search globally,
        // choose a visible Modern link first, and never match Music Videos.
        var links = document.querySelectorAll('a[href]');
        var preferred = null, candidate = null;
        for (var i = 0; i < links.length; i++) {
            var node = links[i];
            if (!isMusicLink(node) || !visible(node) || node.closest('#' + PANEL)) { continue; }
            if (!candidate) { candidate = node; }
            if (str(node.className).indexOf('MuiButton') >= 0) { preferred = node; break; }
        }
        var musicLink = preferred || candidate;
        if (!musicLink || !musicLink.parentElement) { return; }
        var composer = elem('a', str(musicLink.className), '♫ Composers');
        composer.id = NAV;
        composer.setAttribute('href', musicLink.getAttribute('href'));
        composer.setAttribute('aria-label', 'Composers');
        composer.addEventListener('click', launchFromNavigation, true);
        musicLink.insertAdjacentElement('afterend', composer);
        navigationInsertions++;
    }
    function addMusicTab() {
        var old = id(MUSIC_TAB);
        if (!onMusicPage()) {
            // Some Jellyfin layouts preserve the same tab container when
            // switching libraries; never leave Composers on unrelated pages.
            if (old) { old.remove(); }
            musicTabPlacement = 'none';
            return;
        }
        if (old && old.isConnected) {
            musicTabPlacement = 'beside Artists';
            return;
        }
        // The user's actual 12.2 DOM exposed:
        // BUTTON label=Artists class='MuiButtonBase-root MuiButton-root ...
        // MuiButton-sizeLarge ...'. Other category buttons may not exist at
        // first paint. We only target a visible Artists button on /music.
        var buttons = document.querySelectorAll('button');
        var anchor = null;
        for (var i = 0; i < buttons.length; i++) {
            var button = buttons[i];
            if (!visible(button) || button.closest('#' + PANEL)) { continue; }
            if (norm(button.getAttribute('aria-label') || button.textContent).toLowerCase() !== 'artists') { continue; }
            if (str(button.className).indexOf('MuiButton') < 0) { continue; }
            anchor = button;
            break;
        }
        if (!anchor || !anchor.parentElement) { return; }
        var composer = btn('Composers', str(anchor.className)
            .replace(/\bMui-selected\b/g, '').replace(/\s+/g, ' ').trim());
        composer.id = MUSIC_TAB;
        composer.setAttribute('aria-label', 'Composers');
        composer.setAttribute('aria-selected', 'false');
        composer.addEventListener('click', launchFromNavigation, true);
        anchor.insertAdjacentElement('afterend', composer);
        musicTabInsertions++;
        musicTabPlacement = 'beside Artists';
    }
    function navigation() {
        if (!document.body) { return; }
        css();
        if (id(SHORTCUT)) { id(SHORTCUT).remove(); }
        addMainMenuLink();
        addMusicTab();
    }
    var tickId = window.setInterval(navigation, 1500);
    function prewarmCatalog(attempt) {
        if (window.ApiClient && typeof window.ApiClient.getJSON === 'function') {
            readPeople(false).catch(function (error) {
                console.warn(PREFIX, 'Background composer prefetch will retry when opened:', error);
            });
        } else if (attempt < 10) {
            warmTimer = window.setTimeout(function () { prewarmCatalog(attempt + 1); }, 1500);
        }
    }
    if (typeof window.setTimeout === 'function') {
        warmTimer = window.setTimeout(function () { prewarmCatalog(0); }, 2000);
    }

    var api = {
        loaded: true, version: VERSION,
        show: function () { return show(false); },
        refresh: function () { detailsCache = {}; lastLoaded = 0; return show(true); },
        close: hide,
        status: function () {
            return {loaded:true, version:VERSION, apiAvailable:!!(window.ApiClient && window.ApiClient.getJSON),
                peopleLoaded:people.length, jellyfinTotal:lastPeopleTotal, audioScanned:audioScanned, creditedAudio:creditedAudio, hiddenUncreditedPeople:uncreditedPeople.length, combinedPeople:splitPeople.length, lastFetched:lastLoaded ? new Date(lastLoaded).toISOString() : '',
                opened:opened, mode:mode, selectedId:selectedId, lastAlbumCount:albumCount,
                navLink:!!id(NAV), shortcut:false, navInsertions:navigationInsertions,
                onMusicPage:onMusicPage(), musicTab:!!id(MUSIC_TAB),
                musicTabVisible:visible(id(MUSIC_TAB)), musicTabInsertions:musicTabInsertions,
                placement:musicTabPlacement,
                pending:!!pending, indexingComplete:musicIndexed, lastError:errorText, missingOnly:missingOnly, editorActive:mode==='edit',
                sharedPluginReady:sharedReady, sharedRecords:Object.keys(sharedRecords).length, sharedError:sharedError};
        },
        // Safe read-only navigation retry; useful immediately after Music opens.
        rescan: function () { navigation(); return api.status(); },
        // Pure function exposed for regression testing; does not query Jellyfin.
        groupAlbums: groupAlbums,
        people: function (force) { return readPeople(!!force); },
        albums: async function (personId) {
            await readPeople(false);
            var person = people.find(function (entry) { return entry.Id === personId; });
            return groupAlbums(person ? (tracksByName[person._jfcaKey] || {tracks:[]}).tracks : []);
        },
        // Review candidates; uncredited means no Audio credit, not a proven database orphan.
        editMetadata: async function (personId) {
            if (!opened) { await show(false); }
            await openDetail(personId);
            await openEditor();
            return api.status();
        },
        audit: function () { return {rawPeople:rawPeople.length, visibleComposers:people.length,
            audioScanned:audioScanned, hiddenUncreditedPeople:uncreditedPeople.slice(),
            combinedPeople:splitPeople.slice()}; },
        stop: function () { window.clearInterval(tickId); if (warmTimer) { window.clearTimeout(warmTimer); } hide(); }
    };
    window[KEY] = api;
    window.addEventListener('hashchange', function () {
        if (opened) { hide(); }
        navigation();
    });
    window.addEventListener('popstate', function () {
        if (opened) { hide(); }
        navigation();
    });
    document.addEventListener('keydown', function (e) { if (opened && e.key === 'Escape') { hide(); } });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', navigation);
    } else { navigation(); }
    console.info(PREFIX, 'Loaded; API is source of truth (no embedded Composer catalog).');
}
jellyfinComposerApiBrowserV360();
