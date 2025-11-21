from contextlib import asynccontextmanager
import fastapi
import json 
import os
import requests
import spiceypy as spice
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool

import phase1_simulation as sim
import phase3_trajectory as p3_traj
import hedera_service

# --- App Initialization ---
# --- 1. LOAD NASA DATA ONCE (The Improvement) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP: Load the kernels when server starts
    print("--- LOADING NASA SPICE KERNELS ---")
    try:
        # Make sure this path points to your meta_kernel.txt
        kernel_path = os.path.join(PROJECT_ROOT, "kernels", "meta_kernel.txt")
        spice.furnsh(kernel_path)
        print("--- KERNELS LOADED SUCCESSFULLY ---")
    except Exception as e:
        print(f"--- KERNEL LOAD FAILED: {e} ---")
    
    yield # The application runs here
    
    # SHUTDOWN: Unload kernels when server stops
    print("--- UNLOADING KERNELS ---")
    spice.kclear()

# --- App Initialization ---
# We attach the lifespan logic here
app = FastAPI(title="AstroTerra Backend", lifespan=lifespan) 

@app.get("/")
def get_root():
    """A simple endpoint to check if the server is running."""
    return {"message": "AstroTerra Backend is running!"}


# --- Middleware ---
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- Static Files ---
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
# FIX: The 'static' directory is inside the 'Backend' sub-directory.
STATIC_DIR = os.path.join(PROJECT_ROOT, "static")

@app.get("/static/{path:path}")
async def serve_static(path: str):
    static_file_path = os.path.join(STATIC_DIR, path)
    if not os.path.exists(static_file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    response = FileResponse(static_file_path)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

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
    # This line creates the exact path to your file: "Backend/static/impactor2025.czml"
    impactor_czml_path = os.path.join(STATIC_DIR, "impactor2025.czml")

    if not os.path.exists(impactor_czml_path):
        raise HTTPException(
            status_code=500, 
            detail="Error: 'impactor2025.czml' not found. Please run the precompute_impactor.py script first."
        )
    
    with open(impactor_czml_path, "r") as f:
        impactor_czml_data = json.load(f)

    mock_sim_state = {
        "phase": "confirmation",
        "impact_probability": 1.0,
        "observation_level": "N/A",
        "max_observations": "N/A",
        "time_to_impact_days": 90
    }
    
    return {"simulation_state": mock_sim_state, "czml": impactor_czml_data}
@app.post("/simulation/observe")
async def observe_threat():
    """Runs one observation, refining the orbit and returning the new state and CZML."""
    sim_state = await run_in_threadpool(sim.perform_observation)
    if sim_state is None:
        raise HTTPException(status_code=400, detail="Simulation is not in a state where observation is possible.")
    czml_data = await run_in_threadpool(sim.generate_threat_czml)
    return {"simulation_state": sim_state, "czml": czml_data}

@app.post("/simulation/decision")
async def make_simulation_decision(payload: dict):
    """
    Makes the final decision on whether to launch the probe and audits it to HCS.
    """
    launch_probe = payload.get("launch_probe")
    if launch_probe is None:
        raise HTTPException(status_code=400, detail="Missing 'launch_probe' boolean in request body.")

    sim_state = await run_in_threadpool(sim.make_decision, launch_probe)
    if sim_state is None:
        raise HTTPException(status_code=400, detail="Simulation is not in a state where a decision can be made.")
    
    return {"simulation_state": sim_state}

@app.get("/simulation/state")
async def get_simulation_state():
    """Gets the current state of the mission without changing it."""
    return {"simulation_state": sim.SIMULATION_STATE}

@app.get("/api/audit")
async def get_audit_log(request: Request, date: str = None, phase: str = None):
    """
    Retrieves the public audit trail from the Hedera Mirror Node.
    Can be filtered by date (YYYY-MM-DD) and/or a phase string.
    """
    try:
        # The hedera_service now gets all logs, and we filter them here.
        audit_log = await hedera_service.get_audit_trail()

        # --- Server-Side Filtering ---
        if date:
            try:
                # Convert the incoming YYYY-MM-DD string to a date object
                filter_date = datetime.strptime(date, "%Y-%m-%d").date()
                
                audit_log = [
                    log for log in audit_log
                    if datetime.fromtimestamp(float(log['consensus_timestamp']), tz=timezone.utc).date() == filter_date
                ]

            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Please use YYYY-MM-DD.")

        if phase:
            # Filter logs where the message contains the phase string
            audit_log = [
                log for log in audit_log
                if 'audit_data' in log and 'message' in log['audit_data'] and phase in log['audit_data']['message']
            ]

        return {"audit_log": audit_log}
    except Exception as e:
        # Log the exception for debugging purposes
        print(f"ERROR in /api/audit: {str(e)}")
        # Return a generic error response to the client
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve audit trail. Please check the server logs for more information."
        )


# --- ADD THIS ENTIRE NEW SECTION FOR PHASE 3 ---
# ===============================================================
@app.post("/simulation/launch_mitigation")
async def launch_mitigation_vehicle(payload: dict):
    """
    Calculates the initial trajectory for the mitigation vehicle based on
    Phase 2 design choices and a precise launch time from the frontend.
    """
    # --- SPICE KERNEL MANAGEMENT ---
    # The kernels need to be loaded for the str2et call, and for the trajectory
    # calculation. We wrap this in a try/finally to ensure kernels are cleared.
    meta_kernel_path = os.path.join(PROJECT_ROOT, "kernels", "meta_kernel.txt")
    
    try:
        spice.furnsh(meta_kernel_path)
        print("--- LAUNCH REQUEST RECEIVED ---")
        # Extract data sent from the frontend
        trajectory_params = payload.get("trajectory")
        launch_time_iso = payload.get("launchTimeISO")

        if not trajectory_params or not launch_time_iso:
            raise HTTPException(status_code=400, detail="Missing trajectory_params or launchTimeISO in request.")

        # FIX: SPICE's str2et is strict and doesn't like the 'Z' UTC designator or timezone offsets.
        if launch_time_iso.endswith('Z'):
            launch_time_iso = launch_time_iso[:-1]
        if '+' in launch_time_iso:
            launch_time_iso = launch_time_iso.split('+')[0]
        
        launch_time_iso = launch_time_iso.replace('T', ' ')

        launch_time_et = spice.str2et(launch_time_iso)

        # Call the trajectory calculation function in a background thread
        czml_data = await run_in_threadpool(
            p3_traj.generate_mitigation_czml,
            trajectory_params,
            launch_time_et
        )
        
        return {"status": "success", "czml": czml_data}

    except Exception as e:
        print(f"ERROR in launch_mitigation_vehicle: {str(e)}")
        # Format the SPICE error if it is one
        if hasattr(e, 'value'):
             raise HTTPException(status_code=500, detail=f"SPICE Error: {e.value}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate trajectory: {str(e)}")
    finally:
        # Ensure kernels are always unloaded
        spice.kclear()


# --- API ENDPOINTS ---


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

from fastapi.responses import FileResponse

# (Add this to the end of backend/app.py)

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(os.path.join(PROJECT_ROOT, "..", "Frontend", "public", "vite.svg"))

@app.get("/test")
async def run_test():
    """A simple endpoint to check if the server is reloading."""
    print("--- TEST ENDPOINT WAS SUCCESSFULLY CALLED ---")
    return {"message": "Hello from the test endpoint!"}

# --- HACKATHON DEMO ENDPOINT ---
@app.post("/simulation/audit_test")
async def audit_test():
    """
    A temporary endpoint to directly trigger a 'Probe Launch' audit message
    for the hackathon demo.
    """
    topic_id = os.getenv("HCS_TOPIC_ID")
    if not topic_id:
        raise HTTPException(status_code=500, detail="HCS_TOPIC_ID not found in .env file.")
    
    message = f"Phase 2: Decision at {datetime.now(timezone.utc).isoformat()}: User chose to LAUNCH the probe."
    
    success = await run_in_threadpool(hedera_service.submit_hcs_message, topic_id, message)

    if success:
        return {"message": "Successfully submitted 'Probe Launch' audit message."}
    else:
        raise HTTPException(status_code=500, detail="Failed to submit audit message.")

@app.post("/phase3/initial-state")
async def get_phase3_start_state(payload: dict):
    """
    The Bridge: Frontend sends Launch Time -> Backend returns Sun Coordinates.
    """
    launch_time_iso = payload.get("launchTimeISO")
    trajectory_params = payload.get("trajectory", {})

    # Safety check
    if not launch_time_iso:
        raise HTTPException(status_code=400, detail="Missing launchTimeISO")

    # Clean up the date string so NASA SPICE can read it
    if launch_time_iso.endswith('Z'): launch_time_iso = launch_time_iso[:-1]
    if '+' in launch_time_iso: launch_time_iso = launch_time_iso.split('+')[0]
    launch_time_iso = launch_time_iso.replace('T', ' ')

    try:
        # Convert text date to NASA "Ephemeris Time" (ET)
        launch_time_et = spice.str2et(launch_time_iso)
        
        # Run the math function we just wrote
        state = await run_in_threadpool(
            p3_traj.calculate_injection_state,
            trajectory_params,
            launch_time_et
        )
        return state

    except Exception as e:
        print(f"Error in Phase 3 Handover: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # The string "app:app" tells uvicorn to look in the current file ("app")
    # for a variable named "app".
    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=True)