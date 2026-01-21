#!/bin/bash

# Rebranding script: Zerobyte -> C3i Backup ONE
# This script replaces only USER-VISIBLE strings (display text)
# It does NOT modify code identifiers, package names, or internal references

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
    echo "What this script changes:"
    echo "  - Documentation files (.md, .html): All visible text"
    echo "  - Code files (.ts, .tsx, .js): Only quoted strings (user-facing text)"
    echo ""
    echo "What this script does NOT change:"
    echo "  - Variable names, function names, identifiers"
    echo "  - Package names (package.json)"
    echo "  - Environment variable names"
    echo "  - Import statements"
    echo "  - Config files"
    echo ""
    echo "Excluded paths:"
    echo "  - node_modules/"
    echo "  - .git/"
    echo "  - dist/"
    echo "  - Binary files (images, fonts, etc.)"
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

# Files to skip (config files, package manifests, etc.)
SKIP_FILES=(
    "package.json"
    "package-lock.json"
    "bun.lock"
    "tsconfig.json"
    "drizzle.config.ts"
    "tauri.conf.json"
    "Cargo.toml"
    "Cargo.lock"
    ".env"
    ".env.example"
    "docker-compose.yml"
    "mutagen.yml"
)

should_skip_file() {
    local filename=$(basename "$1")
    for skip in "${SKIP_FILES[@]}"; do
        if [[ "$filename" == "$skip" ]]; then
            return 0
        fi
    done
    return 1
}

# Replace in documentation files (all occurrences)
replace_in_docs() {
    echo -e "${GREEN}[1/2] Replacing in documentation files...${NC}"

    find "$PROJECT_ROOT" -type f \
        \( -name "*.md" -o -name "*.html" -o -name "*.txt" \) \
        -not -path "*/node_modules/*" \
        -not -path "*/.git/*" \
        -not -path "*/dist/*" \
        -print0 2>/dev/null | \
    while IFS= read -r -d '' file; do
        if grep -q "Zerobyte\|zerobyte" "$file" 2>/dev/null; then
            if [[ "$DRY_RUN" == "true" ]]; then
                echo "  Would modify: ${file#$PROJECT_ROOT/}"
            else
                # Replace display name (Zerobyte -> C3i Backup ONE)
                sed -i "s/Zerobyte/C3i Backup ONE/g" "$file"
                echo "  Modified: ${file#$PROJECT_ROOT/}"
            fi
        fi
    done
    echo ""
}

# Replace only in quoted strings within code files
replace_in_code_strings() {
    echo -e "${GREEN}[2/2] Replacing in code string literals...${NC}"

    find "$PROJECT_ROOT" -type f \
        \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
        -not -path "*/node_modules/*" \
        -not -path "*/.git/*" \
        -not -path "*/dist/*" \
        -not -path "*/scripts/rebrand.sh" \
        -print0 2>/dev/null | \
    while IFS= read -r -d '' file; do
        if should_skip_file "$file"; then
            continue
        fi

        # Check if file contains Zerobyte in a string literal
        if grep -qE "['\"\`].*Zerobyte.*['\"\`]" "$file" 2>/dev/null; then
            if [[ "$DRY_RUN" == "true" ]]; then
                echo "  Would modify: ${file#$PROJECT_ROOT/}"
                # Show which lines would be changed
                grep -n -E "['\"\`].*Zerobyte.*['\"\`]" "$file" 2>/dev/null | head -5 | sed 's/^/    /'
            else
                # Replace Zerobyte only within quoted strings
                # Match strings containing Zerobyte and replace just the brand name
                # Using perl for better regex support with lookahead/lookbehind
                perl -i -pe '
                    # Replace in double-quoted strings
                    s/(".*?)Zerobyte(.*?")/$1C3i Backup ONE$2/g;
                    # Replace in single-quoted strings
                    s/('"'"'.*?)Zerobyte(.*?'"'"')/$1C3i Backup ONE$2/g;
                    # Replace in template literals
                    s/(`.*?)Zerobyte(.*?`)/$1C3i Backup ONE$2/g;
                ' "$file"
                echo "  Modified: ${file#$PROJECT_ROOT/}"
            fi
        fi
    done
    echo ""
}

# Run the replacements
replace_in_docs
replace_in_code_strings

echo -e "${GREEN}Done!${NC}"

if [[ "$DRY_RUN" == "true" ]]; then
    echo ""
    echo -e "${YELLOW}This was a dry run. Run without --dry-run to apply changes.${NC}"
else
    echo ""
    echo -e "${YELLOW}Note:${NC}"
    echo "  Code identifiers, package names, and config files were NOT modified."
    echo "  Only user-visible strings have been updated."
fi
