# Build Zerobyte Server for Windows
# This script compiles the Bun server into a standalone Windows executable

param(
    [string]$OutputDir = "src-tauri/binaries",
    [switch]$Debug
)

$ErrorActionPreference = "Stop"

Write-Host "Building Zerobyte Server for Windows..." -ForegroundColor Cyan

# Ensure the output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# First, build the TypeScript project
Write-Host "Building TypeScript project..." -ForegroundColor Yellow
bun run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript build failed!" -ForegroundColor Red
    exit 1
}

# Compile the server to a standalone executable
Write-Host "Compiling server to standalone executable..." -ForegroundColor Yellow

$target = "bun-windows-x64"
$entryPoint = "./dist/server/index.js"
$outputFile = Join-Path $OutputDir "zerobyte-server-x86_64-pc-windows-msvc.exe"

$bunArgs = @(
    "build",
    "--compile",
    "--target=$target",
    $entryPoint,
    "--outfile=$outputFile"
)

if (-not $Debug) {
    $bunArgs += "--minify"
}

Write-Host "Running: bun $($bunArgs -join ' ')" -ForegroundColor Gray
& bun $bunArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "Server compilation failed!" -ForegroundColor Red
    exit 1
}

# Verify the output file exists
if (Test-Path $outputFile) {
    $fileInfo = Get-Item $outputFile
    Write-Host "Server compiled successfully!" -ForegroundColor Green
    Write-Host "Output: $outputFile" -ForegroundColor Gray
    Write-Host "Size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" -ForegroundColor Gray
} else {
    Write-Host "Error: Output file not found at $outputFile" -ForegroundColor Red
    exit 1
}

# Copy migrations for bundling
Write-Host "Copying migrations..." -ForegroundColor Yellow
$migrationsDir = Join-Path $OutputDir "assets\migrations"
if (-not (Test-Path $migrationsDir)) {
    New-Item -ItemType Directory -Path $migrationsDir -Force | Out-Null
}
Copy-Item -Path "app\drizzle\*" -Destination $migrationsDir -Recurse -Force
Write-Host "Migrations copied to: $migrationsDir" -ForegroundColor Green

# Copy client assets for SSR hydration
Write-Host "Copying client assets..." -ForegroundColor Yellow
$distDir = Join-Path $OutputDir "dist"
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}
Copy-Item -Path "dist\client" -Destination $distDir -Recurse -Force
Write-Host "Client assets copied to: $(Join-Path $distDir 'client')" -ForegroundColor Green

# Build the Windows Service binary
Write-Host "Building Windows Service binary..." -ForegroundColor Yellow
$TauriSuffix = "x86_64-pc-windows-msvc"
$serviceOutputFile = Join-Path (Resolve-Path $OutputDir) "zerobyte-service-$TauriSuffix.exe"

Push-Location "src-tauri"
try {
    # Build only the service binary in release mode
    & cargo build --release --bin zerobyte-service --target $TauriSuffix

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Service binary compilation failed!" -ForegroundColor Red
        exit 1
    }

    # Copy the built binary to the binaries directory with the Tauri naming convention
    $builtService = "target\$TauriSuffix\release\zerobyte-service.exe"
    if (Test-Path $builtService) {
        Copy-Item $builtService -Destination $serviceOutputFile -Force
        $fileInfo = Get-Item $serviceOutputFile
        Write-Host "Service binary compiled successfully!" -ForegroundColor Green
        Write-Host "Output: $serviceOutputFile" -ForegroundColor Gray
        Write-Host "Size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" -ForegroundColor Gray
    } else {
        Write-Host "Warning: Service binary not found at $builtService" -ForegroundColor Yellow
        Write-Host "Note: You may need to install the Windows MSVC target: rustup target add $TauriSuffix" -ForegroundColor Yellow
    }
} finally {
    Pop-Location
}

Write-Host "Done!" -ForegroundColor Green
