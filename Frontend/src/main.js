import './style.css';
import * as Cesium from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";


Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhMjU4NWQ2Ny1lYTdmLTQ4ODItOTk4My04NDQ1YTU2OTgzYWYiLCJpZCI6MzQzMjk4LCJpYXQiOjE3NTg0NjM3NTF9.bwBjRfRrtHpqecI9SWIAFMQM87USrFy1QfqnxsMywO8';

let viewer;

let allNeos = [];
let heatmapDataSource = null;
let targetMarker = null;


let phase1State = {};
let phase1DataSource = null;
let launchPointMarker = null;
let missionState = {};
let impactTime = null;
let mitigationDataSource = null;

const LAUNCH_VEHICLES = {
    falcon_heavy: { name: "Falcon Heavy", cost: 0.15, max_payload_kg: 26700, spec: "Cost: $150M | Max Payload: 26,700 kg", construction_time: 20, reliability: 0.98, escape_burn_hr: 12 },
    sls_block1: { name: "SLS Block 1", cost: 2.0, max_payload_kg: 95000, spec: "Cost: $2.0B | Max Payload: 95,000 kg", construction_time: 40, reliability: 0.92, escape_burn_hr: 4 },
};

const PROPULSION_SYSTEMS = {
    hypergolic: { name: "Hypergolic Bipropellant", cost: 0.05, mass_kg: 500, isp: 320, spec: "Isp: 320s | Mass: 500 kg", construction_time: 5, reliability: 0.99 },
    electric: { name: "Ion Drive (NEXT-C)", cost: 0.1, mass_kg: 800, isp: 4100, spec: "Isp: 4,100s | Mass: 800 kg", construction_time: 10, reliability: 0.95 }
};

const IMPACTOR_MATERIALS = {
    aluminum: { name: "Aluminum", density: 2700, beta: 1.2, spec: "Low density, standard momentum transfer.", max_mass_kg: 5000 },
    tungsten: { name: "Tungsten", density: 19300, beta: 2.5, spec: "High density, high momentum transfer (Beta: 2.5).", max_mass_kg: 20000 }
};
document.addEventListener('DOMContentLoaded', initialize);

function createEarthEntity() {
    viewer.entities.add({
        id: "earth_marker",
        position: Cesium.Cartesian3.ZERO,
        point: {
            pixelSize: 10,
            color: Cesium.Color.DODGERBLUE,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.5, 8.0e7, 0.5)
            },
                label: {
                    text: 'Earth',
                    font: '12pt sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                    pixelOffset: new Cesium.Cartesian2(15, 0),
                    scaleByDistance: new Cesium.NearFarScalar(1.5e8, 1.0, 5.0e10, 0.2),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
        }

function initialize() {
    viewer = new Cesium.Viewer('cesiumContainer', {
        shouldAnimate: true,
        skybox: new Cesium.SkyBox({
            sources: {
                positiveX: '/src/assets/skybox/px.png',
                negativeX: '/src/assets/skybox/nx.png',
                positiveY: '/src/assets/skybox/py.png',
                negativeY: '/src/assets/skybox/ny.png',
                positiveZ: '/src/assets/skybox/pz.png',
                negativeZ: '/src/assets/skybox/nz.png'
            }
        }),
    });

    

    viewer.entities.add({
        name: 'Earth',
        position: Cesium.Cartesian3.ZERO,
        point: {
            pixelSize: 10,
            color: Cesium.Color.DODGERBLUE,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.5, 8.0e7, 0.5)
        },
        label: {
            text: 'Earth',
            font: '12pt sans-serif',
            fillColor: Cesium.Color.WHITE,
            pixelOffset: new Cesium.Cartesian2(0, -20),
            showBackground: true,
            backgroundColor: new Cesium.Color(0, 0, 0, 0.5),
            backgroundPadding: new Cesium.Cartesian2(4, 2),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });

    viewer.clock.onTick.addEventListener(() => { viewer.clock.shouldAnimate = true; });
    viewer.scene.camera.frustum.far = 1e15;
    viewer.scene.globe.enableLighting = true;
    
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1.0;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 1e15;
    
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
    
    viewer.scene.camera.moveEnd.addEventListener(() => {
        const position = viewer.camera.position;
        const direction = viewer.camera.direction;
        
        if (!Cesium.defined(position) || !Cesium.defined(direction) ||
            !isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z) ||
            !isFinite(direction.x) || !isFinite(direction.y) || !isFinite(direction.z)) {
            viewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(-90, 45, 15000000)
            });
        }
    });

    console.log("Cesium Globe initialized successfully!");
    createEarthEntity();

    document.getElementById('heatmap-btn').addEventListener('click', visualizeNeoHeatmap);
    
    document.getElementById('close-dashboard-btn').addEventListener('click', () => {
        document.getElementById('asteroid-dashboard').style.display = 'none';
    });

    document.getElementById('mission-select-btn').addEventListener('click', toggleMissionSelector);
    document.getElementById('start-planet-killer-btn').addEventListener('click', startPhase1Mission);
    document.getElementById('start-city-killer-btn').addEventListener('click', () => {
        alert('This scenario is not yet implemented.');
    });

    document.getElementById('phase1-choice-probe-btn').addEventListener('click', launchCharacterizationProbe);
    document.getElementById('phase1-choice-blind-btn').addEventListener('click', proceedBlind);
    document.getElementById('transition-to-phase2-btn').addEventListener('click', transitionToPhase2);

    document.getElementById('launch-vehicle-select').addEventListener('change', updatePhase2Calculations);
    document.getElementById('propulsion-select').addEventListener('change', updatePhase2Calculations);
    
    document.getElementById('impactor-mass-slider').addEventListener('input', (event) => {
        document.getElementById('impactor-mass-value').textContent = event.target.value;
        updatePhase2Calculations();
    });

    document.getElementById('impactor-material-select').addEventListener('change', () => {
        const materialKey = document.getElementById('impactor-material-select').value;
        const material = IMPACTOR_MATERIALS[materialKey];
        const massSlider = document.getElementById('impactor-mass-slider');
        
        massSlider.max = material.max_mass_kg;
        if (parseInt(massSlider.value) > material.max_mass_kg) {
            massSlider.value = material.max_mass_kg;
        }
        document.getElementById('impactor-mass-value').textContent = massSlider.value;
        updatePhase2Calculations();
    });

document.querySelectorAll('.porkchop-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
        document.querySelectorAll('.porkchop-btn').forEach(b => b.classList.remove('selected'));
        event.currentTarget.classList.add('selected');

        createOrUpdateLaunchPoint(); 

        updatePhase2Calculations();
    });
});

    document.getElementById('launch-mitigation-btn').addEventListener('click', launchMitigationMission);

    viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-90, 45, 15000000) });
    fetchAndPopulateNeoList();
    preloadHeatmapData(false);
    populateCuratedList();
    initializePanels();
    makeTimerDraggable();
}





async function populateCuratedList() {
    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/neos/curated_list`);
        if (!response.ok) throw new Error('Failed to fetch curated NEO list.');
        const data = await response.json();
        const selectElement = document.getElementById('curated-neo-select');
        if (!selectElement) return;
        selectElement.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.textContent = '-- Select an Asteroid --';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        selectElement.appendChild(defaultOption);

        const planetKillerGroup = document.createElement('optgroup');
        planetKillerGroup.label = 'Planet Killers';
        data.planet_killers.forEach(neo => {
            const option = document.createElement('option');
            option.value = neo.spkid; option.textContent = neo.name;
            planetKillerGroup.appendChild(option);
        });
        selectElement.appendChild(planetKillerGroup);

        const cityKillerGroup = document.createElement('optgroup');
        cityKillerGroup.label = 'City Killers';
        data.city_killers.forEach(neo => {
            const option = document.createElement('option');
            option.value = neo.spkid; option.textContent = neo.name;
            cityKillerGroup.appendChild(option);
        });
        selectElement.appendChild(cityKillerGroup);
    } catch (error) {
        console.error("Failed to populate curated NEO list:", error);
    }
}

async function preloadHeatmapData(showByDefault = false) {
    try {
        const neosUrl = `${import.meta.env.VITE_API_URL}/czml/catalog`;
        heatmapDataSource = await Cesium.CzmlDataSource.load(neosUrl);
        
        const dotImage = createDotImage();
        const neoScaleByDistance = new Cesium.NearFarScalar(1.5e8, 1.0, 5.0e9, 0.5);

        heatmapDataSource.entities.values.forEach(entity => {
            const entityType = entity.properties?.entity_type?.getValue();

            if (entityType === 'planet') {
                if (entity.label) {
                    entity.label.scaleByDistance = new Cesium.NearFarScalar(1.5e8, 1.0, 8.0e10, 0.2);
                }
            } else {
                entity.billboard = {
                    image: dotImage,
                    color: getColorByClassification(entity.properties.classification?.getValue()),
                    scaleByDistance: neoScaleByDistance,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                };
                if (entity.label) {
                    entity.label.show = false;
                }
            }
        });

        heatmapDataSource.show = showByDefault;
        await viewer.dataSources.add(heatmapDataSource);
        console.log(`--- Pre-loading complete. ${heatmapDataSource.entities.values.length} total entities ready.`);
    } catch (error) {
        console.error("Failed to pre-load heatmap data:", error);
    }
}

async function visualizeNeoHeatmap() {
    document.getElementById('asteroid-dashboard').style.display = 'block'; 
    viewer.entities.removeAll();
    viewer.dataSources.removeAll(true);
    if (targetMarker) {
        viewer.entities.remove(targetMarker);
        targetMarker = null;
    }
    if (heatmapDataSource) {
        if (!viewer.dataSources.contains(heatmapDataSource)) {
            await viewer.dataSources.add(heatmapDataSource);
        }
        heatmapDataSource.show = true;
        viewer.flyTo(heatmapDataSource, {duration: 2.0});
    } else {
        alert("Heatmap data is still loading or failed to load. Please try again in a moment.");
    }
}
async function fetchAndPopulateNeoList() {
    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/neos/list`);
        if (!response.ok) throw new Error(`Failed to fetch NEO list with status: ${response.status}`);
        allNeos = await response.json();
        // The data is now loaded into the allNeos array for future use.
        const datalist = document.getElementById('asteroid-list');
        datalist.innerHTML = ''; // Clear previous options
        allNeos.forEach(neo => {
            const option = document.createElement('option');
            option.value = neo.name;
            datalist.appendChild(option);
        });
        console.log(`${allNeos.length} NEOs loaded into memory.`);
    } catch (error) {
        console.error("Failed to fetch NEO list:", error);
    }
}

function calculateScale(distance) {
    const near = 1.0e6;
    const far = 2.0e11;
    const nearScale = 20000.0;
    const farScale = 1.0;
    if (distance < near) return nearScale;
    if (distance > far) return farScale;
    const t = (distance - near) / (far - near);
    return Cesium.Math.lerp(nearScale, farScale, t);
}
function createDotImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const context = canvas.getContext('2d');
    context.beginPath();
    context.arc(8, 8, 8, 0, 2 * Math.PI, false);
    context.fillStyle = 'white';
    context.fill();
    return canvas.toDataURL();
}

function getColorByClassification(classification) {
    switch(classification) {
        case 'PLANET_KILLER': return Cesium.Color.RED;
        case 'CITY_KILLER':   return Cesium.Color.ORANGE;
        case 'PHA':           return Cesium.Color.YELLOW;
        default:              return Cesium.Color.CYAN;
    }
}

function toggleMissionSelector() {
    const missionPanel = document.getElementById('mission-selection-panel');
    const isVisible = missionPanel.style.display === 'block';
    missionPanel.style.display = isVisible ? 'none' : 'block';
}
async function startPhase1Mission() {
  try {
    console.log("Initializing Phase 1: Planet Killer Scenario...");

    // 1. Reset and hide general UI
    document.getElementById('main-actions').style.display = 'none';
    document.getElementById('sandbox-controls').style.display = 'none';
    document.getElementById('mission-selection-panel').style.display = 'none';
    document.getElementById('asteroid-dashboard').style.display = 'none'; // Hide dashboard to prevent UI overlap
    viewer.entities.removeAll();
    if(phase1DataSource && viewer.dataSources.contains(phase1DataSource)) {
        viewer.dataSources.remove(phase1DataSource, true);
    }
    // Stop any previous timer events
    viewer.clock.onTick.removeEventListener(updateImpactTimer);
    document.getElementById('impact-timer-container').style.display = 'none';


    // 2. Show the mission panel and the correct starting step
    document.getElementById('phase1-mission-controls').style.display = 'block';
    document.getElementById('phase1-observation-step').style.display = 'block'; // CORRECT ID
    document.getElementById('phase1-decision-step').style.display = 'none';    // CORRECT ID
   document.getElementById('transition-to-phase2-btn').style.display = 'none';

    // 4. Load the CZML trajectory
    const czmlUrl = `${import.meta.env.VITE_API_URL}/static/impactor2025.czml`;
    
    phase1DataSource = await Cesium.CzmlDataSource.load(czmlUrl);
    await viewer.dataSources.add(phase1DataSource);

    // 3. Logic for the "Observe" button
    let observationCount = 0;
    const observeBtn = document.getElementById('phase1-observe-btn');
    const probabilitySpan = document.getElementById('phase1-probability');
    const statusSpan = document.getElementById('phase1-status-text');
    
    // Reset button state for a new scenario run
    observeBtn.disabled = false;
    observeBtn.onclick = () => {
        observationCount++;
        if (observationCount === 1) {
            probabilitySpan.textContent = "35.0%";
            statusSpan.textContent = "Orbit being refined...";
        } else if (observationCount === 2) {
            probabilitySpan.textContent = "87.5%";
            statusSpan.textContent = "Impact corridor narrowing...";
        } else {
            probabilitySpan.textContent = "100.0%";
            statusSpan.textContent = "IMPACT CONFIRMED.";
            observeBtn.disabled = true;

            // Start the impact timer
                      const impactorEntity = phase1DataSource.entities.getById('impactor2025');
                                if (impactorEntity && impactorEntity.position) {
                                    impactTime = viewer.clock.stopTime;
                                    viewer.clock.onTick.addEventListener(updateImpactTimer);
                                    document.getElementById('impact-timer-container').style.display = 'block';
                                }
            // Transition to the decision phase
            document.getElementById('phase1-observation-step').style.display = 'none';
            document.getElementById('phase1-decision-step').style.display = 'block';
        }
    };

    // 5. Synchronize Clock and set speed
    if (phase1DataSource.clock) {
        viewer.clock.startTime = phase1DataSource.clock.startTime.clone();
        viewer.clock.stopTime = phase1DataSource.clock.stopTime.clone();
        viewer.clock.currentTime = phase1DataSource.clock.currentTime.clone();
        viewer.timeline.zoomTo(viewer.clock.startTime, viewer.clock.stopTime);
        viewer.clock.shouldAnimate = true;
        viewer.clock.multiplier = 1; // 1 day per second
        viewer.clock.clockRange = Cesium.ClockRange.CLAMPED; // Stop at the end
    }

  } catch (error) {
    console.error(`Failed to load CZML from ${czmlUrl}:`, error);
    alert("Error: Could not load the mission file from the backend.");
    document.getElementById('controls').style.display = 'block';
    return;
  }

  // 5. Fly the camera to the asteroid
    viewer.flyTo(phase1DataSource, {
        duration: 3.0
      }).then(() => {
          try {
              viewer.camera.zoomOut(2.5e10);
          } catch (error) {
              console.warn("Zoom operation failed, using safe camera position:", error);
              viewer.camera.setView({
                  destination: Cesium.Cartesian3.fromDegrees(-90, 45, 15000000)
              });
          }
      }).catch((error) => {
          console.error("FlyTo operation failed:", error);
      });
    
        // Adjust model scale to be dynamic
        const impactorEntity = phase1DataSource.entities.getById('impactor2025');
        if (impactorEntity && impactorEntity.model) {
            impactorEntity.model.scale = 1.0;
        }    }// --- Add these two new functions anywhere in main.js ---

// In main.js, replace the existing function
// In main.js, replace the existing function
async function launchCharacterizationProbe() {
    missionState.probeLaunched = true; 

    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/simulation/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ launch_probe: true })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || 'Failed to make decision.');
        }
        alert("Decision to LAUNCH probe has been audited on the Hedera network.");
    } catch (error) {
        console.error("Failed to audit decision:", error);
        alert(`Error: ${error.message}`);
    }

    // --- ADDITION: JUMP CLOCK FORWARD 30 DAYS ---
    // This represents the time cost of launching the probe.
    const newTime = Cesium.JulianDate.addDays(viewer.clock.currentTime, 30, new Cesium.JulianDate());
    viewer.clock.currentTime = newTime;
    // --- END OF ADDITION ---

    // 1. Create the DART probe animation
    // The 'startTime' is now correctly set AFTER the 30-day time jump.
    const startTime = viewer.clock.currentTime.clone();
    const probeTravelTime = 60; // 60 seconds for the animation
    const stopTime = Cesium.JulianDate.addSeconds(startTime, probeTravelTime, new Cesium.JulianDate());

    const positionProperty = new Cesium.SampledPositionProperty();
    // Start at Earth
    positionProperty.addSample(startTime, Cesium.Cartesian3.ZERO);
    
    // End at the asteroid's new position after the time jump
    const asteroidEntity = phase1DataSource.entities.getById('impactor2025');
    if (!asteroidEntity) {
        alert("Error: Could not find impactor entity to target.");
        return;
    }
    const asteroidPositionNow = asteroidEntity.position.getValue(startTime);
    positionProperty.addSample(stopTime, asteroidPositionNow);

    const probeEntity = viewer.entities.add({
        name: "Characterization Probe",
        availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: startTime, stop: stopTime })]),
        position: positionProperty,
        model: { uri: '/OSIRIS.glb', scale: 1.0 },
        path: new Cesium.PathGraphics({ width: 1, material: Cesium.Color.CYAN.withAlpha(0.7) })
    });

    // 2. Follow the probe and clean up UI
    viewer.trackedEntity = probeEntity;
    document.querySelectorAll('.consequence-text').forEach(el => el.style.display = 'none');
    document.getElementById('transition-to-phase2-btn').style.display = 'block';
    document.getElementById('phase1-choice-probe-btn').disabled = true;
    document.getElementById('phase1-choice-blind-btn').disabled = true;
}

// In main.js, replace the existing function
async function proceedBlind() {
    console.log("Proceeding with blind launch...");
    missionState.probeLaunched = false;

    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/simulation/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ launch_probe: false })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || 'Failed to make decision.');
        }
        alert("Decision to NOT LAUNCH probe has been audited on the Hedera network.");
    } catch (error) {
        console.error("Failed to audit decision:", error);
        alert(`Error: ${error.message}`);
    }
    
    // Fly camera back to a general Earth view
    viewer.trackedEntity = undefined; // Stop tracking any entity
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-90, 45, 25000000), // High-level view
        duration: 2.5
    });

    // Clean up UI
    document.querySelectorAll('.consequence-text').forEach(el => el.style.display = 'none');
    document.getElementById('transition-to-phase2-btn').style.display = 'block';
    document.getElementById('phase1-choice-probe-btn').disabled = true;
    document.getElementById('phase1-choice-blind-btn').disabled = true;
}
// Add this new function anywhere in main.js
function updateImpactTimer() {
    if (!impactTime) return;

    const currentTime = viewer.clock.currentTime;
    const remainingSeconds = Cesium.JulianDate.secondsDifference(impactTime, currentTime);

    if (remainingSeconds <= 0) {
        document.getElementById('impact-timer-display').textContent = "00:00:00:00";
        // Optionally, stop the listener once impact occurs
        viewer.clock.onTick.removeEventListener(updateImpactTimer);
        // You could trigger an "impact" event here
        return;
    }

    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = Math.floor(remainingSeconds % 60);

    // Format with leading zeros
    const displayString = 
        `${String(days).padStart(2, '0')}:` +
        `${String(hours).padStart(2, '0')}:` +
        `${String(minutes).padStart(2, '0')}:` +
        `${String(seconds).padStart(2, '0')}`;
    
    document.getElementById('impact-timer-display').textContent = displayString;
}
// Add this function if it was removed
function transitionToPhase2() {
    console.log("Transitioning to Phase 2: Mitigation Design Hub.");
    
    // --- REALISM: Set clock to 1x speed for Phase 2 ---
    viewer.clock.multiplier = 1;

    // Hide Phase 1 controls
    document.getElementById('phase1-mission-controls').style.display = 'none';

    // Fly camera back to Earth
    viewer.trackedEntity = undefined;
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-90, 45, 25000000), 
        duration: 2.5 
    });

    // Initialize and show Phase 2 controls
    initializePhase2();
    document.getElementById('phase2-mission-hub').style.display = 'block';
    document.getElementById('phase2-dashboard').style.display = 'block';
}

// REPLACE your existing initializePhase2 function with this one:
function initializePhase2() {
    // 1. Set initial mission budget with a robust check.
    // This guarantees startingBudget is always a number.
    const startingBudget = (missionState.probeLaunched === true) ? 1.80 : 2.0;
    missionState.startingBudget = startingBudget;

    // 2. Populate UI elements from data constants
    const vehicleSelect = document.getElementById('launch-vehicle-select');
    vehicleSelect.innerHTML = '';
    Object.keys(LAUNCH_VEHICLES).forEach(key => {
        const v = LAUNCH_VEHICLES[key];
        vehicleSelect.innerHTML += `<option value="${key}">${v.name}</option>`;
    });

    const propulsionSelect = document.getElementById('propulsion-select');
    propulsionSelect.innerHTML = '';
    Object.keys(PROPULSION_SYSTEMS).forEach(key => {
        const p = PROPULSION_SYSTEMS[key];
        propulsionSelect.innerHTML += `<option value="${key}">${p.name}</option>`;
    });

    const materialSelect = document.getElementById('impactor-material-select');
    materialSelect.innerHTML = '';
    Object.keys(IMPACTOR_MATERIALS).forEach(key => {
        const m = IMPACTOR_MATERIALS[key];
        materialSelect.innerHTML += `<option value="${key}">${m.name}</option>`;
    });

    // 3. Perform the first calculation to populate all fields with default values
    updatePhase2Calculations();
}

function updatePhase2Calculations() {
    // 1. GATHER ALL CURRENT SELECTIONS
    const vehicleKey = document.getElementById('launch-vehicle-select').value;
    const propulsionKey = document.getElementById('propulsion-select').value;
    const impactorMass = parseInt(document.getElementById('impactor-mass-slider').value, 10);
    const selectedTrajectoryBtn = document.querySelector('.porkchop-btn.selected');

    const vehicle = LAUNCH_VEHICLES[vehicleKey];
    const propulsion = PROPULSION_SYSTEMS[propulsionKey];
    
    // Pass impactorMass to the updated dashboard function
    updatePhase2Dashboard(vehicle, propulsion, impactorMass);

    // 2. CALCULATE COSTS & MASS
    const totalCostB = vehicle.cost + propulsion.cost;
    const remainingBudgetB = missionState.startingBudget - totalCostB;
    const spacecraftDryMass = propulsion.mass_kg + impactorMass;
    const maxPayloadKg = vehicle.max_payload_kg;
    const isOverweight = spacecraftDryMass > maxPayloadKg;

    // 3. CALCULATE DELTA-V
    const propellantMass = maxPayloadKg - spacecraftDryMass;
    const totalMass = spacecraftDryMass + propellantMass;
    const g0 = 9.80665;
    const Ve = propulsion.isp * g0;
    const deltaV = propellantMass > 0 ? Ve * Math.log(totalMass / spacecraftDryMass) : 0;

    // 4. VALIDATE MISSION VIABILITY
    let canLaunch = true;
    let launchButtonText = "Launch Mitigation Mission";

    // --- START: Refined Timeline Validation Logic ---
    const REQUIRED_TIME_MARGIN_DAYS = 7; // Require a 7-day margin for intercept before impact.
    const remainingSeconds = Cesium.JulianDate.secondsDifference(impactTime, viewer.clock.currentTime);
    const remainingDays = remainingSeconds / 86400;
    
    // Get the calculated prep time from the dashboard's display.
    const launchPrepTime = parseInt(document.getElementById('status-prep-time').textContent, 10);

    if (selectedTrajectoryBtn) {
        const trajectoryTime = parseInt(selectedTrajectoryBtn.dataset.time, 10);
        const totalMissionTime = launchPrepTime + trajectoryTime;

        // The mission is only valid if it completes with the required margin.
        if (totalMissionTime > (remainingDays - REQUIRED_TIME_MARGIN_DAYS)) {
            canLaunch = false;
            launchButtonText = "Launch Window Closed"; // More professional term
        }
    }
    // --- END: Refined Timeline Validation Logic ---

    // Continue with other validation checks...
    if (remainingBudgetB < 0) {
        canLaunch = false;
        launchButtonText = "Insufficient Budget";
    }
    if (isOverweight) {
        canLaunch = false;
        launchButtonText = "Payload Exceeds Max Mass";
    }
    if (!selectedTrajectoryBtn) {
        canLaunch = false;
        launchButtonText = "Select a Trajectory";
    } else if (canLaunch) { // Only check delta-v if other primary checks have passed.
        const requiredDeltaV = parseInt(selectedTrajectoryBtn.dataset.deltav, 10);
        if (deltaV < requiredDeltaV) {
            canLaunch = false;
            launchButtonText = "Insufficient Δv for Trajectory";
        }
    }
    
    // 5. UPDATE UI DISPLAYS
    const materialKey = document.getElementById('impactor-material-select').value;
    const material = IMPACTOR_MATERIALS[materialKey];
    document.getElementById('phase2-budget-display').textContent = `$${remainingBudgetB.toFixed(2)} B`;
    document.getElementById('phase2-mass-display').textContent = `${spacecraftDryMass.toLocaleString()} / ${maxPayloadKg.toLocaleString()} kg`;
    document.getElementById('phase2-deltav-display').textContent = `${Math.round(deltaV).toLocaleString()} m/s`;
    document.getElementById('launch-vehicle-spec').textContent = vehicle.spec;
    document.getElementById('propulsion-spec').textContent = propulsion.spec;
    document.getElementById('material-spec').textContent = material.spec;
    const launchBtn = document.getElementById('launch-mitigation-btn');
    launchBtn.disabled = !canLaunch;
    launchBtn.textContent = canLaunch ? "Launch Mitigation Mission" : launchButtonText;
    document.getElementById('phase2-budget-display').style.color = remainingBudgetB < 0 ? '#ff4500' : '#4CAF50';
    document.getElementById('phase2-mass-display').style.color = isOverweight ? '#ff4500' : '#4CAF50';
}
// ===============================================================
// --- PHASE 2: MITIGATION HUB LOGIC ---
// ===============================================================

// ADD THIS NEW FUNCTION:
// Replace your existing function with this one
function updatePhase2Dashboard(vehicle, propulsion, impactorMass) {
    // 1. Calculate stats with non-linear penalties for payload complexity.
    const basePrepTime = vehicle.construction_time + propulsion.construction_time;
    
    // The penalty for the payload mass grows based on its complexity (mass in tons).
    const massPrepPenalty = Math.pow(impactorMass / 1000, 1.5) * 5; 

    // Reliability penalty also grows faster for very heavy payloads.
    const massReliabilityPenalty = Math.pow(impactorMass / 10000, 2) * 0.1;

    const totalPrepTime = Math.round(basePrepTime + massPrepPenalty);
    const totalReliability = (vehicle.reliability * propulsion.reliability) - massReliabilityPenalty;
    const escapeBurn = vehicle.escape_burn_hr;

    // 2. Update display
    document.getElementById('status-prep-time').textContent = `${totalPrepTime} days`;
    document.getElementById('status-reliability').textContent = `${(totalReliability * 100).toFixed(1)} %`;
    document.getElementById('status-escape-burn').textContent = `${escapeBurn} hours`;

    // 3. Update color based on reliability
    const reliabilityDisplay = document.getElementById('status-reliability');
    if (totalReliability > 0.97) {
        reliabilityDisplay.style.color = '#4CAF50'; // Green - High Confidence
    } else if (totalReliability > 0.92) {
        reliabilityDisplay.style.color = '#FFC107'; // Yellow - Acceptable Risk
    } else {
        reliabilityDisplay.style.color = '#ff4500'; // Red - High Risk
    }
}
// ===============================================================
// --- UI INTERACTIVITY HELPERS ---
// ===============================================================

function initializePanels() {
    const panels = document.querySelectorAll('.draggable-panel');

    panels.forEach(panel => {
        const header = panel.querySelector('.panel-header');
        const minimizeBtn = panel.querySelector('.minimize-btn');
        const content = panel.querySelector('.panel-content');
        let active = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        // --- Dragging Logic ---
        if (header) {
            header.addEventListener("mousedown", dragStart);
            // Attach end-drag listeners to the whole document
            document.addEventListener("mouseup", dragEnd);
            document.addEventListener("mouseleave", dragEnd);
            document.addEventListener("mousemove", drag);
        }

        function dragStart(e) {
            // Do not drag if clicking the minimize button
            if (e.target === minimizeBtn) {
                return;
            }
            // Make sure the panel being dragged is on top
            panel.style.zIndex = 100;
            
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            active = true;
        }

        function dragEnd(e) {
            if (active) {
                // Reset z-index when drag ends
                panel.style.zIndex = 10;
                initialX = currentX;
                initialY = currentY;
                active = false;
            }
        }

        function drag(e) {
            if (active) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                setTranslate(currentX, currentY, panel);
            }
        }

        function setTranslate(xPos, yPos, el) {
            el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
        }

        // --- Minimizing Logic ---
        // Do not apply minimize logic to the main controls panel
        if (minimizeBtn && content && panel.id !== 'controls') {
            minimizeBtn.addEventListener('click', () => {
                const isMinimized = content.classList.toggle('minimized');
                minimizeBtn.textContent = isMinimized ? '' : ''; // Using FontAwesome-like icons
                minimizeBtn.title = isMinimized ? 'Restore' : 'Minimize';
            });
        } else if (minimizeBtn && panel.id === 'controls') {
            // If it's the main controls panel, hide the minimize button entirely
            minimizeBtn.style.display = 'none';
        }
    });
}

// --- Add this entire new function ---
function makeTimerDraggable() {
    const timer = document.getElementById('impact-timer-container');
    if (!timer) return;

    let offsetX, offsetY;
    let isDragging = false;

    const onMouseDown = (e) => {
        isDragging = true;
        // When we start dragging, we remove the transform so we can control position directly
        timer.style.transform = 'none'; 
        
        offsetX = e.clientX - timer.offsetLeft;
        offsetY = e.clientY - timer.offsetTop;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        e.preventDefault(); // Prevent text selection while dragging
        timer.style.left = `${e.clientX - offsetX}px`;
        timer.style.top = `${e.clientY - offsetY}px`;
    };

    const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    timer.addEventListener('mousedown', onMouseDown);
}

// ===============================================================
// --- PHASE 3: CRUISE & MISSION OPS LOGIC ---
// ===============================================================

// --- Add this entire new function ---
function createOrUpdateLaunchPoint() {
    // If the marker already exists, we don't need to do anything.
    if (launchPointMarker) {
        return;
    }

    // Coordinates for Cape Canaveral, Florida
    const launchLatitude = 28.5729;
    const launchLongitude = -80.6490;

    // Create the entity
    launchPointMarker = viewer.entities.add({
        name: 'Launch Site',
        position: Cesium.Cartesian3.fromDegrees(launchLongitude, launchLatitude),
        point: {
            pixelSize: 12,
            color: Cesium.Color.LIMEGREEN,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY // Always visible
        },
        label: {
            text: 'Launch Point',
            font: '12pt sans-serif',
            fillColor: Cesium.Color.WHITE,
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
            pixelOffset: new Cesium.Cartesian2(15, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });

    console.log("Launch point marker created at Cape Canaveral.");
}

/* --- Frontend/src/main.js --- */
// Find the launchMitigationMission function and REPLACE it with this simplified version.
// Also DELETE the 'startThreeJsSimulation' function entirely to fix your error.

async function launchMitigationMission() {
    console.log("--- PHASE 3: LAUNCHING (MOCKUP MODE) ---");

    const launchBtn = document.getElementById('launch-mitigation-btn');
    launchBtn.disabled = true;
    launchBtn.textContent = "LAUNCHING...";

    // Simulate a brief "processing" delay for effect
    setTimeout(() => {
        // 1. Just open the Phase 3 window directly
        // We assume Phase 3 is running on port 5176 as per your previous setup
        window.open("http://localhost:5176", "_blank");

        // 2. Reset UI
        launchBtn.textContent = "Mission Launched";
        
        // Optional: Update UI to show we are done
        document.getElementById('phase2-mission-hub').style.display = 'none';
        document.getElementById('phase3-mission-ops').style.display = 'block';
        document.getElementById('link-to-phase3-btn').style.display = 'block';
    }, 1000);
}