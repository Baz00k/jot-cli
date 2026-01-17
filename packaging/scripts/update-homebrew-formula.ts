const [versionArg, checksumFile] = process.argv.slice(2);

if (!versionArg || !checksumFile) {
    throw new Error("Usage: bun update-homebrew-formula.ts <version> <checksumsPath>");
}

const version = versionArg.startsWith("v") ? versionArg.slice(1) : versionArg;
const checksums = await Bun.file(checksumFile).text();
const entries = checksums
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

const lookup = (fileName: string): string => {
    const entry = entries.find((item) => item.file === `bin/${fileName}`);
    if (!entry?.hash) {
        throw new Error(`Missing checksum for bin/${fileName}`);
    }
    return entry.hash;
};

const templatePath = "packaging/homebrew/jot-cli.rb";
const template = await Bun.file(templatePath).text();

const urls: Record<string, string> = {
    __URL_MACOS_ARM64__: `https://github.com/Baz00k/jot-cli/releases/download/v${version}/jot-macos-arm64`,
    __URL_MACOS_X64__: `https://github.com/Baz00k/jot-cli/releases/download/v${version}/jot-macos-x64`,
    __URL_LINUX_ARM64__: `https://github.com/Baz00k/jot-cli/releases/download/v${version}/jot-linux-arm64`,
    __URL_LINUX_X64__: `https://github.com/Baz00k/jot-cli/releases/download/v${version}/jot-linux-x64`,
};

const hashes: Record<string, string> = {
    __SHA256_MACOS_ARM64__: lookup("jot-macos-arm64"),
    __SHA256_MACOS_X64__: lookup("jot-macos-x64"),
    __SHA256_LINUX_ARM64__: lookup("jot-linux-arm64"),
    __SHA256_LINUX_X64__: lookup("jot-linux-x64"),
};

let replaced = template.replace("__VERSION__", version);

Object.entries(urls).forEach(([placeholder, value]) => {
    replaced = replaced.replace(placeholder, value);
});

Object.entries(hashes).forEach(([placeholder, value]) => {
    replaced = replaced.replace(placeholder, value);
});

await Bun.write("dist/jot-cli.rb", replaced);
