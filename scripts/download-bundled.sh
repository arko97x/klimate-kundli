#!/usr/bin/env bash
# Download the 3 bundled CSVs into ./data/
# - NOAA Mauna Loa annual mean CO2
# - Our World in Data CO2 dataset (full file; we slice on load)
# - NASA / Sea Level Change global mean sea level (altimetry, 1993+)
#
# Run: bash scripts/download-bundled.sh

set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p data
cd data

echo "→ NOAA Mauna Loa CO2 (annual mean)"
curl -fL -o co2_annmean_mlo.csv \
  "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv"

echo "→ OWID CO2 dataset"
curl -fL -o owid-co2-data.csv \
  "https://github.com/owid/co2-data/raw/master/owid-co2-data.csv"

echo "→ EPA / CSIRO global sea level (1880-present, annual)"
# datasets/sea-level-rise mirror of EPA's compilation: CSIRO reconstruction
# back to 1880 + NOAA altimetry post-1993, in inches. The bundled loader
# converts to mm.
curl -fL -o sea_level.csv \
  "https://raw.githubusercontent.com/datasets/sea-level-rise/main/data/epa-sea-level.csv"

echo
echo "Files in data/:"
ls -lh *.csv
