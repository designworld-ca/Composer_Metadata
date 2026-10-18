/*
 * Jellyfin Composer Shared Metadata configuration v1.2.1.
 * No passwords, API keys, plugin-side database location override or credentials.
 * Only the plugin-owned SQLite file under PluginConfigurationsPath is modified.
 */
using MediaBrowser.Model.Plugins;
namespace Jellyfin.Plugin.ComposerSharedMetadata;
public sealed class PluginConfiguration : BasePluginConfiguration { }
