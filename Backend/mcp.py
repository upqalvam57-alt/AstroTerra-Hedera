# In Backend/mcp.py

import os
from flask import Flask, request, jsonify
import spiceypy

# --- MCP Tool Decorator (A helper to register functions as tools) ---
mcp_tools = {}
def mcp_tool(func):
    """Decorator that registers a function as an MCP tool for the AI to use."""
    mcp_tools[func.__name__] = {
        "description": func.__doc__,
        "function": func
    }
    return func

# --- Flask App and Kernel Setup ---
app = Flask(__name__)
KERNELS_LOADED = False

# --- Tool Implementations ---

@mcp_tool
def setup_spice_kernels() -> dict:
    """
    Loads all necessary SPICE kernels from the 'Backend/kernels' directory.
    This MUST be run before any other SpicePy tool that requires kernel data.
    It uses the 'meta_kernel.txt' file to load all other kernels.
    """
    global KERNELS_LOADED
    kernel_dir = os.path.join(os.path.dirname(__file__), 'kernels')
    meta_kernel_path = os.path.join(kernel_dir, 'meta_kernel.txt')

    if not os.path.exists(meta_kernel_path):
        return {"status": "ERROR", "message": "meta_kernel.txt not found in the kernels directory."}
        
    try:
        spiceypy.furnsh(meta_kernel_path)
        KERNELS_LOADED = True
        kernel_count = spiceypy.ktotal('ALL')
        return {"status": "SUCCESS", "message": f"All {kernel_count} kernels loaded successfully from the meta-kernel."}
    except Exception as e:
        return {"status": "ERROR", "message": f"Failed to load kernels: {str(e)}"}

@mcp_tool
def get_object_position(target: str, time_utc: str, observer: str = 'EARTH') -> dict:
    """
    Gets the J2000 position vector [x, y, z] of a target celestial body 
    relative to an observer at a specific UTC time.
    Requires SPICE kernels to be loaded first using the setup_spice_kernels() tool.

    Args:
        target (str): The name or NAIF ID of the target body (e.g., 'Eros', '433').
        time_utc (str): The UTC time string (e.g., '2025-12-25T12:00:00').
        observer (str): The observing body. Defaults to 'EARTH'.

    Returns:
        dict: A dictionary with the position vector in km or an error message.
    """
    if not KERNELS_LOADED:
        return {"error": "SPICE kernels are not loaded. Please run setup_spice_kernels() first."}
    
    try:
        et = spiceypy.utc2et(time_utc)
        position, _ = spiceypy.spkpos(target, et, 'J2000', 'NONE', observer)
        return {"target": target, "observer": observer, "time_utc": time_utc, "position_km": position.tolist()}
    except Exception as e:
        return {"error": f"Could not find position. SpicePy Error: {str(e)}"}


# --- API Endpoints for the MCP Server ---

@app.route('/tools', methods=['GET'])
def list_tools():
    """This is the endpoint the AI client calls to see what tools are available."""
    tool_specs = {name: {"description": data["description"]} for name, data in mcp_tools.items()}
    return jsonify(tool_specs)

@app.route('/execute/<tool_name>', methods=['POST'])
def execute_tool(tool_name):
    """This is the endpoint the AI client calls to run a specific tool."""
    if tool_name not in mcp_tools:
        return jsonify({"error": f"Tool '{tool_name}' not found"}), 404
    
    try:
        args = request.json
        result = mcp_tools[tool_name]["function"](**args)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Main Entry Point to Run the Server ---
if __name__ == '__main__':
    print("Starting Astro MCP Server on http://0.0.0.0:5001...")
    print("Press CTRL+C to stop the server.")
    # THIS IS THE FIX: host='0.0.0.0' makes the server accessible to other programs
    app.run(host='0.0.0.0', port=5001)