/*
 * Jellyfin Composer Shared Metadata Plugin v1.2.1
 * Native Jellyfin 12.2/net10 entry point. Separate SQLite metadata overlays only.
 * Reads do not change disk. Writes occur only via explicit, administrator-authorized PUT.
 * Does not open or mutate jellyfin.db, tags, track credits or native People records.
 */
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Serialization;
using MediaBrowser.Model.Plugins;
using System.Collections.Generic;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ComposerSharedMetadata;

public sealed class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer, ILogger<Plugin> logger)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        logger.LogInformation(
            "CSM100 Composer Shared Metadata plugin {Version} loaded; independent SQLite storage, schema {SchemaVersion}",
            "1.2.1", 1);
    }

    public static Plugin? Instance { get; private set; }
    public override string Name => "Composer Shared Metadata";
    public override string Description => "Admin-edited composer biographies and portraits stored in a separate SQLite database.";
    public override Guid Id => Guid.Parse("4c65902b-e89d-4549-a313-2a204c622e77");

    // Adds a first-class informational settings page in Dashboard > Plugins.
    // Enable/disable/uninstall remain Jellyfin's built-in plugin manager actions.
    public IEnumerable<PluginPageInfo> GetPages() =>
    [
        new PluginPageInfo
        {
            Name = "Composer Shared Metadata",
            EmbeddedResourcePath = "Jellyfin.Plugin.ComposerSharedMetadata.Configuration.configPage.html"
        }
    ];
}
