#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_DIR="$ROOT_DIR/docs"
HTML_FILE="$DOCS_DIR/DOCUMENTACAO_DO_SOFTWARE.html"
PDF_TMP="/root/chaveiro-ifbaps-documentacao-$(date +%s%N).pdf"
PDF_FILE="$DOCS_DIR/DOCUMENTACAO_DO_SOFTWARE.pdf"

command -v pandoc >/dev/null || {
  echo "pandoc nao encontrado" >&2
  exit 1
}

chromium_bin="$(command -v chromium-browser || command -v chromium || true)"
if [[ -z "$chromium_bin" ]]; then
  echo "Chromium nao encontrado" >&2
  exit 1
fi

trap 'rm -f "$PDF_TMP"' EXIT

pandoc \
  --from=gfm \
  --standalone \
  --metadata lang=pt-BR \
  --metadata title="Chaveiro IFBAPS - Documentacao do software" \
  --include-before-body="$DOCS_DIR/documentacao-software-print-prefix.html" \
  --css=documentacao-software.css \
  --resource-path="$DOCS_DIR:$ROOT_DIR/frontend/public" \
  -o "$HTML_FILE" \
  "$DOCS_DIR/DOCUMENTACAO_DO_SOFTWARE.md"

"$chromium_bin" \
  --headless \
  --no-sandbox \
  --disable-gpu \
  --user-data-dir="/root/chaveiro-ifbaps-documentacao-profile" \
  --print-to-pdf="$PDF_TMP" \
  --print-to-pdf-no-header \
  "http://127.0.0.1:8765/docs/DOCUMENTACAO_DO_SOFTWARE.html" \
  >/tmp/chaveiro-ifbaps-documentacao-chromium.log 2>&1

cp "$PDF_TMP" "$PDF_FILE"
pdfinfo "$PDF_FILE" | grep -E 'Pages|Page size|File size'
echo "Gerado: $PDF_FILE"
