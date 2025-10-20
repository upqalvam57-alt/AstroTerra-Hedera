import numpy as np
import datetime
import json

# --- Simulation Parameters ---
START_DATE_UTC = "2025-10-26T00:00:00"
SIMULATION_DURATION_DAYS = 120
TIME_STEP_HOURS = 1

# --- CONFIGURATION: SET YOUR FRONTEND SERVER URL HERE ---
# Default for Vite is 5173. Change this if your frontend runs on a different port.
FRONTEND_SERVER_URL = "http://localhost:5173"


def create_curved_trajectory(duration_days, num_steps):
    """
    Calculates a "realistically-looking" curved trajectory for an asteroid impacting Earth.
    This uses a quadratic Bézier curve for a simple, smooth arc.
    """
    print("Calculating curved trajectory...")
    end_position = np.array([0.0, 0.0, 0.0])
    start_position = np.array([1.496e11, 5.0e10, 1.0e10])
    control_point = np.array([7.5e10, -2.5e10, 0.0])

    total_seconds = duration_days * 24 * 60 * 60
    times_seconds = np.linspace(0, total_seconds, num_steps)

    positions_meters = []
    for t_sec in times_seconds:
        t = t_sec / total_seconds
        current_pos = ((1 - t)**2 * start_position) + (2 * (1 - t) * t * control_point) + (t**2 * end_position)
        positions_meters.append(current_pos.tolist())

    print("Trajectory calculated successfully.")
    return positions_meters, times_seconds


def create_czml_manually(positions_meters, times_seconds):
    """
    Creates the CZML file from the trajectory data, hardcoding the full URL to the 3D model.
    """
    print("Generating CZML file...")
    start_time = datetime.datetime.fromisoformat(START_DATE_UTC).replace(tzinfo=datetime.timezone.utc)
    end_time = start_time + datetime.timedelta(days=SIMULATION_DURATION_DAYS)

    czml_packets = []

    # --- Packet 1: The Document Packet (defines the timeline) ---
    document_packet = {
        "id": "document",
        "version": "1.0",
        "clock": {
            "interval": f"{start_time.isoformat()}/{end_time.isoformat()}",
            "currentTime": start_time.isoformat(),
            "multiplier": 86400,
            "range": "LOOP_STOP",
            "step": "SYSTEM_CLOCK_MULTIPLIER"
        }
    }
    czml_packets.append(document_packet)

    # --- Packet 2: The Impactor Packet (defines the asteroid) ---
    cartesian_data = []
    for i, pos in enumerate(positions_meters):
        cartesian_data.extend([times_seconds[i], pos[0], pos[1], pos[2]])

    # --- THIS IS THE KEY CHANGE ---
    # Construct the full, absolute URL to the Bennu model on your frontend server.
    # Assets in the 'public' folder are served from the root '/'.
    # bennu_model_url = f"{FRONTEND_SERVER_URL}/Bennu.glb"
    bennu_model_url = "/Bennu.glb"
    print(f"Hardcoding model path to: {bennu_model_url}")

    impactor_packet = {
        "id": "impactor2025",
        "position": {
            "epoch": start_time.isoformat(),
            "cartesian": cartesian_data
        },
        "model": {
            "gltf": bennu_model_url, # Use the full URL here
            "minimumPixelSize": 80,
            "scale": 20000.0
        },
        "path": {
            "show": True,
            "width": 2,
            "material": {
                "solidColor": {
                    "color": {"rgba": [255, 0, 0, 255]}
                }
            },
            "leadTime": 0,
            "trailTime": times_seconds[-1]
        }
    }
    czml_packets.append(impactor_packet)

    # --- Write the data to a file ---
    # Saving it in 'Backend/static/impactor2025.czml'
    output_filename = 'static/impactor2025.czml'
    with open(output_filename, 'w') as f:
        json.dump(czml_packets, f, indent=4)

    print(f"CZML file '{output_filename}' has been generated successfully.")


if __name__ == "__main__":
    duration = SIMULATION_DURATION_DAYS
    steps = int(duration * 24 / TIME_STEP_HOURS)

    positions, times = create_curved_trajectory(duration, steps)
    create_czml_manually(positions, times)