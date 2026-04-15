#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/../dist/tracer.html"
mkdir -p "$SCRIPT_DIR/../dist"

inline_css() {
    local file="$SCRIPT_DIR/../$1"
    printf '<style>\n'
    perl -0777 -pe 's{/\*.*?\*/}{}gs' "$file" | sed 's/^[[:space:]]*//' | grep -v '^$' | grep -v '^//'
    printf '\n</style>\n'
}

inline_js() {
    local file="$SCRIPT_DIR/../$1"
    printf '<script>\n'
    perl -0777 -pe 's{/\*.*?\*/}{}gs' "$file" | sed 's/^[[:space:]]*//' | grep -v '^$' | grep -v '^//'
    printf '\n</script>\n'
}

inline_favicon() {
    local file="$SCRIPT_DIR/../$1"
    local b64
    b64=$(base64 -w 0 "$file")
    printf '<link rel="icon" type="image/png" href="data:image/png;base64,%s">\n' "$b64"
}

> "$OUTPUT"

while IFS= read -r line; do
    if [[ "$line" =~ \<link[[:space:]].*rel=\"stylesheet\".*href=\"([^\"]+)\" ]]; then
        inline_css "${BASH_REMATCH[1]}" >> "$OUTPUT"
    elif [[ "$line" =~ \<link[[:space:]].*rel=\"icon\".*href=\"([^\"]+)\" ]]; then
        inline_favicon "${BASH_REMATCH[1]}" >> "$OUTPUT"
    elif [[ "$line" =~ \<script[[:space:]].*src=\"([^\"]+)\" ]]; then
        inline_js "${BASH_REMATCH[1]}" >> "$OUTPUT"
    else
        printf '%s\n' "${line#"${line%%[! ]*}"}" >> "$OUTPUT"
    fi
done < "$SCRIPT_DIR/../index.html"

echo "Built: $OUTPUT"
