/*
 * ComposerLogToken.cs — v1.2.1
 * Correlate SQLite write and conflict log events without logging a Person's
 * name, raw composer key, biography, image bytes, or user credentials.
 * Deliberately not used for security decisions or database identity.
 */
using System.Security.Cryptography;
using System.Text;

namespace Jellyfin.Plugin.ComposerSharedMetadata;

internal static class ComposerLogToken
{
    internal static string ForKey(string key)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(key));
        return Convert.ToHexString(digest)[..12];
    }
}
