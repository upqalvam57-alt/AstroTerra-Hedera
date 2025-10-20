# precompute_planets.py

import spiceypy as spice
import numpy as np
import json
from datetime import datetime, timedelta

import os

def precompute_planet_orbits():
    print("--- Starting Planetary Orbit Pre-computation ---")

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

    # 3. Define Planets and their properties
    # NAIF IDs: Sun=10, Mercury=1, Venus=2, Mars=4, Jupiter=5, Saturn=6, Uranus=7, Neptune=8, Pluto=9
    # Earth's NAIF ID is 399, but we skip it as requested.
    planets = {
        "Mercury":   {"id": "1", "color": [180, 150, 100, 255], "pixelSize": 8},
        "Venus":     {"id": "2", "color": [220, 180, 100, 255], "pixelSize": 12},
        "Mars":      {"id": "4", "color": [255, 100, 50, 255], "pixelSize": 10},
        "Jupiter":   {"id": "5", "color": [200, 150, 100, 255], "pixelSize": 18},
        "Saturn":    {"id": "6", "color": [220, 200, 150, 255], "pixelSize": 16},
        "Uranus":    {"id": "7", "color": [180, 220, 220, 255], "pixelSize": 14},
        "Neptune":   {"id": "8", "color": [100, 150, 255, 255], "pixelSize": 14},
        "Pluto":     {"id": "9", "color": [200, 180, 170, 255], "pixelSize": 6}
    }
    
    # Use Solar System Barycenter as the reference point, as it's more stable than the Sun's center
    # and is what the asteroid data is relative to.
    REFERENCE_FRAME = 'J2000'
    OBSERVER = '0' # 0 is the ID for Solar System Barycenter (SSB)

    # 4. Generate CZML Packets
    czml_packets = []
    
    # Document packet
    iso_start = start_time.strftime('%Y-%m-%dT%H:%M:%S') + "Z"
    iso_end = end_time.strftime('%Y-%m-%dT%H:%M:%S') + "Z"
    czml_packets.append({
        "id": "document",
        "name": "PlanetOrbits",
        "version": "1.0",
        "clock": {
            "interval": f"{iso_start}/{iso_end}",
            "currentTime": iso_start,
            "multiplier": 3600,
        }
    })

    # Generate packets for each planet
    for name, data in planets.items():
        print(f"Processing {name}...")
        
        times_et = np.arange(start_et, end_et, time_step_seconds)
        # This list will now hold [time_offset_seconds, x, y, z, ...]
        cartesian_positions = [] 

        for et in times_et:
            # Get state (position and velocity) from SPICE
            position, _ = spice.spkpos(data["id"], et, REFERENCE_FRAME, 'NONE', OBSERVER)
            position_meters = [p * 1000 for p in position]
            
            # --- FIX STARTS HERE ---
            #
            # Calculate the time offset in seconds from the start time (epoch).
            # This replaces the incorrect time_str calculation.
            time_offset = et - start_et 
            
            cartesian_positions.append(time_offset) # Append the numeric offset
            #
            # --- FIX ENDS HERE ---

            cartesian_positions.extend(position_meters)

        packet = {
            "id": f"planet_{name}",
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
                "cartesian": cartesian_positions, # This array is now correctly formatted
                "interpolationAlgorithm": "LAGRANGE",
                "interpolationDegree": 5,
                "referenceFrame": "INERTIAL"
            },
            "properties": {
                "entity_type": "planet"
            }
        }
        czml_packets.append(packet)

    # 5. Save to file
    output_path = "static/planets.czml"
    with open(output_path, 'w') as f:
        json.dump(czml_packets, f, indent=2)
    
    print(f"--- Pre-computation complete. Data saved to {output_path} ---")

    # Unload kernels
    spice.kclear()

if __name__ == "__main__":
    precompute_planet_orbits()