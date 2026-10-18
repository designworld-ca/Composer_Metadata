/*
 * StoreSmoke v1.2.1. In temporary isolated directory only; never touches Jellyfin or production data.
 * Run: dotnet run --project tests/StoreSmoke.csproj -c Release
 * Confirms read-only no DB creation, key-revision conflicts, portrait preservation, blob retrieval.
 */
using Jellyfin.Plugin.ComposerSharedMetadata;

var directory = Path.Combine(Path.GetTempPath(), "jf-composer-plugin-smoke-" + Guid.NewGuid().ToString("N"));
try
{
    var store = new ComposerSqliteStore(directory);
    if (store.ReadAll().Count != 0 || File.Exists(store.DatabasePath)) throw new Exception("GET created database");
    var rejected = false;
    try { await store.SaveAsync("example", new ComposerEditRequest { Name = "Test", Overview = "Bio", ExpectedRevision = 0, ImageDataUrl = "data:image/png;base64,ZGF0YQ==" }); }
    catch (ArgumentException) { rejected = true; }
    if (!rejected || File.Exists(store.DatabasePath)) throw new Exception("Invalid image wrote database");
    var one = await store.SaveAsync("annabelle chvostek", new ComposerEditRequest { Name = "Annabelle Chvostek", Overview = "Biography one", ExpectedRevision = 0 });
    if (one.Conflict || one.Record?.Revision != 1) throw new Exception("Failed to save revision 1");
    var conflict = await store.SaveAsync("annabelle chvostek", new ComposerEditRequest { Name = "Annabelle Chvostek", Overview = "wrong", ExpectedRevision = 0 });
    if (!conflict.Conflict || store.ReadAll()["annabelle chvostek"].Overview != "Biography one") throw new Exception("Missing revision guard");
    const string png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlQS+EAAAAASUVORK5CYII=";
    var two = await store.SaveAsync("annabelle chvostek", new ComposerEditRequest { Name = "Annabelle Chvostek", Overview = "Biography two", ExpectedRevision = 1, ImageDataUrl = "data:image/png;base64," + png });
    if (two.Conflict || two.Record?.Revision != 2 || string.IsNullOrWhiteSpace(two.Record.ImageFile)) throw new Exception("Image upload failed");
    var portrait = store.ReadImage("annabelle chvostek");
    if (portrait?.Mime != "image/png" || portrait.Value.Bytes.Length < 60) throw new Exception("Image retrieval failed");
    var three = await store.SaveAsync("annabelle chvostek", new ComposerEditRequest { Name = "Annabelle Chvostek", Overview = "Biography three", ExpectedRevision = 2 });
    if (three.Conflict || store.ReadImage("annabelle chvostek") is null) throw new Exception("Omitted image cleared existing image");
    var person = await store.SaveAsync("person:19753d214c0c27f832859365118aaed0", new ComposerEditRequest { Name = "3 Doors Down", Overview = "Person overlay", ExpectedRevision = 0 });
    if (person.Record?.Revision != 1 || store.ReadAll().Count != 2) throw new Exception("Person overlay failed");
    Console.WriteLine("PASS: read-only GET, input validation, SQLite save, conflicts, image persistence, virtual and real-Person overlays");
}
finally
{
    if (Directory.Exists(directory)) Directory.Delete(directory, true);
}
