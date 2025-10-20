# In Backend/phase1_simulation.py
from datetime import datetime, timedelta, timezone
import math
import os
import json

# --- Vector Math Helpers ---

def subtract(v1, v2):
    return [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]]

def magnitude(v):
    return math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)

def normalize(v):
    mag = magnitude(v)
    if mag == 0: return [0, 0, 0]
    return [v[0]/mag, v[1]/mag, v[2]/mag]

def cross_product(v1, v2):
    return [v1[1]*v2[2] - v1[2]*v2[1],
            v1[2]*v2[0] - v1[0]*v2[2],
            v1[0]*v2[1] - v1[1]*v2[0]]

def dot_product(v1, v2):
    return v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2]

def get_orientation_quaternion(start_point, end_point):
    """Calculates the quaternion to orient a cylinder from start to end."""
    direction_vec = normalize(subtract(end_point, start_point))
    up_vec = [0, 0, 1] # Cesium's default orientation is along Z

    dot = dot_product(up_vec, direction_vec)

    if abs(dot - 1.0) < 1e-6: # Vectors are parallel
        return [0, 0, 0, 1]
    if abs(dot + 1.0) < 1e-6: # Vectors are anti-parallel
        return [1, 0, 0, 0] # Rotate 180 degrees around X-axis

    axis = normalize(cross_product(up_vec, direction_vec))
    angle = math.acos(dot)
    half_angle = angle * 0.5
    sin_half = math.sin(half_angle)
    
    return [
        axis[0] * sin_half,
        axis[1] * sin_half,
        axis[2] * sin_half,
        math.cos(half_angle)
    ]

# --- Simulation State ---
# This dictionary will hold the state of our fictional mission
SIMULATION_STATE = {
    "active": False,
    "phase": "briefing",  # briefing -> observation -> confirmation -> decision
    "observation_level": 0,
    "max_observations": 5,
    "impact_probability": 0.05,
    "cone_scale": 1.0,  # Represents the size of the uncertainty cone (1.0 = 100%)
}

# --- Core Logic ---

def start_simulation():
    """Resets the simulation to its initial state."""
    global SIMULATION_STATE
    SIMULATION_STATE = {
        "active": True,
        "phase": "briefing",
        "observation_level": 0,
        "max_observations": 5,
        "impact_probability": 0.05,
        "cone_scale": 1.0,
    }
    print("--- New Simulation Started. State:", SIMULATION_STATE)
    return SIMULATION_STATE

def perform_observation():
    """
    Simulates making an observation. This reduces uncertainty (cone_scale)
    and increases the impact probability.
    """
    global SIMULATION_STATE
    if not SIMULATION_STATE.get("active") or SIMULATION_STATE.get("phase") == "decision":
        return None # Can't observe if the simulation isn't in the right phase

    obs_level = SIMULATION_STATE["observation_level"]
    max_obs = SIMULATION_STATE["max_observations"]

    if obs_level < max_obs:
        SIMULATION_STATE["observation_level"] += 1
        SIMULATION_STATE["phase"] = "observation"
        
        progress = SIMULATION_STATE["observation_level"] / max_obs
        SIMULATION_STATE["cone_scale"] = 1.0 - (progress ** 1.5)
        SIMULATION_STATE["impact_probability"] = 0.05 + (0.95 * (progress ** 2))
        SIMULATION_STATE["impact_probability"] = min(SIMULATION_STATE["impact_probability"], 1.0)

    if SIMULATION_STATE["observation_level"] >= max_obs:
        SIMULATION_STATE["phase"] = "confirmation"
        SIMULATION_STATE["impact_probability"] = 1.0
        SIMULATION_STATE["cone_scale"] = 0.0

    print("--- Observation Performed. State:", SIMULATION_STATE)
    return SIMULATION_STATE

def generate_threat_czml():
    """
    Generates the CZML for the 'Impactor 2025' threat, using the pre-computed
    impactor.czml file as the true trajectory.
    """
    global SIMULATION_STATE
    if not SIMULATION_STATE.get("active"):
        return []

    # Load the pre-computed impactor data
    PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
    STATIC_DIR = os.path.join(PROJECT_ROOT, "static")
    impactor_czml_path = os.path.join(STATIC_DIR, "impactor.czml")

    if not os.path.exists(impactor_czml_path):
        # This should not happen if precompute_impactor.py has been run
        print("--- ERROR: impactor.czml not found! ---")
        return []

    with open(impactor_czml_path, "r") as f:
        impactor_czml = json.load(f)

    doc_packet = impactor_czml[0]
    impactor_packet = impactor_czml[1]

    cone_scale = SIMULATION_STATE["cone_scale"]

    if cone_scale > 0.0:
        # Extract the full trajectory data
        position_data = impactor_packet["position"]["cartesian"]
        
        # Get start and end positions from the full trajectory
        start_pos = position_data[1:4]
        end_pos = position_data[-3:]

        length = magnitude(subtract(end_pos, start_pos))
        direction = normalize(subtract(end_pos, start_pos))
        
        # The midpoint of the entire trajectory path
        midpoint = [
            start_pos[0] + direction[0] * length * 0.5,
            start_pos[1] + direction[1] * length * 0.5,
            start_pos[2] + direction[2] * length * 0.5,
        ]
        orientation_quat = get_orientation_quaternion(start_pos, end_pos)

        # The radius of the cone is a percentage of the total trajectory length
        uncertainty_radius = (length * 0.02) * cone_scale 
        principal_axis_length = length / 2.0

        threat_packet = {
            "id": "impactor_2025_uncertainty",
            "name": "Impactor 2025 Uncertainty Cone",
            "availability": doc_packet["clock"]["interval"],
            "position": {"cartesian": midpoint},
            "orientation": {"unitQuaternion": orientation_quat},
            "cylinder": {
                "length": length,
                "topRadius": 0,
                "bottomRadius": uncertainty_radius * 2, # A cone is a cylinder with one radius at 0
                "material": {
                    "solidColor": {
                        "color": {"rgba": [255, 165, 0, 80]}
                    }
                }
            }
        }
        # We only return the document and the uncertainty cone
        return [doc_packet, threat_packet]
    else:
        # When uncertainty is zero, return the true trajectory
        return impactor_czml