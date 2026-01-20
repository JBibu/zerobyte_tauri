#!/bin/bash
# Build Zerobyte Server for Linux
# This script compiles the Bun server into a standalone Linux executable

set -e

OUTPUT_DIR="${1:-src-tauri/binaries}"
DEBUG="${DEBUG:-false}"

echo "Building Zerobyte Server for Linux..."

# Ensure the output directory exists
mkdir -p "$OUTPUT_DIR"

# First, build the TypeScript project
echo "Building TypeScript project..."
bun run build

# Compile the server to a standalone executable
echo "Compiling server to standalone executable..."

TARGET="bun-linux-x64"
ENTRY_POINT="./dist/server/index.js"
OUTPUT_FILE="$OUTPUT_DIR/zerobyte-server-x86_64-unknown-linux-gnu"

BUN_ARGS=(
    "build"
    "--compile"
    "--target=$TARGET"
    "$ENTRY_POINT"
    "--outfile=$OUTPUT_FILE"
)

if [ "$DEBUG" != "true" ]; then
    BUN_ARGS+=("--minify")
fi

echo "Running: bun ${BUN_ARGS[*]}"
bun "${BUN_ARGS[@]}"

# Copy migrations for bundling
echo "Copying migrations..."
mkdir -p "$OUTPUT_DIR/assets/migrations"
cp -r app/drizzle/* "$OUTPUT_DIR/assets/migrations/"

# Copy client assets for SSR hydration
echo "Copying client assets..."
mkdir -p "$OUTPUT_DIR/dist"
cp -r dist/client "$OUTPUT_DIR/dist/"

# Verify the output file exists
if [ -f "$OUTPUT_FILE" ]; then
    SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "Server compiled successfully!"
    echo "Output: $OUTPUT_FILE"
    echo "Size: $SIZE"
else
    echo "Error: Output file not found at $OUTPUT_FILE"
    exit 1
fi

echo "Done!"
