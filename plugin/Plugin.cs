/*
 * Jellyfin Composer Shared Metadata Plugin v1.1.0
 * Native Jellyfin 12.2/net10 entry point. Separate SQLite metadata overlays only.
 * Reads do not change disk. Writes occur only via explicit, administrator-authorized PUT.
 * Does not open or mutate jellyfin.db, tags, track credits or native People records.
 */
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.ComposerSharedMetadata;

public sealed class Plugin : BasePlugin<PluginConfiguration>
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }
    public override string Name => "Composer Shared Metadata";
    public override string Description => "Admin-edited composer biographies and portraits stored in a separate SQLite database.";
    public override Guid Id => Guid.Parse("4c65902b-e89d-4549-a313-2a204c622e77");
}
