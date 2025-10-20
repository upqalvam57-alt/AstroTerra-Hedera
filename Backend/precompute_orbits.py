import os
import json
import rebound
import spiceypy as sp
import numpy as np
from datetime import datetime, timezone

# --- Import the simulation logic we already built ---
# Make sure simulation.py is in the same directory
from simulation import calculate_orbit 

# --- Configuration ---
# List of interesting NEOs to pre-compute (SPK-ID and Name)
NEOS_TO_COMPUTE = [
    {"spkid": "2001862", "name": "1862 Apollo (Apollo Class)"},
    {"spkid": "2002062", "name": "2062 Aten (Aten Class)"},
    {"spkid": "2001221", "name": "1221 Amor (Amor Class)"},
    {"spkid": "2263693", "name": "163693 Atira (Atira Class)"},
    {"spkid": "2101955", "name": "101955 Bennu   )"},
]

KERNELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kernels")
META_KERNEL_PATH = os.path.join(KERNELS_DIR, "meta_kernel.txt")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "precomputed_orbits")

# --- Helper to create a CZML file from coordinates ---
def create_czml_packet(spkid, name, coordinates):
    # Flatten the coordinates into [time1, x1, y1, z1, time2, x2, y2, z2, ...]
    cartesian_values = []
    total_seconds = 365 * 24 * 3600  # Total duration of the orbit in seconds
    for i, coord in enumerate(coordinates):
        time_offset = (i / len(coordinates)) * total_seconds
        cartesian_values.extend([time_offset] + coord)

    # Get the current time as the epoch for the CZML path
    start_time = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    
    # Create the CZML structure
    czml = [
        {
            "id": "document",
            "name": f"Orbit of {name}",
            "version": "1.0",
        },
        {
            "id": spkid,
            "name": name,
            "availability": f"{start_time}/{datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + total_seconds, tz=timezone.utc).isoformat().replace('+00:00', 'Z')}",
            "position": {
                "epoch": start_time,
                "cartesian": cartesian_values,
                "interpolationAlgorithm": "LAGRANGE",
                "interpolationDegree": 5
            },
            "path": {
                "material": {
                    "solidColor": {
                        "color": { "rgba": [255, 170, 0, 255] }
                    }
                },
                "width": 2,
                "leadTime": 3600 * 6, # Show 6 hours of path ahead
                "trailTime": 3600 * 24 * 30, # Show 30 days of trail
            }
        }
    ]
    return czml

# --- Main Execution ---
if __name__ == "__main__":
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Created output directory: {OUTPUT_DIR}")

    print("--- Starting Pre-computation of NEO Orbits ---")
    
    for neo in NEOS_TO_COMPUTE:
        try:
            print(f"Calculating orbit for {neo['name']} ({neo['spkid']})...")
            # This calls the function from simulation.py
            coordinates = calculate_orbit(neo['spkid'], META_KERNEL_PATH)
            
            print("   ...formatting into CZML packet...")
            czml_data = create_czml_packet(neo['spkid'], neo['name'], coordinates)
            
            output_path = os.path.join(OUTPUT_DIR, f"{neo['spkid']}.czml")
            with open(output_path, 'w') as f:
                json.dump(czml_data, f)
            
            print(f"   >>> Successfully saved to {output_path}")
        except Exception as e:
            print(f"   !!! FAILED to compute for {neo['name']}: {e}")

    print("--- Pre-computation Complete! ---")