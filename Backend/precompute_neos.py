# In Backend/precompute_neos.py

import requests
import json
import os
import time

# --- Configuration ---
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(PROJECT_ROOT, "static")
NEO_LIST_OUTPUT_PATH = os.path.join(STATIC_DIR, "neo_list.json")
CURATED_LIST_OUTPUT_PATH = os.path.join(STATIC_DIR, "curated_neo_list.json")

# --- Helper Function (copied from app.py) ---
def get_asteroid_classification(h_mag, is_pha):
    if h_mag is not None:
        if h_mag < 18.0: return "PLANET_KILLER"
        if h_mag < 22.0: return "CITY_KILLER"
    if is_pha: return "PHA"
    return "REGULAR"

# --- Main Pre-computation Logic ---
def precompute_neo_lists():
    """
    Fetches data from the JPL SBDB Query API and saves two processed
    JSON files: one for the full catalog list and one for the curated list.
    """
    print("--- Starting Pre-computation of NEO Lists ---")
    
    # Ensure the static directory exists
    os.makedirs(STATIC_DIR, exist_ok=True)

    try:
        # --- Fetch the data from JPL API ---
        # We fetch a larger list once to get enough data for both outputs.
        limit = 500
        url = "https://ssd-api.jpl.nasa.gov/sbdb_query.api"
        params = {"limit": limit, "fields": "spkid,full_name,H,pha", "sb-class": "APO"}
        
        print(f"Fetching {limit} NEOs from JPL API... (This may take a moment)")
        start_time = time.time()
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status() # Will raise an error for 4xx/5xx responses
        end_time = time.time()
        print(f"JPL API request completed in {end_time - start_time:.2f} seconds.")
        
        raw_data = response.json()
        
        # --- Process the data for both lists simultaneously ---
        full_neo_list = []
        planet_killers, city_killers = [], []

        for item in raw_data.get("data", []):
            spkid, fullname, h, pha = item
            h_mag = float(h) if h is not None else None
            is_pha = pha == 'Y'
            classification = get_asteroid_classification(h_mag, is_pha)

            # 1. Add to the full list
            full_neo_list.append({
                "spkid": spkid, 
                "name": fullname, 
                "classification": classification
            })

            # 2. Check if it qualifies for the curated list
            if classification == 'PLANET_KILLER' and len(planet_killers) < 5:
                planet_killers.append({"spkid": spkid, "name": fullname})
            elif classification == 'CITY_KILLER' and len(city_killers) < 5:
                city_killers.append({"spkid": spkid, "name": fullname})

        # --- Save the full NEO list to its file ---
        with open(NEO_LIST_OUTPUT_PATH, 'w') as f:
            json.dump(full_neo_list, f, indent=2)
        print(f" -> Successfully saved full catalog to {NEO_LIST_OUTPUT_PATH}")

        # --- Save the curated NEO list to its file ---
        curated_list = {"planet_killers": planet_killers, "city_killers": city_killers}
        with open(CURATED_LIST_OUTPUT_PATH, 'w') as f:
            json.dump(curated_list, f, indent=2)
        print(f" -> Successfully saved curated list to {CURATED_LIST_OUTPUT_PATH}")

    except requests.RequestException as e:
        print(f"\nFATAL ERROR: Failed to fetch data from JPL API. Error: {e}")
        print("Pre-computation failed. Please check your internet connection and try again.")
        return

    print("\n--- NEO List Pre-computation Complete! ---")


if __name__ == "__main__":
    precompute_neo_lists()