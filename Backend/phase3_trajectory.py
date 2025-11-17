import rebound
import spiceypy as spice
import numpy as np
import os
import json

# --- Configuration ---
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
KERNELS_DIR = os.path.join(PROJECT_ROOT, "kernels")


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

    epoch_str = position_prop['epoch']
    if '+' in epoch_str:
        epoch_str = epoch_str.split('+')[0]
    epoch_str = epoch_str.replace('T', ' ')
    epoch_et = spice.str2et(epoch_str)
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
    Calculates the trajectory for the mitigation vehicle into a parking orbit.
    """
    # --- KERNEL MANAGEMENT FOR WORKER THREAD ---
    # This function runs in a separate thread, so it needs to load kernels for its own context.
    # The meta-kernel file now contains the absolute path to the kernels.
    PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
    KERNELS_DIR = os.path.join(PROJECT_ROOT, "kernels")
    meta_kernel_path = os.path.join(KERNELS_DIR, "meta_kernel.txt")
    
    try:
        spice.furnsh(meta_kernel_path)

        # --- 1. Generate Ascent Trajectory ---
        # The "profile" will be passed from the frontend based on which porkchop plot is selected
        trajectory_profile = trajectory_params.get("profile", 1) 
        ascent_cartesian_points, final_pos_relative, final_vel_relative, ascent_duration = generate_ascent_trajectory(start_time_et, trajectory_profile)

        # --- 2. Orbital Simulation (starts after ascent) ---
        orbit_start_et = start_time_et + ascent_duration
        
        # WORKAROUND: Hardcode Earth GM to bypass persistent SPICE kernel loading issues.
        gm_earth = 398659.2936294783
        earth_mass_kg = gm_earth / 6.67430e-20

        sim = rebound.Simulation()
        sim.units = ('s', 'km', 'kg')
        sim.add(m=earth_mass_kg) # Earth
        sim.add(
            m=0,
            x=final_pos_relative[0], y=final_pos_relative[1], z=final_pos_relative[2],
            vx=final_vel_relative[0], vy=final_vel_relative[1], vz=final_vel_relative[2]
        )
        
        # Integrate for a few orbits
        leo_radius_km = np.linalg.norm(final_pos_relative)
        orbit_period_seconds = 2 * np.pi * np.sqrt(leo_radius_km**3 / gm_earth)
        total_orbit_sim_time = orbit_period_seconds * 2
        n_orbit_points = 200
        orbit_times = np.linspace(0, total_orbit_sim_time, n_orbit_points)
        
        orbital_cartesian_points = []
        for t in orbit_times:
            sim.integrate(t)
            particle_pos = np.array([sim.particles[1].x, sim.particles[1].y, sim.particles[1].z])
            # Time for orbital points is relative to the start of the orbit phase
            orbital_cartesian_points.extend([ascent_duration + t, particle_pos[0] * 1000, particle_pos[1] * 1000, particle_pos[2] * 1000])

        # --- 3. Combine Trajectories and Construct CZML ---
        full_cartesian_points = ascent_cartesian_points + orbital_cartesian_points
        
        epoch_iso = spice.et2utc(start_time_et, 'ISOC', 3)
        end_time_et = orbit_start_et + total_orbit_sim_time
        end_time_iso = spice.et2utc(end_time_et, 'ISOC', 3)

        mitigator_czml = [
            {
                "id": "document",
                "name": "Mitigation Vehicle Trajectory", "version": "1.0",
                "clock": {
                    "interval": f"{epoch_iso}/{end_time_iso}",
                    "currentTime": epoch_iso,
                    "multiplier": 100,
                    "range": "LOOP_STOP"
                }
            },
            {
                "id": "mitigation_vehicle",
                "name": "Mitigation Vehicle",
                "availability": f"{epoch_iso}/{end_time_iso}",
                "model": { "gltf": "/SLS.glb", "scale": 20000, "minimumPixelSize": 64 },
                "path": {
                    "material": { "solidColor": { "color": { "rgba": [0, 255, 255, 255] } } },
                    "width": 2, "resolution": 120
                },
                "position": {
                    "interpolationAlgorithm": "LAGRANGE", "interpolationDegree": 5,
                    "referenceFrame": "INERTIAL",
                    "epoch": epoch_iso,
                    "cartesian": full_cartesian_points
                }
            }
        ]
        return mitigator_czml
    finally:
        # Unload kernels to be safe in the worker thread.
        spice.kclear()

def generate_ascent_trajectory(start_time_et, trajectory_profile):
    """
    Generates a simplified, curved ascent trajectory from launch to the Karman line (100km).
    This is a simplified analytical model, not a full physics simulation.
    """
    # --- Ascent Parameters ---
    g = 9.81 / 1000  # km/s^2
    thrust_acceleration = 0.03 # km/s^2 (approx. 3g)
    burn_duration = 150  # seconds
    initial_vertical_duration = 10 # seconds
    dt = 0.5  # time step in seconds
    karman_line_altitude_km = 100

    if trajectory_profile == 1:
        pitch_over_angle_deg = 1.0
    elif trajectory_profile == 2:
        pitch_over_angle_deg = 1.5
    else:
        pitch_over_angle_deg = 2.0

    # --- State variables in local ENU frame ---
    pos = np.array([0.0, 0.0, 0.0])  # East, North, Up
    vel = np.array([0.0, 0.0, 0.0])
    
    # --- Launch site setup for frame conversion ---
    launch_lon_rad = np.radians(-80.6490)
    launch_lat_rad = np.radians(28.5729)
    earth_radii = [6378.1366, 6378.1366, 6356.7519]
    re = earth_radii[0]
    flattening = (re - earth_radii[2]) / re
    launch_pos_itrf93 = spice.georec(launch_lon_rad, launch_lat_rad, 0, re, flattening)

    ascent_cartesian_points = []
    time = 0
    
    while pos[2] < karman_line_altitude_km:
        itrf_to_j2000 = spice.pxform('ITRF93', 'J2000', start_time_et + time)
        
        # --- Calculate forces ---
        gravity = np.array([0, 0, -g])
        
        thrust = np.array([0.0, 0.0, 0.0])
        if time < burn_duration:
            if time < initial_vertical_duration:
                thrust_direction = np.array([0, 0, 1])
            else:
                # Simple gravity turn: pitch over and then align with velocity
                if np.linalg.norm(vel) > 0:
                    thrust_direction = vel / np.linalg.norm(vel)
                else: # Initially, pitch over slightly
                    pitch_rad = np.radians(90 - pitch_over_angle_deg)
                    thrust_direction = np.array([np.sin(pitch_rad), 0, np.cos(pitch_rad)])

            thrust = thrust_direction * thrust_acceleration

        # --- Integrate ---
        accel = thrust + gravity
        vel += accel * dt
        pos += vel * dt
        time += dt

        # --- Convert to J2000 ---
        up = launch_pos_itrf93 / np.linalg.norm(launch_pos_itrf93)
        east = np.cross([0,0,1], up)
        east = east / np.linalg.norm(east)
        north = np.cross(up, east)
        
        enu_to_itrf_matrix = np.column_stack((east, north, up))
        
        pos_itrf = enu_to_itrf_matrix @ pos
        pos_j2000 = itrf_to_j2000 @ pos_itrf
        
        ascent_cartesian_points.extend([time, pos_j2000[0] * 1000, pos_j2000[1] * 1000, pos_j2000[2] * 1000])

    # --- Final State Conversion ---
    itrf_to_j2000 = spice.pxform('ITRF93', 'J2000', start_time_et + time)
    d_matrix = spice.pxfrm2('ITRF93', 'J2000', start_time_et + time, start_time_et+time)[1]
    rotation_vel = d_matrix @ launch_pos_itrf93

    up = launch_pos_itrf93 / np.linalg.norm(launch_pos_itrf93)
    east = np.cross([0,0,1], up)
    east = east / np.linalg.norm(east)
    north = np.cross(up, east)
    enu_to_itrf_matrix = np.column_stack((east, north, up))

    vel_itrf = enu_to_itrf_matrix @ vel
    vel_j2000 = (itrf_to_j2000 @ vel_itrf) + rotation_vel

    final_pos_relative = pos_j2000
    final_vel_relative = vel_j2000

    return ascent_cartesian_points, final_pos_relative, final_vel_relative, time