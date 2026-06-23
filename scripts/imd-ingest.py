#!/usr/bin/env python3
import os
import sys
import json
import sqlite3
import tempfile
from datetime import datetime

# Define standard paths relative to repository root
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATION_MAP_PATH = os.path.join(REPO_ROOT, "src", "data", "imd_station_map.json")
DB_PATH = os.path.join(REPO_ROOT, "data", "cache.sqlite")

def check_dependencies():
    missing = []
    for pkg in ["imdlib", "xarray", "pandas", "netCDF4"]:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"Error: Missing Python dependencies: {', '.join(missing)}")
        print(f"Please install them by running:\n  pip install {' '.join(missing)}")
        sys.exit(1)

def load_stations():
    if not os.path.exists(STATION_MAP_PATH):
        print(f"Error: Station map file not found at {STATION_MAP_PATH}")
        print("Please run 'npm run imd:build-station-map' first to generate it.")
        sys.exit(1)
    
    with open(STATION_MAP_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("stations", [])

def main():
    check_dependencies()
    import imdlib as imd
    import xarray as xr
    import pandas as pd
    import numpy as np

    print("=== IMD Historical Ingestion Script ===")
    
    # 1. Ask for year range
    default_start = 1951
    default_end = datetime.now().year - 1
    
    try:
        start_year = input(f"Enter start year (default {default_start}): ").strip()
        start_year = int(start_year) if start_year else default_start
        
        end_year = input(f"Enter end year (default {default_end}): ").strip()
        end_year = int(end_year) if end_year else default_end
    except ValueError:
        print("Invalid year input. Using defaults.")
        start_year = default_start
        end_year = default_end

    if start_year < 1951:
        print("Warning: IMD gridded daily temperature data starts in 1951. Adjusting start year to 1951.")
        start_year = 1951
        
    print(f"\nIngesting data from {start_year} to {end_year}...")

    # 2. Check SQLite database
    if not os.path.exists(DB_PATH):
        print(f"SQLite database not found at {DB_PATH}.")
        print("Creating a new cache database...")
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    # Connect to SQLite
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Ensure cache table exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            expires_at INTEGER,
            written_at INTEGER NOT NULL
        );
    """)
    conn.commit()

    # 3. Load stations
    stations = load_stations()
    if not stations:
        print("No stations found in the mapping file.")
        sys.exit(1)
    print(f"Loaded {len(stations)} weather stations to map.")

    # 4. Download gridded data using imdlib
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"\nDownloading gridded maximum temperature (tmax) datasets to temporary directory...")
        try:
            # imdlib downloads files into subdirectories under the target directory
            imd.get_data('tmax', start_year, end_year, fn_format='yearwise', file_dir=temp_dir)
            print("Download completed successfully! Loading dataset into memory...")
            
            # Open dataset using imdlib
            data = imd.open_data('tmax', start_year, end_year, 'yearwise', file_dir=temp_dir)
            ds = data.get_xarray()
        except Exception as e:
            print(f"Failed to download/load data: {e}")
            sys.exit(1)

        # 5. Extract values for each station
        print("\nProcessing annual peaks for each station...")
        written_count = 0
        now_unix = int(datetime.now().timestamp())
        
        # We find the coordinate variables
        lat_var = 'lat' if 'lat' in ds.coords else ('latitude' if 'latitude' in ds.coords else None)
        lon_var = 'lon' if 'lon' in ds.coords else ('longitude' if 'longitude' in ds.coords else None)
        
        if not lat_var or not lon_var:
            print("Error: Could not determine latitude/longitude coordinate dimensions in dataset.")
            sys.exit(1)

        # Get variable name in dataset (usually 'tmax')
        var_name = 'tmax' if 'tmax' in ds.data_vars else list(ds.data_vars.keys())[0]

        # For performance, we can extract pandas dataframes
        for idx, station in enumerate(stations):
            s_id = station["id"]
            s_name = station["name"]
            s_lat = station["lat"]
            s_lon = station["lon"]
            
            # Select closest grid cell
            try:
                station_slice = ds.sel({lat_var: s_lat, lon_var: s_lon}, method='nearest')
                df = station_slice.to_dataframe()
                df = df.reset_index()
                
                # Check for empty series
                if df.empty or var_name not in df.columns:
                    continue
                    
                df = df.dropna(subset=[var_name])
                if df.empty:
                    continue
                
                df['year'] = df['time'].dt.year
                
                # Group by year and find peak tmax for each year
                max_indices = df.groupby('year')[var_name].idxmax()
                peaks = df.loc[max_indices]
                
                for _, row in peaks.iterrows():
                    year = int(row['year'])
                    peak_val = float(row[var_name])
                    # Skip garbage values
                    if peak_val < -50 or peak_val > 60:
                        continue
                        
                    peak_date = row['time'].strftime('%Y-%m-%d')
                    
                    # Store in format required by imdService: imd:peak:v1:{stationId}:{year}
                    cache_key = f"imd:peak:v1:{s_id}:{year}"
                    cache_val = json.dumps({
                        "peakTempC": round(peak_val, 1),
                        "peakDate": peak_date
                    })
                    
                    cursor.execute(
                        "INSERT OR REPLACE INTO cache (key, value, expires_at, written_at) VALUES (?, ?, NULL, ?)",
                        (cache_key, cache_val, now_unix)
                    )
                    written_count += 1
                    
            except Exception as e:
                # Some stations might lie outside India grid boundary; skip them silently
                continue
                
            if (idx + 1) % 100 == 0 or (idx + 1) == len(stations):
                print(f"  Processed {idx + 1}/{len(stations)} stations...")

    conn.commit()
    conn.close()
    
    print(f"\nSuccess! Successfully wrote {written_count} annual peak records to {DB_PATH}")
    print("You can now upload the cache.sqlite file to your droplet server.")

if __name__ == "__main__":
    main()
