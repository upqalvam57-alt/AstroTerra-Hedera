# AstroTerra ☄️

> **A web-based asteroid impact simulator that integrates Hedera Hashgraph services to create tamper-proof, decentralized, and educational simulations.**

AstroTerra Simulator offers an interactive, web-based platform where users can adjust asteroid parameters including size, speed, trajectory, and composition. It allows users to visualize asteroid impact outcomes on Earth while utilizing blockchain technology to ensure data integrity.

---

## Table of Contents
* [Features](#features)
* [Workflow and Project Architecture](#workflow-and-project-architecture)
* [Usage Instructions](#usage-instructions)
* [Disclaimer](#disclaimer)

---

## Features

* **3D Impact Visualization:** Visualize 3D asteroid impacts and their consequences on Earth using real-world data.
* **Mitigation Planning:** Plan and test mitigation strategies, such as kinetic deflection, in a separate simulation environment.
* **Scientific Accuracy:** Utilizes powerful backend simulation programs:
    * **REBOUND** and **NASA SpicePy** for backend physics and orbital mechanics.
    * **CesiumJS** for frontend Earth mapping and visualization.
* **Real-World Data Integration:**
    * **NASA API:** Extracted data to calculate asteroid impact trajectories.
    * **USGS NEIC API:** Used to measure and project the consequences of impacts (seismic data, etc.).
* **Tamper-Proof Logging:** Uses **Hedera Consensus Service (HCS)** to audit simulation phases, ensuring decision logs and results are immutable.
* **Target Audience:** Suitable for policymakers, scientists, and enthusiasts who want to learn more about planetary defense.

---

## Workflow and Project Architecture

### Technical Stack
* **Frontend Visualization:** CesiumJS (Earth Model), Three.JS (3D Objects/Asteroids).
* **Backend Logic:** REBOUND, NASA SpicePy.
* **Data Sources:** NASA API, USGS NEIC API.
* **Data Integrity:** Hedera Consensus Service (HCS), Hedera Mirror Network.

### Data Flow & Consensus
To ensure the analysis of potential asteroid impacts and mitigation strategies is secure and trusted, we utilize the **Hedera Consensus Service (HCS)**.

1.  **Simulation Execution:** A simulation is initialized. There are **6 distinct phases** of the mitigation simulation.
2.  **Auditing:** As the simulation runs, the decisions and responses made during each of the 6 phases are audited.
3.  **Consensus:**
    * Data is sent to the **Hedera Mirror Network**.
    * It is timestamped via the **HCS**.
    * The transaction is committed to the testnet.
4.  **Public Archive:** The audited information is sent to a separate log page. HCS acts as a public archive where users can verify and access other users' simulation runs to ensure data hasn't been tampered with or modified.

---

## Usage Instructions

**Note:** Certain browsers, such as **Brave Browser**, are currently not supported for this simulation. Please use Chrome, Firefox, or Edge for the best experience.

### 1. Main Simulation (Visualizer)
**Link:** [https://astroterrasimulating.netlify.app/](https://astroterrasimulating.netlify.app/)

* **Navigation (Top Right Icons):**
    * 🗺️ **Map Icon:** Choose different map modes.
    * 🌐 **Globe Icon:** Toggle between 2D and 2.5D views.
    * 🏠 **Home Icon:** Reset zoom/view to default.
    * 🔍 **Search Icon:** Search for a specific address/location on the globe.
* **Control Panel (Left Side):**
    * Customize your asteroid parameters or select an existing asteroid type.
    * Choose your **Mitigation Method** and allocate a **Budget** for deflection.
    * View the **Projected Success Probability** at the bottom of the control panel.
* **Execution:**
    * Click **"Execute Mitigation"**.
    * Result: The screen will display either **"Impact avoided"** or **"Mitigation failed! Impact not avoided"**.

### 2. Mitigation Strategy Guide
**Link:** [https://astroterramitigation.netlify.app/](https://astroterramitigation.netlify.app/)

This module guides you through the step-by-step process of saving the planet.

1.  Select **"Impact Simulation Sandbox"** or **"Mitigation Strategy Scenarios"**.
2.  Click on **"Planet Killer : Impactor 2025"** to proceed.
3.  **Phase 1:** Click on **"Task Observation"** until the **"TIME UNTIL IMPACT"** pop-up appears.
    * *Tip:* Time is currency. Every action costs time. Spend it wisely.
4.  **Phase 2:** Enter **"Mitigation Design"**.
    * Customize your impactor design and launch window.
    * A precise design is crucial for a successful mission.
5.  Click **"Launch Mission"** to observe the outcome.

### 3. Hedera Consensus Service (Audit Log)
**Link:** [Insert Link Here]

HCS enables users to view the information audit of the simulations.
* Use the dashboard to see timestamped logs of simulation runs.
* **Filters:** Use date and phase filters to search for specific simulation information.

---

## Disclaimer
> This project is currently under active development. Features and data accuracy may vary as we continue to improve the simulation engines and API integrations.
