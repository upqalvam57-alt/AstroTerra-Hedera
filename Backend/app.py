import fastapi
import json 
import os
import requests
import spiceypy as spice
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool

import phase1_simulation as sim
import phase3_trajectory as p3_traj 

# --- App Initialization ---
app = FastAPI(title="AstroTerra Backend (Pre-computed)", version="2.0.0")

# --- Middleware ---
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- Static Files ---
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
# FIX: The 'static' directory is inside the 'Backend' sub-directory.
STATIC_DIR = os.path.join(PROJECT_ROOT, "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# --- Helper Function (copied from original) ---
def get_asteroid_classification(h_mag, is_pha):
    if h_mag is not None:
        if h_mag < 18.0: return "PLANET_KILLER"
        if h_mag < 22.0: return "CITY_KILLER"
    if is_pha: return "PHA"
    return "REGULAR"

# ===============================================================
# --- PHASE 1: MISSION SIMULATION API ENDPOINTS ---
# ===============================================================

# (In app.py, replace the entire function)

# (In backend/app.py)

@app.post("/simulation/start")
async def start_new_simulation():
    """
    Loads the PRE-COMPUTED 'Impactor 2025' mission from the static file.
    """
    # 1. This line creates the exact path to your file: "Backend/static/impactor.czml"
    impactor_czml_path = os.path.join(STATIC_DIR, "impactor.czml")

    # 2. This checks if that file actually exists.
    if not os.path.exists(impactor_czml_path):
        raise HTTPException(
            status_code=500, 
            detail="Error: 'impactor.czml' not found. Please run the precompute_impactor.py script first."
        )
    
    # 3. This opens and reads your 'impactor.czml' file.
    with open(impactor_czml_path, "r") as f:
        impactor_czml_data = json.load(f)

    # 4. This creates a simple status message for the UI.
    mock_sim_state = {
        "phase": "confirmation",
        "impact_probability": 1.0,
        "observation_level": "N/A",
        "max_observations": "N/A",
        "time_to_impact_days": 90
    }
    
    # 5. This sends the content of your 'impactor.czml' file to the frontend.
    return {"simulation_state": mock_sim_state, "czml": impactor_czml_data}

@app.post("/simulation/observe")
async def observe_threat():
    """Runs one observation, refining the orbit and returning the new state and CZML."""
    sim_state = await run_in_threadpool(sim.perform_observation)
    if sim_state is None:
        raise HTTPException(status_code=400, detail="Simulation is not in a state where observation is possible.")
    czml_data = await run_in_threadpool(sim.generate_threat_czml)
    return {"simulation_state": sim_state, "czml": czml_data}

@app.get("/simulation/state")
async def get_simulation_state():
    """Gets the current state of the mission without changing it."""
    return {"simulation_state": sim.SIMULATION_STATE}


# --- ADD THIS ENTIRE NEW SECTION FOR PHASE 3 ---
# ===============================================================
@app.post("/simulation/launch_mitigation")
async def launch_mitigation_vehicle(payload: dict):
    """
    Calculates the initial trajectory for the mitigation vehicle based on
    Phase 2 design choices and a precise launch time from the frontend.
    """
    try:
        print("--- LAUNCH REQUEST RECEIVED ---")
        # Extract data sent from the frontend
        trajectory_params = payload.get("trajectory")
        launch_time_iso = payload.get("launchTimeISO")

        if not trajectory_params or not launch_time_iso:
            raise HTTPException(status_code=400, detail="Missing trajectory_params or launchTimeISO in request.")

        # FIX: SPICE's str2et is strict and doesn't like the 'Z' UTC designator.
        if launch_time_iso.endswith('Z'):
            launch_time_iso = launch_time_iso[:-1]

        # Convert the ISO launch time string to SPICE Ephemeris Time (ET)
        launch_time_et = spice.str2et(launch_time_iso)

        # Call the new module to do the heavy lifting in a background thread
        czml_data = await run_in_threadpool(
            p3_traj.generate_mitigation_czml,
            trajectory_params,
            launch_time_et
        )
        
        return {"status": "success", "czml": czml_data}

    except Exception as e:
        print(f"ERROR in launch_mitigation_vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate trajectory: {str(e)}")


# --- API ENDPOINTS ---
@app.get("/neos/curated_list")
async def get_curated_neo_list():
    try:
        response = await run_in_threadpool(requests.get, "https://ssd-api.jpl.nasa.gov/sbdb_query.api", params={"limit": 500, "fields": "spkid,full_name,H,pha", "sb-class": "APO"}, timeout=30)
        response.raise_for_status()
        raw_data = response.json()
        planet_killers, city_killers = [], []
        for item in raw_data.get("data", []):
            spkid, fullname, h, pha = item
            h_mag = float(h) if h is not None else None; is_pha = pha == 'Y'
            classification = get_asteroid_classification(h_mag, is_pha)
            if classification == 'PLANET_KILLER' and len(planet_killers) < 5: planet_killers.append({"spkid": spkid, "name": fullname})
            elif classification == 'CITY_KILLER' and len(city_killers) < 5: city_killers.append({"spkid": spkid, "name": fullname})
            if len(planet_killers) >= 5 and len(city_killers) >= 5: break
        return {"planet_killers": planet_killers, "city_killers": city_killers}
    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=f"SBDB API error: {str(e)}")

# --- Add this function to your app.py ---
# --- (This is the new, correct code) ---

@app.get("/neos/curated_list")
def get_curated_neo_list():
    """
    Loads the PRE-COMPUTED curated list of NEOs from a static JSON file.
    """
    curated_list_path = os.path.join(STATIC_DIR, "curated_neo_list.json")
    
    if not os.path.exists(curated_list_path):
        raise HTTPException(
            status_code=500, 
            detail="Error: 'curated_neo_list.json' not found. Please run the precompute_neos.py script first."
        )
    
    with open(curated_list_path, "r") as f:
        return json.load(f)

@app.get("/neos/list")
def get_neo_list():
    """
    Loads the PRE-COMPUTED full list of NEOs from a static JSON file.
    """
    neo_list_path = os.path.join(STATIC_DIR, "neo_list.json")

    if not os.path.exists(neo_list_path):
        raise HTTPException(
            status_code=500, 
            detail="Error: 'neo_list.json' not found. Please run the precompute_neos.py script first."
        )
    
    with open(neo_list_path, "r") as f:
        return json.load(f)


@app.get("/czml/catalog")
async def get_neo_catalog_czml():
    catalog_path = os.path.join(STATIC_DIR, "catalog.czml")
    planets_path = os.path.join(STATIC_DIR, "planets.czml")

    if not os.path.exists(catalog_path) or not os.path.exists(planets_path):
        raise HTTPException(status_code=404, detail="CZML data files not found.")

    # Load both CZML files
    with open(catalog_path, "r") as f:
        catalog_data = json.load(f)
    with open(planets_path, "r") as f:
        planets_data = json.load(f)
    
    # The first packet in each file is the "document" packet. We'll use the one from the planets file
    # and append all other entities.
    combined_data = planets_data + catalog_data[1:] # Skip the asteroid document packet

    return Response(content=json.dumps(combined_data), media_type='application/json')

# (Add this to the end of backend/app.py)

@app.get("/test")
async def run_test():
    """A simple endpoint to check if the server is reloading."""
    print("--- TEST ENDPOINT WAS SUCCESSFULLY CALLED ---")
    return {"message": "Hello from the test endpoint!"}

# (Add this to the VERY END of your backend/app.py file)

if __name__ == "__main__":
    import uvicorn
    # The string "app:app" tells uvicorn to look in the current file ("app")
    # for a variable named "app".
    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=True)