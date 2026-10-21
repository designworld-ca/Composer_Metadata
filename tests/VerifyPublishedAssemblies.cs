/*
 * VerifyPublishedAssemblies.cs v1.0.0 — Composer Shared Metadata .NET 10 CI guard.
 * Purpose: Check actual published DLL assembly identities (including SQLite 10.0.13),
 * not merely names, before creating/installing a release ZIP.
 * Requirements: .NET 10 SDK; dotnet run --project tests/VerifyPublishedAssemblies.csproj
 *   -c Release -- out/linux-x64 1.2.3
 * Safety: Read-only. Does not run Jellyfin, open composer DBs or modify artifacts.
 */
using System.Reflection;

if (args.Length != 2)
{
    Console.Error.WriteLine("Usage: VerifyPublishedAssemblies <publish-directory> <plugin-version>");
    return 2;
}

var publishDir = Path.GetFullPath(args[0]);
var expectedPluginVersion = new Version(args[1] + ".0");
var required = new[]
{
    "Jellyfin.Plugin.ComposerSharedMetadata.dll",
    "Microsoft.Data.Sqlite.dll",
    "SQLitePCLRaw.core.dll",
    "SQLitePCLRaw.provider.e_sqlite3.dll",
    "SQLitePCLRaw.batteries_v2.dll"
};
foreach (var name in required)
{
    var file = Path.Combine(publishDir, name);
    if (!File.Exists(file))
    {
        Console.Error.WriteLine($"Missing required managed dependency: {file}");
        return 1;
    }
    // AssemblyName.GetAssemblyName reads assembly identity without executing DLL code.
    var identity = AssemblyName.GetAssemblyName(file);
    var expectedName = Path.GetFileNameWithoutExtension(name);
    if (!string.Equals(identity.Name, expectedName, StringComparison.Ordinal))
    {
        Console.Error.WriteLine($"Wrong DLL identity: {name} contains {identity.Name}");
        return 1;
    }
    if (name == "Jellyfin.Plugin.ComposerSharedMetadata.dll" &&
        !Equals(identity.Version, expectedPluginVersion))
    {
        Console.Error.WriteLine($"Plugin DLL version mismatch: expected {expectedPluginVersion}, found {identity.Version}");
        return 1;
    }
    if (name == "Microsoft.Data.Sqlite.dll" &&
        !Equals(identity.Version, new Version(10, 0, 13, 0)))
    {
        Console.Error.WriteLine($"SQLite DLL version mismatch: expected 10.0.13.0, found {identity.Version}");
        return 1;
    }
    Console.WriteLine($"Validated assembly: {identity.Name}, version {identity.Version}");
}
return 0;
