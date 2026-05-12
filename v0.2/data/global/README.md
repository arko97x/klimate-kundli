# Global indices — phase 4.5

Static-ish datasets that power kundli cells 8 (country emissions), 10 (sea
level), 11 (Mauna Loa CO₂ ppm), and 12 (2050 projection).

| File | Cell | Source | Notes |
|---|---|---|---|
| `co2_annmean_mlo.csv`         | 11 | NOAA GML, Keeling et al. (Scripps/NOAA), Mauna Loa annual mean | Mirrored from `gml.noaa.gov/ccgg/trends/co2`. Annual values 1959-present. |
| `gmsl_annual.csv`             | 10 | Church & White (CSIRO) 1880–1992 + NASA/CNES satellite altimetry 1993-present | Annual mean sea level in mm, anchored at 1880 ≈ 0. |
| `country_co2.csv` *(fetched)* |  8 | Our World in Data CO₂ dataset (Global Carbon Budget) | Loader downloads & slims to pilot country set. Cached on first run. |
| `country_projection_2050.csv` | 12 | IPCC AR6 WG1 Interactive Atlas, regional SSP scenarios | Per-country ΔT (°C) and Δprecip (%) at 2041–2060 vs 1995–2014 baseline. |

The loader (`klimate-ingest load-global`) writes one row per dataset into
`source_provenance` so every cell value can be traced back to its CSV +
sha256.

These values are **approximations** assembled for an exhibition piece, not
for research. Replace with native authoritative pulls when those become
practical (NASA Earthdata for satellite altimetry, IPCC Atlas API when it
stabilises, etc.).
