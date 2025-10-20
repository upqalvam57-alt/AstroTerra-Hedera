# precompute_moon.py

import spiceypy as spice
import numpy as np
import json
from datetime import datetime, timedelta

import os

def precompute_moon_orbit():
    print("--- Starting Moon Orbit Pre-computation ---")

    # 1. Load SPICE Kernels
    try:
        PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
        KERNELS_DIR = os.path.join(PROJECT_ROOT, "kernels")
        spice.furnsh(os.path.join(KERNELS_DIR, 'de440.bsp'))
        spice.furnsh(os.path.join(KERNELS_DIR, 'naif0012.tls'))
        print("Kernels loaded successfully.")
    except Exception as e:
        print(f"Error loading kernels: {e}")
        return

    # 2. Define Time Range (e.g., one year from today)
    start_time = datetime.utcnow()
    end_time = start_time + timedelta(days=365)
    time_step_seconds = 3600  # One data point per hour

    # Convert Python datetimes to SPICE Ephemeris Time (ET)
    start_et = spice.str2et(start_time.strftime('%Y-%m-%dT%H:%M:%S'))
    end_et = spice.str2et(end_time.strftime('%Y-%m-%dT%H:%M:%S'))

    # 3. Define Moon properties
    moon = {
        "Moon": {"id": "301", "color": [200, 200, 200, 255], "pixelSize": 10}
    }
    
    REFERENCE_FRAME = 'J2000'
    OBSERVER = '0' # Solar System Barycenter

    # 4. Generate CZML Packets
    czml_packets = []
    
    # Document packet
    iso_start = start_time.strftime('%Y-%m-%dT%H:%M:%S') + "Z"
    iso_end = end_time.strftime('%Y-%m-%dT%H:%M:%S') + "Z"
    czml_packets.append({
        "id": "document",
        "name": "MoonOrbit",
        "version": "1.0",
        "clock": {
            "interval": f"{iso_start}/{iso_end}",
            "currentTime": iso_start,
            "multiplier": 3600,
        }
    })

    # Generate packet for the Moon
    for name, data in moon.items():
        print(f"Processing {name}...")
        
        times_et = np.arange(start_et, end_et, time_step_seconds)
        cartesian_positions = [] 

        for et in times_et:
            position, _ = spice.spkpos(data["id"], et, REFERENCE_FRAME, 'NONE', OBSERVER)
            position_meters = [p * 1000 for p in position]
            
            time_offset = et - start_et 
            
            cartesian_positions.append(time_offset)
            cartesian_positions.extend(position_meters)

        packet = {
            "id": f"moon_{name}",
            "name": name,
            "label": {
                "text": name,
                "fillColor": {"rgba": [255, 255, 255, 255]},
                "font": "12pt Segoe UI",
                "horizontalOrigin": "LEFT",
                "pixelOffset": {"cartesian2": [15, 0]},
                "show": True
            },
            "point": {
                "color": {"rgba": data["color"]},
                "pixelSize": data["pixelSize"],
                "outlineWidth": 1,
                "outlineColor": {"rgba": [255, 255, 255, 100]}
            },
            "position": {
                "epoch": iso_start,
                "cartesian": cartesian_positions,
                "interpolationAlgorithm": "LAGRANGE",
                "interpolationDegree": 5,
                "referenceFrame": "INERTIAL"
            },
            "path": {
                "material": {
                    "solidColor": {
                        "color": {
                            "rgba": [255, 255, 255, 100]
                        }
                    }
                },
                "width": 1,
                "resolution": 120
            },
            "properties": {
                "entity_type": "moon"
            }
        }
        czml_packets.append(packet)

    # 5. Save to file
    PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(PROJECT_ROOT, "static", "moon.czml")
    with open(output_path, 'w') as f:
        json.dump(czml_packets, f, indent=2)
    
    print(f"--- Pre-computation complete. Data saved to {output_path} ---")

    # Unload kernels
    spice.kclear()

if __name__ == "__main__":
    precompute_moon_orbit()