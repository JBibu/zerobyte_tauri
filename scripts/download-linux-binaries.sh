#!/bin/bash
# Download Linux binaries for Zerobyte
# Downloads restic, rclone, and shoutrrr for bundling with Tauri

set -e

OUTPUT_DIR="${1:-src-tauri/binaries}"
RESTIC_VERSION="${RESTIC_VERSION:-0.18.1}"
RCLONE_VERSION="${RCLONE_VERSION:-1.72.1}"
SHOUTRRR_VERSION="${SHOUTRRR_VERSION:-0.13.1}"

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)
        RESTIC_ARCH="amd64"
        RCLONE_ARCH="amd64"
        SHOUTRRR_ARCH="amd64"
        TAURI_SUFFIX="x86_64-unknown-linux-gnu"
        ;;
    aarch64)
        RESTIC_ARCH="arm64"
        RCLONE_ARCH="arm64"
        SHOUTRRR_ARCH="arm64v8"
        TAURI_SUFFIX="aarch64-unknown-linux-gnu"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

echo "Downloading Linux binaries for Zerobyte..."
echo "  Architecture: $ARCH ($TAURI_SUFFIX)"
echo "  Output: $OUTPUT_DIR"
echo ""

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Temporary directory for downloads
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

download_restic() {
    echo "Downloading Restic v$RESTIC_VERSION..."
    local url="https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_${RESTIC_ARCH}.bz2"
    local output="$OUTPUT_DIR/restic-$TAURI_SUFFIX"

    echo "  URL: $url"
    curl -sSL "$url" | bunzip2 > "$output"
    chmod +x "$output"

    local size=$(du -h "$output" | cut -f1)
    echo "  Saved: $output ($size)"
}

download_rclone() {
    echo "Downloading Rclone v$RCLONE_VERSION..."
    local url="https://github.com/rclone/rclone/releases/download/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-${RCLONE_ARCH}.zip"
    local output="$OUTPUT_DIR/rclone-$TAURI_SUFFIX"
    local zip_file="$TEMP_DIR/rclone.zip"

    echo "  URL: $url"
    curl -sSL "$url" -o "$zip_file"
    unzip -q "$zip_file" -d "$TEMP_DIR"

    # Find and copy the binary
    find "$TEMP_DIR" -name "rclone" -type f -executable | head -1 | xargs -I{} cp {} "$output"
    chmod +x "$output"

    local size=$(du -h "$output" | cut -f1)
    echo "  Saved: $output ($size)"
}

download_shoutrrr() {
    echo "Downloading Shoutrrr v$SHOUTRRR_VERSION..."
    # Using nicholas-fedor fork which has newer releases
    local url="https://github.com/nicholas-fedor/shoutrrr/releases/download/v${SHOUTRRR_VERSION}/shoutrrr_linux_${SHOUTRRR_ARCH}_${SHOUTRRR_VERSION}.tar.gz"
    local output="$OUTPUT_DIR/shoutrrr-$TAURI_SUFFIX"
    local tar_file="$TEMP_DIR/shoutrrr.tar.gz"

    echo "  URL: $url"
    curl -sSL "$url" -o "$tar_file"
    tar -xzf "$tar_file" -C "$TEMP_DIR"

    # Find and copy the binary
    find "$TEMP_DIR" -name "shoutrrr" -type f | head -1 | xargs -I{} cp {} "$output"
    chmod +x "$output"

    local size=$(du -h "$output" | cut -f1)
    echo "  Saved: $output ($size)"
}

# Download all binaries
download_restic
echo ""
download_rclone
echo ""
download_shoutrrr
echo ""

# Summary
echo "Download complete!"
echo ""
echo "Binaries in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR"/*-linux-gnu 2>/dev/null || ls -lh "$OUTPUT_DIR"/*-$TAURI_SUFFIX 2>/dev/null || echo "  (none found)"
