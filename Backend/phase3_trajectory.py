import rebound
import spiceypy as spice
import numpy as np
import os
import json

# --- Configuration ---
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
KERNELS_DIR = os.path.join(PROJECT_ROOT, "kernels")
spice.furnsh(os.path.join(KERNELS_DIR, "meta_kernel.txt"))

def get_position_from_czml(czml_data, target_et):
    """
    Finds the position of the impactor from CZML data at a specific ephemeris time.
    Performs linear interpolation between the two closest data points.
    """
    impactor_packet = next((p for p in czml_data if p.get('id') == 'impactor2025'), None)
    if not impactor_packet:
        raise ValueError("Impactor 'impactor2025' not found in CZML data.")

    position_prop = impactor_packet.get('position')
    if not position_prop or 'cartesian' not in position_prop:
        raise ValueError("Impactor packet does not contain cartesian position data.")

    epoch_et = spice.str2et(position_prop['epoch'])
    cartesian_data = position_prop['cartesian']

    # Reshape the flat data array into a (N, 4) array of [time, x, y, z]
    data_array = np.array(cartesian_data).reshape(-1, 4)
    times = data_array[:, 0]
    positions = data_array[:, 1:] # Now in meters

    target_time_from_epoch = target_et - epoch_et

    # Find the index where the target time would be inserted
    # This is more efficient than a for loop
    idx = np.searchsorted(times, target_time_from_epoch, side="right")

    # Handle edge cases: target time is before the first or after the last sample
    if idx == 0:
        return positions[0] / 1000.0 # Return first position, convert to km
    if idx >= len(times):
        return positions[-1] / 1000.0 # Return last position, convert to km

    # Linear interpolation
    t1, p1 = times[idx - 1], positions[idx - 1]
    t2, p2 = times[idx], positions[idx]

    t = (target_time_from_epoch - t1) / (t2 - t1)
    interpolated_pos_meters = p1 + t * (p2 - p1)
    
    return interpolated_pos_meters / 1000.0 # Convert from meters to km

def generate_mitigation_czml(trajectory_params, start_time_et):
    """
    Calculates the spacecraft trajectory using the "Hybrid Directional Kick" method.
    This respects the user's chosen Delta-V to create different trajectory types.
    """
    print("--- GENERATING SPACECRAFT CZML (Hybrid Directional Kick Method) ---")

    # 1. GET PARAMETERS FROM USER'S CHOICE
    travel_time_days = int(trajectory_params['travel_time_days'])
    delta_v_mps = int(trajectory_params['required_deltav'])
    travel_time_seconds = travel_time_days * 86400
    arrival_time_et = start_time_et + travel_time_seconds

    # 2. GET INITIAL & FINAL STATES
    # Earth state from SPICE
    earth_state_launch, _ = spice.spkgeo(targ=399, et=start_time_et, ref='ECLIPJ2000', obs=0)
    earth_pos_launch = np.array(earth_state_launch[:3])
    earth_vel_launch = np.array(earth_state_launch[3:])
    
    # Asteroid state from our fictional CZML
    static_dir = os.path.join(PROJECT_ROOT, "static")
    impactor_czml_path = os.path.join(static_dir, "impactor2025.czml")
    with open(impactor_czml_path, 'r') as f:
        impactor_czml_data = json.load(f)
    
    asteroid_pos_arrival = get_position_from_czml(impactor_czml_data, arrival_time_et)

    # 3. CALCULATE THE SPACECRAFT'S INITIAL VELOCITY
    direction_vector = asteroid_pos_arrival - earth_pos_launch
    norm_direction = direction_vector / np.linalg.norm(direction_vector)
    delta_v_kms = delta_v_mps / 1000.0
    kick_velocity = norm_direction * delta_v_kms
    spacecraft_initial_velocity = earth_vel_launch + kick_velocity
    
    print(f"Chosen Δv: {delta_v_mps} m/s. Total initial velocity: {np.linalg.norm(spacecraft_initial_velocity):.2f} km/s")

    # 4. PROPAGATE THE ORBIT WITH REBOUND
    sim = rebound.Simulation()
    sim.units = ('s', 'km', 'kg')
    sim.G = 1.32712440018e11 # Sun's gravitational parameter in km^3/s^2
    sim.add(m=1) # The Sun

    sim.add(
        m=0,
        x=earth_pos_launch[0], y=earth_pos_launch[1], z=earth_pos_launch[2],
        vx=spacecraft_initial_velocity[0], vy=spacecraft_initial_velocity[1], vz=spacecraft_initial_velocity[2]
    )
    
    # 5. INTEGRATE AND COLLECT POINTS FOR CZML
    n_points = 200
    times = np.linspace(0, travel_time_seconds, n_points)
    cartesian_points = []
    epoch = spice.et2utc(start_time_et, 'ISOC', 3)
    
    for t in times:
        sim.integrate(t)
        particle = sim.particles[1]
        pos_km = np.array([particle.x, particle.y, particle.z])
        # CZML format is [TimeDeltaInSeconds, X_meters, Y_meters, Z_meters]
        cartesian_points.extend([t, pos_km[0] * 1000, pos_km[1] * 1000, pos_km[2] * 1000])

    # 6. CONSTRUCT THE CZML PACKET
    arrival_time_iso = spice.et2utc(arrival_time_et, 'ISOC', 3)
    mitigator_czml = [
        {
            "id": "document",
            "name": "Mitigation Vehicle Trajectory", "version": "1.0",
            "clock": {
                "interval": f"{epoch}/{arrival_time_iso}",
                "currentTime": epoch,
                "multiplier": 86400, # 1 day per second
                "range": "CLAMPED"
            }
        },
        {
            "id": "mitigation_vehicle",
            "name": "Mitigation Vehicle",
            "availability": f"{epoch}/{arrival_time_iso}",
            "model": { "gltf": "/DART.glb", "scale": 200000, "minimumPixelSize": 64 },
            "path": {
                "material": { "solidColor": { "color": { "rgba": [255, 0, 255, 255] } } },
                "width": 2, "resolution": 120
            },
            "position": {
                "interpolationAlgorithm": "LAGRANGE", "interpolationDegree": 5,
                "epoch": epoch,
                "cartesian": cartesian_points
            }
        }
    ]
    return mitigator_czml
