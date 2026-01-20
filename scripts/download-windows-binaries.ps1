# Download Windows binaries for Zerobyte
# Downloads restic, rclone, and shoutrrr for bundling with Tauri

param(
    [string]$OutputDir = "src-tauri/binaries",
    [string]$ResticVersion = "0.18.1",
    [string]$RcloneVersion = "1.72.1",
    [string]$ShoutrrrVersion = "0.13.1"
)

$ErrorActionPreference = "Stop"

Write-Host "Downloading Windows binaries for Zerobyte..." -ForegroundColor Cyan

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Tauri naming convention for Windows x64
$TauriSuffix = "x86_64-pc-windows-msvc"

# Temporary directory for downloads
$TempDir = Join-Path $env:TEMP "zerobyte-downloads"
if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
}

function Download-AndExtract {
    param(
        [string]$Name,
        [string]$Url,
        [string]$ZipName,
        [string]$ExeName,
        [string]$OutputName
    )

    Write-Host "Downloading $Name..." -ForegroundColor Yellow

    $zipPath = Join-Path $TempDir $ZipName
    $outputPath = Join-Path $OutputDir $OutputName

    # Download the archive
    Write-Host "  URL: $Url" -ForegroundColor Gray
    try {
        Invoke-WebRequest -Uri $Url -OutFile $zipPath -UseBasicParsing
    } catch {
        Write-Host "  Error downloading $Name`: $_" -ForegroundColor Red
        return $false
    }

    # Extract the binary
    Write-Host "  Extracting..." -ForegroundColor Gray
    $extractDir = Join-Path $TempDir "$Name-extract"
    if (Test-Path $extractDir) {
        Remove-Item $extractDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null

    if ($ZipName -match "\.zip$") {
        Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    } else {
        # For .tar.gz files, we need 7-zip or tar
        if (Get-Command "tar" -ErrorAction SilentlyContinue) {
            & tar -xzf $zipPath -C $extractDir
        } else {
            Write-Host "  Error: 'tar' command not found. Please install tar or use Windows 10+." -ForegroundColor Red
            return $false
        }
    }

    # Find and copy the executable
    $exeFile = Get-ChildItem -Path $extractDir -Recurse -Filter $ExeName | Select-Object -First 1
    if ($exeFile) {
        Copy-Item $exeFile.FullName -Destination $outputPath -Force
        $fileInfo = Get-Item $outputPath
        Write-Host "  Saved: $outputPath ($([math]::Round($fileInfo.Length / 1MB, 2)) MB)" -ForegroundColor Green
        return $true
    } else {
        Write-Host "  Error: Could not find $ExeName in archive" -ForegroundColor Red
        return $false
    }
}

# Download Restic
$resticUrl = "https://github.com/restic/restic/releases/download/v$ResticVersion/restic_${ResticVersion}_windows_amd64.zip"
$resticSuccess = Download-AndExtract `
    -Name "Restic" `
    -Url $resticUrl `
    -ZipName "restic.zip" `
    -ExeName "restic*.exe" `
    -OutputName "restic-$TauriSuffix.exe"

# Download Rclone
$rcloneUrl = "https://github.com/rclone/rclone/releases/download/v$RcloneVersion/rclone-v${RcloneVersion}-windows-amd64.zip"
$rcloneSuccess = Download-AndExtract `
    -Name "Rclone" `
    -Url $rcloneUrl `
    -ZipName "rclone.zip" `
    -ExeName "rclone.exe" `
    -OutputName "rclone-$TauriSuffix.exe"

# Download Shoutrrr (using nicholas-fedor fork which has newer releases)
$shoutrrrUrl = "https://github.com/nicholas-fedor/shoutrrr/releases/download/v$ShoutrrrVersion/shoutrrr_windows_amd64_${ShoutrrrVersion}.zip"
$shoutrrrSuccess = Download-AndExtract `
    -Name "Shoutrrr" `
    -Url $shoutrrrUrl `
    -ZipName "shoutrrr.zip" `
    -ExeName "shoutrrr.exe" `
    -OutputName "shoutrrr-$TauriSuffix.exe"

# Cleanup temp directory
Write-Host "Cleaning up..." -ForegroundColor Gray
Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue

# Summary
Write-Host "`nDownload Summary:" -ForegroundColor Cyan
Write-Host "  Restic:   $(if ($resticSuccess) { 'OK' } else { 'FAILED' })" -ForegroundColor $(if ($resticSuccess) { 'Green' } else { 'Red' })
Write-Host "  Rclone:   $(if ($rcloneSuccess) { 'OK' } else { 'FAILED' })" -ForegroundColor $(if ($rcloneSuccess) { 'Green' } else { 'Red' })
Write-Host "  Shoutrrr: $(if ($shoutrrrSuccess) { 'OK' } else { 'FAILED' })" -ForegroundColor $(if ($shoutrrrSuccess) { 'Green' } else { 'Red' })

# List all binaries in output directory
Write-Host "`nBinaries in $OutputDir`:" -ForegroundColor Cyan
Get-ChildItem $OutputDir -Filter "*.exe" | ForEach-Object {
    Write-Host "  $($_.Name) ($([math]::Round($_.Length / 1MB, 2)) MB)" -ForegroundColor Gray
}

if (-not ($resticSuccess -and $rcloneSuccess -and $shoutrrrSuccess)) {
    Write-Host "`nSome downloads failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`nDone!" -ForegroundColor Green
