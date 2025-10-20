# Backend/download_kernels.py
import requests
import os

# --- KERNEL CONFIGURATION ---
# This version uses a stable, hardcoded link to a general-purpose asteroid kernel.
# This avoids the previous errors caused by changing filenames.
KERNELS = {
    "naif0012.tls": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
    "pck00010.tpc": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00010.tpc",
    "de440.bsp": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp",
    "codes_300ast_20100725.bsp": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/asteroids/codes_300ast_20100725.bsp",
}

def create_meta_kernel(kernel_list, base_dir):
    """Creates the meta_kernel.txt file with the correct relative paths."""
    meta_kernel_path = os.path.join(base_dir, 'kernels', 'meta_kernel.txt')
    print(f" -> Creating/updating meta-kernel file: {meta_kernel_path}")
    
    with open(meta_kernel_path, 'w') as f:
        f.write('\\begindata\n')
        f.write('    KERNELS_TO_LOAD = (\n')
        for kernel in kernel_list:
            # Use forward slashes for SPICE compatibility
            f.write(f"        'kernels/{kernel}',\n")
        f.write('    )\n')
        f.write('\\beginintext\n')
    print(" -> Meta-kernel is ready.")

def download_kernels():
    """Checks for and downloads required SPICE kernels if they are missing."""
    base_dir = os.path.dirname(__file__)
    kernels_dir = os.path.join(base_dir, 'kernels')
    os.makedirs(kernels_dir, exist_ok=True)
    print(f"--- Ensuring kernels are present in '{kernels_dir}' ---")

    downloaded_files = []
    all_files_present = True

    for filename, url in KERNELS.items():
        filepath = os.path.join(kernels_dir, filename)
        if not os.path.exists(filepath):
            print(f"Downloading '{filename}'...")
            try:
                response = requests.get(url, stream=True, timeout=30)
                response.raise_for_status()
                with open(filepath, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                print(f" -> Success: '{filename}' downloaded.")
                downloaded_files.append(filename)
            except requests.RequestException as e:
                print(f" -> FATAL ERROR downloading '{filename}'. Cannot proceed. Error: {e}")
                if os.path.exists(filepath): os.remove(filepath)
                all_files_present = False
                break # Stop if any file fails to download
        else:
            print(f" -> Found '{filename}' already present.")
            downloaded_files.append(filename)
    
    print("-" * 20)
    if all_files_present and len(downloaded_files) == len(KERNELS):
        create_meta_kernel(downloaded_files, base_dir)
        print("\n--- KERNEL SETUP COMPLETE. All files are ready. ---")
    else:
        print("\n--- KERNEL SETUP FAILED. Not all files were secured. ---")

if __name__ == "__main__":
    download_kernels()