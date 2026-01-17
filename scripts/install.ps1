param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\jot",
    [switch]$AddToPath
)

$repo = "Baz00k/jot-cli"
$asset = "jot-windows-x64.exe"

$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -and $arch -notmatch "AMD64|x86_64") {
    Write-Error "Unsupported architecture: $arch. Only Windows x64 is supported."
    exit 1
}

if ($Version -eq "latest") {
    $url = "https://github.com/$repo/releases/latest/download/$asset"
    $checksumUrl = "https://github.com/$repo/releases/latest/download/jot-checksums.txt"
} else {
    $url = "https://github.com/$repo/releases/download/v$Version/$asset"
    $checksumUrl = "https://github.com/$repo/releases/download/v$Version/jot-checksums.txt"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$target = Join-Path $InstallDir "jot.exe"

# Download checksums
$checksumTarget = Join-Path $InstallDir "checksums.txt"
Write-Host "Downloading checksums from $checksumUrl" -ForegroundColor Gray
try {
    Invoke-WebRequest -Uri $checksumUrl -OutFile $checksumTarget -UseBasicParsing
} catch {
    Write-Warning "Failed to download checksums. Proceeding without verification (NOT RECOMMENDED)."
}

Write-Host "Downloading jot from $url" -ForegroundColor Green
Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing

# Verify Checksum
if (Test-Path $checksumTarget) {
    $expectedHash = Select-String -Path $checksumTarget -Pattern "bin/$asset" | ForEach-Object { $_.Line.Split(' ')[0] }
    if ($expectedHash) {
        $fileHash = Get-FileHash -Path $target -Algorithm SHA256
        if ($fileHash.Hash.ToLower() -ne $expectedHash.ToLower()) {
            Write-Error "Checksum verification failed! Expected $expectedHash but got $($fileHash.Hash)"
            Remove-Item $target
            exit 1
        }
        Write-Host "Checksum verified: $($fileHash.Hash)" -ForegroundColor Green
    } else {
        Write-Warning "Could not find checksum for $asset in checksums file."
    }
}


if ($AddToPath) {
    $current = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not $current.Split(';') -contains $InstallDir) {
        [Environment]::SetEnvironmentVariable("Path", "$current;$InstallDir", "User")
        Write-Host "Added $InstallDir to PATH. Restart your shell." -ForegroundColor Yellow
    }
} else {
    Write-Host "Add $InstallDir to your PATH to use 'jot' from anywhere." -ForegroundColor Yellow
}

Write-Host "Installed to $target" -ForegroundColor Green