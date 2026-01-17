const [versionArg, checksumFile] = process.argv.slice(2);

if (!versionArg || !checksumFile) {
    throw new Error("Usage: bun update-scoop-manifest.ts <version> <checksumsPath>");
}

const version = versionArg.startsWith("v") ? versionArg.slice(1) : versionArg;
const checksums = await Bun.file(checksumFile).text();
const lines = checksums
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
        const [hash, file] = line.split(/\s+/);
        if (!hash || !file) {
            throw new Error(`Invalid checksum line: ${line}`);
        }
        return { file, hash };
    });

const windowsAsset = lines.find((entry) => entry.file === "bin/jot-windows-x64.exe");
if (!windowsAsset?.hash) {
    throw new Error("Missing checksum for bin/jot-windows-x64.exe");
}

type ScoopManifest = {
    version: string;
    description: string;
    homepage: string;
    url: string;
    hash: string;
    bin: string | string[] | [string, string][];
    checkver: string;
    autoupdate: {
        url: string;
        hash: {
            url: string;
            regex: string;
        };
    };
};

const templatePath = "packaging/scoop/jot.json";
const template = JSON.parse(await Bun.file(templatePath).text()) as unknown as ScoopManifest;

const updated: ScoopManifest = {
    ...template,
    version,
    url: `https://github.com/Baz00k/jot-cli/releases/download/v${version}/jot-windows-x64.exe`,
    hash: windowsAsset.hash,
};

const serialized = `${JSON.stringify(updated, null, 4)}\n`;
const hasher = new Bun.CryptoHasher("sha256");
hasher.update(serialized);
const checksumHex = hasher.digest("hex");

await Bun.write("dist/jot.json", serialized);
await Bun.write("dist/jot.json.sha256", `${checksumHex}\n`);
