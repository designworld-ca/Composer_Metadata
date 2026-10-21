/*
 * Jellyfin Composer Shared Metadata API Controller v1.2.3.
 * Jellyfin 12.2; authenticated reads, elevated admin writes; same-origin API.
 * Endpoints preserve the v3.4 browser contract, so migration of v3.3 backups works.
 * No direct Jellyfin database or native People writes; one composer per explicit PUT.
 */
using MediaBrowser.Common.Api;
using MediaBrowser.Common.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ComposerSharedMetadata;

/// <summary>Authenticated REST controller for plugin-owned composer SQLite metadata.</summary>
[ApiController]
[Authorize]
[Route("ComposerSharedMetadata")]
public sealed class ComposerMetadataController : ControllerBase
{
    private readonly ComposerSqliteStore _store;
    private readonly ILogger<ComposerMetadataController> _logger;

    /// <summary>Creates the authenticated API controller and its SQLite store.</summary>
    public ComposerMetadataController(
        IApplicationPaths paths,
        ILogger<ComposerMetadataController> logger,
        ILogger<ComposerSqliteStore> storeLogger)
    {
        _logger = logger;
        _store = new ComposerSqliteStore(paths.PluginConfigurationsPath, storeLogger);
    }

    /// <summary>Returns the read-only health, version, and schema status.</summary>
    [HttpGet("health")]
    public IActionResult Health()
    {
        _logger.LogDebug("CSM101 Health request served");
        return Ok(new { status = "ready", storage = "plugin-sqlite", pluginVersion = "1.2.3", schemaVersion = 1 });
    }

    /// <summary>Returns all saved composer metadata to an authenticated user.</summary>
    [HttpGet("records")]
    public IActionResult Records()
    {
        try
        {
            var records = _store.ReadAll();
            _logger.LogInformation("CSM110 Composer overlay records served; count {RecordCount}", records.Count);
            return Ok(new { schemaVersion = 1, records });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CSM510 Failed to read Composer SQLite overlays");
            throw;
        }
    }

    /// <summary>Returns a composer portrait as a base64 data URL, if present.</summary>
    [HttpGet("image-data")]
    public IActionResult ImageData([FromQuery] string key)
    {
        try
        {
            var image = _store.ReadImage(key);
            if (image is null)
            {
                _logger.LogDebug("CSM120 Portrait-data lookup: no match");
                return NotFound();
            }
            _logger.LogDebug("CSM121 Portrait-data lookup: found; mime {Mime}; bytes {Size}", image.Value.Mime, image.Value.Bytes.Length);
            Response.Headers["Cache-Control"] = "private, no-store";
            return Ok(new { imageDataUrl = "data:" + image.Value.Mime + ";base64," + Convert.ToBase64String(image.Value.Bytes) });
        }
        catch (ArgumentException e)
        {
            _logger.LogWarning("CSM122 Rejected invalid portrait-data lookup");
            return BadRequest(new { error = e.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CSM511 Failed to read Composer portrait data");
            throw;
        }
    }

    /// <summary>Streams a composer portrait with the stored MIME type.</summary>
    [HttpGet("image")]
    public IActionResult Image([FromQuery] string key)
    {
        try
        {
            var image = _store.ReadImage(key);
            if (image is null)
            {
                _logger.LogDebug("CSM123 Portrait lookup: no match");
                return NotFound();
            }
            _logger.LogDebug("CSM124 Portrait lookup: found; mime {Mime}; bytes {Size}", image.Value.Mime, image.Value.Bytes.Length);
            Response.Headers["Cache-Control"] = "private, no-store";
            return File(image.Value.Bytes, image.Value.Mime);
        }
        catch (ArgumentException e)
        {
            _logger.LogWarning("CSM125 Rejected invalid portrait lookup");
            return BadRequest(new { error = e.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CSM512 Failed to read Composer portrait");
            throw;
        }
    }

    /// <summary>Stores one validated composer edit; administrator authorization is required.</summary>
    [HttpPut("record")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(9_000_000)]
    public async Task<IActionResult> Update([FromQuery] string key, [FromBody] ComposerEditRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var outcome = await _store.SaveAsync(key, request, cancellationToken).ConfigureAwait(false);
            if (outcome.Conflict)
            {
                return Conflict(new { error = "Record changed on another browser; refresh before saving.", record = outcome.Record });
            }
            return Ok(outcome.Record);
        }
        catch (ArgumentException e)
        {
            // Never log the biography or base64 portrait submitted by the client.
            _logger.LogWarning("CSM202 Rejected invalid composer metadata save request");
            return BadRequest(new { error = e.Message });
        }
    }
}
