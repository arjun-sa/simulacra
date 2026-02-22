#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -x "$ROOT/prometheus-3.9.1.darwin-arm64/prometheus" ]]; then
  PROM_DIR="$ROOT/prometheus-3.9.1.darwin-arm64"
elif [[ -x "$ROOT/prometheus-3.9.1.darwin-amd64/prometheus" ]]; then
  PROM_DIR="$ROOT/prometheus-3.9.1.darwin-amd64"
else
  echo "No Prometheus binary found in project root."
  echo "Expected one of:"
  echo "  prometheus-3.9.1.darwin-arm64/prometheus"
  echo "  prometheus-3.9.1.darwin-amd64/prometheus"
  exit 1
fi

if [[ "$(uname -m)" == "arm64" && "$PROM_DIR" == *"amd64"* ]]; then
  cat <<MSG
Detected arm64 macOS with amd64 Prometheus binary.
This may fail without Rosetta 2.
Install Rosetta:
  softwareupdate --install-rosetta --agree-to-license
Or use Docker Prometheus image instead.
MSG
fi

exec "$PROM_DIR/prometheus" \
  --config.file="$PROM_DIR/prometheus.yml" \
  --storage.tsdb.path="$ROOT/.prometheus-data" \
  --web.listen-address=0.0.0.0:9090
