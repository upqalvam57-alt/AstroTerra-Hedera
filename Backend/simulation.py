import math
import requests
import rebound
import spiceypy as sp
import numpy as np
from datetime import datetime, timezone

# --- Constants ---
AU_TO_KM = 149597870.7

# --- Helper Function ---
# This is the corrected function.
def fetch_and_parse_neo_data(spkid: str) -> dict:
    url = f"https://ssd-api.jpl.nasa.gov/sbdb.api?spk={spkid}&phys-par=1"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    data = response.json()
    
    if "object" not in data or not data.get("orbit"):
        raise Exception(f"Incomplete data for SPK-ID {spkid}.")

    # --- Start of the fix ---
    # Create a new, simple dictionary for the orbit elements.
    orbit_elements_dict = {}
    
    # Loop through the list of elements from the API.
    for element in data["orbit"]["elements"]:
        # Use the 'name' as the key and the 'value' as the value.
        orbit_elements_dict[element["name"]] = element["value"]
    # --- End of the fix ---

    # Build the final parsed data structure with the correctly formatted dictionary.
    parsed_data = {
        "object": data["object"],
        "orbit": orbit_elements_dict 
    }
    
    return parsed_data

# THIS IS THE FINAL VERSION WITH THE CORRECT KEY NAME
def calculate_orbit(spkid: str, meta_kernel_path: str) -> list:
    sp.kclear()
    sp.furnsh(meta_kernel_path)
    
    neo_data = fetch_and_parse_neo_data(spkid)
    et_now = sp.utc2et(datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'))
    sun_state_w_ssb = sp.spkssb(10, et_now, 'J2000')
    earth_state_w_ssb = sp.spkssb(399, et_now, 'J2000')
    GM_SUN_KM3_S2 = 1.32712440018e11
    orbit_elements = neo_data["orbit"]

    # --- Start of the corrected fix ---
    # Check for the epoch value using the correct key names
    if 'epoch' in orbit_elements:
        epoch_jd_str = orbit_elements['epoch']
    # THIS IS THE LINE WE ARE FIXING: 'tp_jd' is now correctly 'tp'
    elif 'tp' in orbit_elements:
        epoch_jd_str = orbit_elements['tp']
    else:
        raise KeyError(f"Could not find a valid epoch time ('epoch' or 'tp') in the API data for SPKID {spkid}. Available keys: {orbit_elements.keys()}")
    
    epoch_et = sp.utc2et(f"JD {epoch_jd_str}")
    # --- End of the corrected fix ---

    a_km = float(orbit_elements["a"]) * AU_TO_KM
    
    elts = [ 
        a_km * (1.0 - float(orbit_elements["e"])), 
        float(orbit_elements["e"]), 
        math.radians(float(orbit_elements["i"])), 
        math.radians(float(orbit_elements["om"])), 
        math.radians(float(orbit_elements["w"])), 
        math.radians(float(orbit_elements["ma"])), 
        epoch_et,
        GM_SUN_KM3_S2 
    ]
    
    ast_state_w_sun = sp.conics(elts, et_now)
    ast_state_w_ssb = [ast_state_w_sun[i] + ast_state_w_sun[i] for i in range(6)]
    sim = rebound.Simulation()
    sim.units = ('AU', 'day', 'Msun')
    sim.add(m=1.0, x=sun_state_w_ssb[0]/AU_TO_KM, y=sun_state_w_ssb[1]/AU_TO_KM, z=sun_state_w_ssb[2]/AU_TO_KM, vx=sun_state_w_ssb[3]*86400/AU_TO_KM, vy=sun_state_w_ssb[4]*86400/AU_TO_KM, vz=sun_state_w_ssb[5]*86400/AU_TO_KM)
    sim.add(m=3.003e-6, x=earth_state_w_ssb[0]/AU_TO_KM, y=earth_state_w_ssb[1]/AU_TO_KM, z=earth_state_w_ssb[2]/AU_TO_KM, vx=earth_state_w_ssb[3]*86400/AU_TO_KM, vy=earth_state_w_ssb[4]*86400/AU_TO_KM, vz=earth_state_w_ssb[5]*86400/AU_TO_KM)
    sim.add(m=0, x=ast_state_w_ssb[0]/AU_TO_KM, y=ast_state_w_ssb[1]/AU_TO_KM, z=ast_state_w_ssb[2]/AU_TO_KM, vx=ast_state_w_ssb[3]*86400/AU_TO_KM, vy=ast_state_w_ssb[4]*86400/AU_TO_KM, vz=ast_state_w_ssb[5]*86400/AU_TO_KM)
    sim.move_to_com()
    N_steps = 365
    times = np.linspace(0., 365., N_steps)
    geocentric_coords = []
    for t in times:
        sim.integrate(t)
        earth_pos = sim.particles[1].xyz
        ast_pos = sim.particles[2].xyz
        geocentric_pos_au = [ast_pos[i] - earth_pos[i] for i in range(3)]
        geocentric_pos_m = [coord * AU_TO_KM * 1000 for coord in geocentric_pos_au]
        geocentric_coords.append(geocentric_pos_m)
    return geocentric_coords