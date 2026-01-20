#!/bin/bash

# Rebranding script: Zerobyte -> C3i Backup ONE
# This script replaces all occurrences of Zerobyte with the new brand name

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Show help message
show_help() {
    echo "Rebranding Script: Zerobyte -> C3i Backup ONE"
    echo ""
    echo "Usage: ./scripts/rebrand.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --dry-run    Preview changes without modifying any files"
    echo "  --help       Show this help message"
    echo ""
    echo "Replacements performed:"
    echo "  ┌─────────────┬─────────────────┬──────────────────────────────┐"
    echo "  │ Pattern     │ Replacement     │ Usage                        │"
    echo "  ├─────────────┼─────────────────┼──────────────────────────────┤"
    echo "  │ ZEROBYTE    │ C3I_BACKUP_ONE  │ Environment variables        │"
    echo "  │ Zerobyte    │ C3i Backup ONE  │ Display names                │"
    echo "  │ zerobyte    │ c3i-backup-one  │ Package names, Docker, URLs  │"
    echo "  └─────────────┴─────────────────┴──────────────────────────────┘"
    echo ""
    echo "Excluded paths:"
    echo "  - node_modules/"
    echo "  - .git/"
    echo "  - dist/"
    echo "  - Binary files (images, fonts, etc.)"
    echo ""
    echo "After running, you may need to:"
    echo "  - Run 'bun install' to regenerate the lockfile"
    echo "  - Manually rename files containing 'zerobyte' if desired"
    echo "  - Update external references (GitHub repo, Docker registry, etc.)"
    echo ""
    echo "Examples:"
    echo "  ./scripts/rebrand.sh --dry-run   # Preview changes"
    echo "  ./scripts/rebrand.sh             # Apply changes"
}

# Handle --help flag
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    show_help
    exit 0
fi

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}Rebranding Zerobyte to C3i Backup ONE${NC}"
echo "Project root: $PROJECT_ROOT"
echo ""

# Dry run mode
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
    echo ""
fi

# Function to perform replacements
do_replace() {
    local pattern="$1"
    local replacement="$2"
    local description="$3"

    echo -e "${GREEN}Replacing:${NC} $pattern -> $replacement ($description)"

    if [[ "$DRY_RUN" == "true" ]]; then
        # Just count matches
        count=$(grep -r --include="*" -l "$pattern" "$PROJECT_ROOT" 2>/dev/null | \
            grep -v "node_modules" | \
            grep -v ".git/" | \
            grep -v "dist/" | \
            grep -v "scripts/rebrand.sh" | \
            wc -l || echo "0")
        echo "  Would modify $count files"
    else
        # Perform actual replacement
        find "$PROJECT_ROOT" -type f \
            -not -path "*/node_modules/*" \
            -not -path "*/.git/*" \
            -not -path "*/dist/*" \
            -not -path "*/scripts/rebrand.sh" \
            -not -name "*.woff*" \
            -not -name "*.ttf" \
            -not -name "*.png" \
            -not -name "*.jpg" \
            -not -name "*.ico" \
            -not -name "*.webp" \
            -not -name "*.svg" \
            -print0 2>/dev/null | \
        while IFS= read -r -d '' file; do
            if file "$file" | grep -q "text\|JSON\|ASCII"; then
                if grep -q "$pattern" "$file" 2>/dev/null; then
                    sed -i "s/$pattern/$replacement/g" "$file"
                    echo "  Modified: ${file#$PROJECT_ROOT/}"
                fi
            fi
        done
    fi
    echo ""
}

# Perform replacements in order (most specific first to avoid double replacements)

# 1. ZEROBYTE (uppercase - typically for environment variables)
#    Using underscores since env vars typically use underscores
do_replace "ZEROBYTE" "C3I_BACKUP_ONE" "uppercase/env vars"

# 2. Zerobyte (title case - display name)
do_replace "Zerobyte" "C3i Backup ONE" "title case/display"

# 3. zerobyte (lowercase - identifiers, package names, URLs)
do_replace "zerobyte" "c3i-backup-one" "lowercase/identifiers"

echo -e "${GREEN}Done!${NC}"

if [[ "$DRY_RUN" == "true" ]]; then
    echo ""
    echo -e "${YELLOW}This was a dry run. Run without --dry-run to apply changes.${NC}"
else
    echo ""
    echo -e "${YELLOW}Note: You may need to manually update:${NC}"
    echo "  - File names containing 'zerobyte' (if desired)"
    echo "  - Binary artifacts and images"
    echo "  - External references (GitHub repo name, Docker Hub, etc.)"
    echo "  - Run 'bun install' to update lockfile"
fi
