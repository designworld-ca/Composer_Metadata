/*
 * Jellyfin Composer Shared Metadata API Controller v1.1.0.
 * Jellyfin 12.2; authenticated reads, elevated admin writes; same-origin API.
 * Endpoints preserve the v3.4 browser contract, so migration of v3.3 backups works.
 * No direct Jellyfin database or native People writes; one composer per explicit PUT.
 */
using MediaBrowser.Common.Api;
using MediaBrowser.Common.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.ComposerSharedMetadata;

[ApiController]
[Authorize]
[Route("ComposerSharedMetadata")]
public sealed class ComposerMetadataController : ControllerBase
{
    private readonly ComposerSqliteStore _store;

    public ComposerMetadataController(IApplicationPaths paths)
    {
        _store = new ComposerSqliteStore(paths.PluginConfigurationsPath);
    }

    [HttpGet("health")]
    public IActionResult Health() => Ok(new
    {
        status = "ready",
        storage = "plugin-sqlite",
        pluginVersion = "1.1.0",
        schemaVersion = 1
    });

    [HttpGet("records")]
    public IActionResult Records() => Ok(new { schemaVersion = 1, records = _store.ReadAll() });

    [HttpGet("image-data")]
    public IActionResult ImageData([FromQuery] string key)
    {
        try
        {
            var image = _store.ReadImage(key);
            if (image is null) return NotFound();
            Response.Headers["Cache-Control"] = "private, no-store";
            return Ok(new { imageDataUrl = "data:" + image.Value.Mime + ";base64," + Convert.ToBase64String(image.Value.Bytes) });
        }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
    }

    [HttpGet("image")]
    public IActionResult Image([FromQuery] string key)
    {
        try
        {
            var image = _store.ReadImage(key);
            if (image is null) return NotFound();
            Response.Headers["Cache-Control"] = "private, no-store";
            return File(image.Value.Bytes, image.Value.Mime);
        }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
    }

    [HttpPut("record")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(9_000_000)]
    public async Task<IActionResult> Update([FromQuery] string key, [FromBody] ComposerEditRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var outcome = await _store.SaveAsync(key, request, cancellationToken).ConfigureAwait(false);
            if (outcome.Conflict) return Conflict(new { error = "Record changed on another browser; refresh before saving.", record = outcome.Record });
            return Ok(outcome.Record);
        }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
    }
}
