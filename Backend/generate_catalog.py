import requests
import json
import os
import math
import time
import spiceypy as sp
from datetime import datetime, timezone

# --- Constants and Setup ---
# Ensure paths are correct relative to this script's location
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
KERNELS_DIR = os.path.join(PROJECT_ROOT, "kernels")
STATIC_DIR = os.path.join(PROJECT_ROOT, "static")
META_KERNEL = os.path.join(KERNELS_DIR, "meta_kernel.txt")
AU_TO_KM = 149597870.7

# --- Helper Functions (Copied from app.py) ---
def load_spice_kernels():
    sp.kclear()
    sp.furnsh(os.path.join(KERNELS_DIR, "naif0012.tls"))
    sp.furnsh(META_KERNEL)

def get_asteroid_classification(h_mag, is_pha):
    if h_mag is not None:
        if h_mag < 18.0: return "PLANET_KILLER"
        if h_mag < 22.0: return "CITY_KILLER"
    if is_pha: return "PHA"
    return "REGULAR"

def get_geocentric_cartesian(elements_dict, et_now):
    GM_SUN_KM3_S2 = 1.32712440018e11
    a_km = elements_dict['a'] * AU_TO_KM
    elts = [
        a_km * (1.0 - elements_dict['e']), elements_dict['e'],
        math.radians(elements_dict['i']), math.radians(elements_dict['om']),
        math.radians(elements_dict['w']), math.radians(elements_dict['ma']),
        sp.utc2et(f"JD {elements_dict['epoch']}"), GM_SUN_KM3_S2
    ]
    ast_state_wrt_sun = sp.conics(elts, et_now)
    earth_state_wrt_sun, _ = sp.spkgeo(targ=399, et=et_now, ref='J2000', obs=10)
    geocentric_pos_km = [ast_state_wrt_sun[i] - earth_state_wrt_sun[i] for i in range(3)]
    return [pos * 1000 for pos in geocentric_pos_km]

# --- Main Generation Logic ---
def generate_czml_file():
    print("--- Starting CZML catalog generation... ---")
    load_spice_kernels()

    try:
        limit = 200
        url = "https://ssd-api.jpl.nasa.gov/sbdb_query.api"
        params = {"limit": limit, "fields": "spkid,full_name,e,a,i,om,w,ma,epoch,H,pha", "sb-class": "APO"}
        print("Fetching catalog data from JPL API...")
        start_time = time.time()
        response = requests.get(url, params=params, timeout=10) # 10-second timeout
        response.raise_for_status()
        end_time = time.time()
        print(f"JPL API request took {end_time - start_time:.2f} seconds.")
        catalog = response.json()

        et_now = sp.utc2et(datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'))
        all_czml = [{"id": "document", "version": "1.0"}]

        for item in catalog.get("data", []):
            try:
                spkid, fullname, e, a, i, om, w, ma, epoch, h, pha = item
                elements_dict = {'e': float(e), 'a': float(a), 'i': float(i), 'om': float(om), 'w': float(w), 'ma': float(ma), 'epoch': float(epoch)}
                pos_m = get_geocentric_cartesian(elements_dict, et_now)
                is_pha = pha == 'Y'
                h_mag = float(h) if h is not None else None
                classification = get_asteroid_classification(h_mag, is_pha)

                packet = {
                    "id": f"asteroid_{spkid}", "name": fullname,
                    "position": {"cartesian": pos_m, "referenceFrame": "INERTIAL"},
                    "properties": {"isPHA": is_pha, "classification": classification}
                }
                all_czml.append(packet)
            except Exception as e:
                print(f"Error processing asteroid {item[0] if item else 'Unknown'}: {e}")
                continue

        # Ensure the static directory exists
        os.makedirs(STATIC_DIR, exist_ok=True)
        
        # Save the generated CZML to a file
        output_path = os.path.join(STATIC_DIR, "catalog.czml")
        with open(output_path, 'w') as f:
            json.dump(all_czml, f)

        print(f"--- Successfully generated and saved CZML catalog to {output_path} ---")
    except requests.exceptions.Timeout:
        print("Gateway timeout: The JPL API took too long to respond.")
    except Exception as e:
        print(f"An error occurred during CZML generation: {e}")

if __name__ == "__main__":
    generate_czml_file()