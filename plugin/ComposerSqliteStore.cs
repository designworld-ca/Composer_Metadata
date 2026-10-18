/*
 * ComposerSqliteStore.cs — v1.2.1 (Jellyfin 12.2/.NET 10)
 * Separate SQLite data at <PluginConfigurationsPath>/ComposerSharedMetadata/composer_metadata.sqlite3.
 * PREVIEW: ReadAll/ReadImage do not initialize/mutate a database. Health is read-only.
 * APPLY: SaveAsync only after authenticated administrator PUT, exact composer key + expectedRevision.
 * SAFETY: no deletes, never references jellyfin.db or other Jellyfin data stores;
 * single-record transactions and optimistic revision concurrency; max 6 MB verified PNG/JPG/WebP.
 */
using System.Text;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ComposerSharedMetadata;

public sealed class ComposerRecord
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Overview { get; set; } = string.Empty;
    public int Revision { get; set; }
    // Compatibility marker for the JavaScript client's shared-image retrieval.
    public string ImageFile { get; set; } = string.Empty;
    public string ImageMime { get; set; } = string.Empty;
    public DateTime UpdatedUtc { get; set; }
}

public sealed class ComposerEditRequest
{
    public string Name { get; set; } = string.Empty;
    public string Overview { get; set; } = string.Empty;
    public int ExpectedRevision { get; set; }
    public string? ImageDataUrl { get; set; }
}

public sealed class SaveResult
{
    public bool Conflict { get; init; }
    public ComposerRecord? Record { get; init; }
}

public sealed class ComposerSqliteStore
{
    private const int MaxImageBytes = 6 * 1024 * 1024;
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private readonly string _root;
    private readonly string _file;
    private readonly ILogger<ComposerSqliteStore>? _logger;

    // Optional logger keeps isolated smoke tests and read-only tooling compatible.
    public ComposerSqliteStore(string pluginConfigurationsPath, ILogger<ComposerSqliteStore>? logger = null)
    {
        _logger = logger;
        if (string.IsNullOrWhiteSpace(pluginConfigurationsPath)) throw new ArgumentException("Plugin configuration path missing.");
        _root = Path.Combine(pluginConfigurationsPath, "ComposerSharedMetadata");
        _file = Path.Combine(_root, "composer_metadata.sqlite3");
    }

    public string DatabasePath => _file;

    private static string CheckKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Composer key is required.");
        var result = key.Trim();
        if (result.Length > 256 || result.Any(char.IsControl)) throw new ArgumentException("Invalid composer key.");
        return result;
    }

    private SqliteConnection Connect(bool readOnly)
    {
        var b = new SqliteConnectionStringBuilder
        {
            DataSource = _file,
            Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Private,
            Pooling = false,
            DefaultTimeout = 10
        };
        var connection = new SqliteConnection(b.ToString());
        connection.Open();
        return connection;
    }

    private static void Initialize(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = @"CREATE TABLE IF NOT EXISTS composer_metadata (
            composer_key TEXT PRIMARY KEY COLLATE BINARY NOT NULL,
            name TEXT NOT NULL,
            overview TEXT NOT NULL,
            revision INTEGER NOT NULL CHECK (revision > 0),
            image_mime TEXT NOT NULL DEFAULT '',
            image_blob BLOB NULL,
            updated_utc TEXT NOT NULL
        );";
        command.ExecuteNonQuery();
    }

    private static ComposerRecord ToRecord(SqliteDataReader reader)
    {
        var mime = reader.GetString(4);
        var hasImage = !reader.IsDBNull(5);
        var revision = reader.GetInt32(3);
        return new ComposerRecord
        {
            Key = reader.GetString(0),
            Name = reader.GetString(1),
            Overview = reader.GetString(2),
            Revision = revision,
            ImageMime = mime,
            ImageFile = hasImage && !string.IsNullOrEmpty(mime) ? "sqlite:" + revision : string.Empty,
            UpdatedUtc = DateTime.Parse(reader.GetString(6), System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind)
        };
    }

    private static SqliteCommand Select(SqliteConnection connection, string? key = null)
    {
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT composer_key, name, overview, revision, image_mime, image_blob, updated_utc FROM composer_metadata";
        if (key is not null)
        {
            cmd.CommandText += " WHERE composer_key = $key";
            cmd.Parameters.AddWithValue("$key", key);
        }
        return cmd;
    }

    public Dictionary<string, ComposerRecord> ReadAll()
    {
        var result = new Dictionary<string, ComposerRecord>(StringComparer.Ordinal);
        if (!File.Exists(_file))
        {
            _logger?.LogDebug("CSM111 Composer SQLite file not yet created; returning empty overlay list");
            return result;
        }
        using var conn = Connect(true);
        using var cmd = Select(conn);
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var record = ToRecord(reader);
            result[record.Key] = record;
        }
        _logger?.LogDebug("CSM112 Composer SQLite read completed; count {RecordCount}", result.Count);
        return result;
    }

    public (byte[] Bytes, string Mime)? ReadImage(string key)
    {
        key = CheckKey(key);
        if (!File.Exists(_file)) return null;
        using var conn = Connect(true);
        using var cmd = Select(conn, key);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read() || reader.IsDBNull(5)) return null;
        var mime = reader.GetString(4);
        if (mime is not ("image/jpeg" or "image/png" or "image/webp")) return null;
        var bytes = (byte[])reader.GetValue(5);
        return (bytes, mime);
    }

    private static (byte[] Bytes, string Mime)? ParseImage(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null; // preserve existing image when omitted
        var split = value.IndexOf(',');
        if (split < 0) throw new ArgumentException("Expected data:image/...;base64, portrait.");
        var prefix = value[..(split + 1)];
        var mime = prefix switch
        {
            "data:image/jpeg;base64," => "image/jpeg",
            "data:image/png;base64," => "image/png",
            "data:image/webp;base64," => "image/webp",
            _ => throw new ArgumentException("Supported image types: PNG, JPEG and WebP only.")
        };
        var encoded = value[(split + 1)..];
        if (encoded.Length > 8_388_612) throw new ArgumentException("Portrait exceeds 6 MB.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(encoded); }
        catch (FormatException) { throw new ArgumentException("Portrait has invalid base64."); }
        if (bytes.Length < 12 || bytes.Length > MaxImageBytes) throw new ArgumentException("Invalid portrait size (max 6 MB).");
        var magic = mime switch
        {
            "image/png" => bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/jpeg" => bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255,
            "image/webp" => Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP",
            _ => false
        };
        if (!magic) throw new ArgumentException("Image signature does not match declared MIME type.");
        return (bytes, mime);
    }

    public async Task<SaveResult> SaveAsync(string key, ComposerEditRequest request, CancellationToken cancellationToken = default)
    {
        key = CheckKey(key);
        if (request is null) throw new ArgumentException("Request body is missing.");
        var name = request.Name?.Trim() ?? string.Empty;
        if (name.Length is < 1 or > 256 || name.Any(char.IsControl)) throw new ArgumentException("Composer name must be 1–256 characters.");
        if (request.Overview is null || request.Overview.Length > 100_000) throw new ArgumentException("Biography exceeds 100,000 characters.");
        if (request.ExpectedRevision < 0) throw new ArgumentException("Invalid expectedRevision.");
        var image = ParseImage(request.ImageDataUrl);
        var keyToken = ComposerLogToken.ForKey(key);
        _logger?.LogDebug("CSM200 Validated save; record token {RecordToken}; expected revision {ExpectedRevision}; portrait supplied {HasPortrait}",
            keyToken, request.ExpectedRevision, image is not null);

        await Gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            // A rejected preview or validation error does NOT create the database.
            var firstWrite = !File.Exists(_file);
            Directory.CreateDirectory(_root);
            using var conn = Connect(false);
            Initialize(conn);
            if (firstWrite)
            {
                _logger?.LogInformation("CSM201 Initialized independent Composer SQLite database on first write");
            }
            using var txn = conn.BeginTransaction();
            int oldRevision = 0;
            ComposerRecord? existing = null;
            using (var query = Select(conn, key))
            {
                query.Transaction = txn;
                using var reader = query.ExecuteReader();
                if (reader.Read())
                {
                    existing = ToRecord(reader);
                    oldRevision = existing.Revision;
                }
            }
            if (oldRevision != request.ExpectedRevision)
            {
                txn.Rollback();
                _logger?.LogWarning("CSM209 SQLite revision conflict; record token {RecordToken}; expected {ExpectedRevision}; actual {ActualRevision}",
                    keyToken, request.ExpectedRevision, oldRevision);
                return new SaveResult { Conflict = true, Record = existing };
            }
            var stamp = DateTime.UtcNow.ToString("O", System.Globalization.CultureInfo.InvariantCulture);
            var revision = oldRevision + 1;
            using (var update = conn.CreateCommand())
            {
                update.Transaction = txn;
                update.CommandText = @"INSERT INTO composer_metadata
                    (composer_key, name, overview, revision, image_mime, image_blob, updated_utc)
                    VALUES ($key, $name, $overview, $revision, $imageMime, $imageBlob, $stamp)
                    ON CONFLICT(composer_key) DO UPDATE SET
                        name=excluded.name,
                        overview=excluded.overview,
                        revision=excluded.revision,
                        image_mime=CASE WHEN $hasImage=1 THEN excluded.image_mime ELSE composer_metadata.image_mime END,
                        image_blob=CASE WHEN $hasImage=1 THEN excluded.image_blob ELSE composer_metadata.image_blob END,
                        updated_utc=excluded.updated_utc
                    WHERE composer_metadata.revision=$expectedRevision;";
                update.Parameters.AddWithValue("$key", key);
                update.Parameters.AddWithValue("$name", name);
                update.Parameters.AddWithValue("$overview", request.Overview);
                update.Parameters.AddWithValue("$revision", revision);
                update.Parameters.AddWithValue("$imageMime", image?.Mime ?? string.Empty);
                update.Parameters.AddWithValue("$imageBlob", (object?)image?.Bytes ?? DBNull.Value);
                update.Parameters.AddWithValue("$hasImage", image is null ? 0 : 1);
                update.Parameters.AddWithValue("$stamp", stamp);
                update.Parameters.AddWithValue("$expectedRevision", oldRevision);
                if (update.ExecuteNonQuery() != 1)
                {
                    txn.Rollback();
                    _logger?.LogWarning("CSM209 SQLite conditional update conflict; record token {RecordToken}", keyToken);
                    return new SaveResult { Conflict = true, Record = existing };
                }
            }
            txn.Commit();
            using var select = Select(conn, key);
            using var resultReader = select.ExecuteReader();
            if (!resultReader.Read()) throw new InvalidOperationException("Saved composer record was not readable after commit.");
            var savedRecord = ToRecord(resultReader);
            _logger?.LogInformation(
                "CSM210 SQLite composer metadata saved; record token {RecordToken}; revision {Revision}; portrait replaced {PortraitChanged}; portrait present {PortraitPresent}",
                keyToken, savedRecord.Revision, image is not null, !string.IsNullOrWhiteSpace(savedRecord.ImageFile));
            return new SaveResult { Record = savedRecord };
        }
        catch (Exception ex) when (ex is not OperationCanceledException && ex is not ArgumentException)
        {
            _logger?.LogError(ex, "CSM500 SQLite save failed; record token {RecordToken}", keyToken);
            throw;
        }
        finally { Gate.Release(); }
    }
}
