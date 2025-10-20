

import './style.css';
import * as Cesium from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";

// --- CESIUM ION ACCESS TOKEN ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhMjU4NWQ2Ny1lYTdmLTQ4ODItOTk4My04NDQ1YTU2OTgzYWYiLCJpZCI6MzQzMjk4LCJpYXQiOjE3NTg0NjM3NTF9.bwBjRfRrtHpqecI9SWIAFMQM87USrFy1QfqnxsMywO8';

// --- GLOBAL VARIABLES ---
let viewer;

let allNeos = [];
let heatmapDataSource = null;

// --- SANDBOX GLOBALS ---
let impactTarget = null;
let targetMarker = null;
let sandboxState = 'inactive'; // inactive, selecting_asteroid, selecting_target, ready_to_launch

// --- Add these under your SANDBOX GLOBALS ---
let phase1State = {};
let phase1DataSource = null;
let launchPointMarker = null;
// --- Add this near your other global variables ---
let missionState = {};
// --- Add this near your other global variables ---
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

// This one needs a new property for our slider logic
const IMPACTOR_MATERIALS = {
    aluminum: { name: "Aluminum", density: 2700, beta: 1.2, spec: "Low density, standard momentum transfer.", max_mass_kg: 5000 },
    tungsten: { name: "Tungsten", density: 19300, beta: 2.5, spec: "High density, high momentum transfer (Beta: 2.5).", max_mass_kg: 20000 }
};
// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initialize);

// --- Place this entire new function BEFORE the initialize() function ---
function createEarthEntity() {
    viewer.entities.add({
        id: "earth_marker",
        position: Cesium.Cartesian3.ZERO,
        point: {
            pixelSize: 10,
            color: Cesium.Color.DODGERBLUE,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
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

// REPLACE your entire initialize function with this one:
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

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction(handleGlobeClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.entities.add({
        name: 'Earth',
        position: Cesium.Cartesian3.ZERO,
        point: {
            pixelSize: 10,
            color: Cesium.Color.DODGERBLUE,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
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
    viewer.scene.camera.frustum.far = Number.POSITIVE_INFINITY;
    viewer.scene.globe.enableLighting = true;

    console.log("Cesium Globe initialized successfully!");
    createEarthEntity();

    // --- General Listeners ---
    document.getElementById('heatmap-btn').addEventListener('click', visualizeNeoHeatmap);
    document.getElementById('sandbox-init-btn').addEventListener('click', startSandboxMode);
    document.getElementById('curated-neo-select').addEventListener('change', handleSandboxAsteroidSelection);
    document.getElementById('launch-btn').addEventListener('click', launchSimpleImpact);
    document.getElementById('close-dashboard-btn').addEventListener('click', () => {
        document.getElementById('asteroid-dashboard').style.display = 'none';
    });

    // --- Mission Listeners ---
    document.getElementById('mission-select-btn').addEventListener('click', toggleMissionSelector);
    document.getElementById('start-planet-killer-btn').addEventListener('click', startPhase1Mission);
    document.getElementById('start-city-killer-btn').addEventListener('click', () => {
        alert('This scenario is not yet implemented.');
    });

    // --- Phase 1 Listeners ---
    document.getElementById('phase1-choice-probe-btn').addEventListener('click', launchCharacterizationProbe);
    document.getElementById('phase1-choice-blind-btn').addEventListener('click', proceedBlind);
    document.getElementById('transition-to-phase2-btn').addEventListener('click', transitionToPhase2);

    // --- Phase 2 Listeners ---
    document.getElementById('launch-vehicle-select').addEventListener('change', updatePhase2Calculations);
    document.getElementById('propulsion-select').addEventListener('change', updatePhase2Calculations);
    
    // *** THIS IS THE NEW LISTENER FOR THE SLIDER ***
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
        // 1. Handle the highlighting UI
        document.querySelectorAll('.porkchop-btn').forEach(b => b.classList.remove('selected'));
        event.currentTarget.classList.add('selected');

        // 2. Create the visual launch point on the globe
        createOrUpdateLaunchPoint(); // <-- THIS IS THE NEW LINE

        // 3. Update all mission calculations
        updatePhase2Calculations();
    });
});

    // --- ADD THIS NEW LISTENER FOR THE LAUNCH BUTTON ---
    document.getElementById('launch-mitigation-btn').addEventListener('click', launchMitigationMission);

    // --- Final Setup ---
    viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-90, 45, 15000000) });
    fetchAndPopulateNeoList();
    preloadHeatmapData(false);
    populateCuratedList();
    makePanelsDraggable();
    setupPanelToggles();
    makeTimerDraggable();
}

// --- SANDBOX WORKFLOW ---

function startSandboxMode() {
    sandboxState = 'selecting_asteroid';
    document.getElementById('asteroid-dashboard').style.display = 'none'; // Hide dashboard
    
    // Reset UI
    viewer.entities.removeAll();
    if (heatmapDataSource) heatmapDataSource.show = false;
    impactTarget = null;
    if(targetMarker) {
        viewer.entities.remove(targetMarker);
        targetMarker = null;
    }

    // Configure UI for sandbox mode
    document.getElementById('sandbox-controls').style.display = 'block';
    document.getElementById('sandbox-init-btn').disabled = true;
    document.getElementById('launch-btn').disabled = true;
    updateSandboxInstructions();
}

function handleSandboxAsteroidSelection() {
    if (sandboxState === 'selecting_asteroid') {
        sandboxState = 'selecting_target';
        updateSandboxInstructions();
    }
}

function handleGlobeClick(movement) {
    if (sandboxState !== 'selecting_target') return; // Only handle clicks when in the right state

    const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
    if (cartesian) {
        impactTarget = cartesian;
        sandboxState = 'ready_to_launch';

        if (!targetMarker) {
            targetMarker = viewer.entities.add({
                name: 'Impact Target',
                position: cartesian,
                point: { pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 }
            });
        } else {
            targetMarker.position = cartesian;
        }
        updateSandboxInstructions();
        document.getElementById('launch-btn').disabled = false; // Enable launch button
    }
}

function launchSimpleImpact() {
    if (sandboxState !== 'ready_to_launch') return;

    const selectElement = document.getElementById('curated-neo-select');
    const asteroidName = selectElement.options[selectElement.selectedIndex].text;

    console.log(`Launching ${asteroidName} towards target.`);
    if(targetMarker) viewer.entities.add(targetMarker); // Ensure marker stays

    const startPosition = Cesium.Cartesian3.multiplyByScalar(Cesium.Cartesian3.normalize(impactTarget, new Cesium.Cartesian3()), 500000, new Cesium.Cartesian3());
    const endPosition = impactTarget;
    const totalSeconds = 10;
    const startTime = viewer.clock.currentTime.clone();
    const stopTime = Cesium.JulianDate.addSeconds(startTime, totalSeconds, new Cesium.JulianDate());

    const positionProperty = new Cesium.SampledPositionProperty();
    positionProperty.addSample(startTime, startPosition);
    positionProperty.addSample(stopTime, endPosition);

    const asteroidEntity = viewer.entities.add({
        name: asteroidName,
        availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: startTime, stop: stopTime })]),
        position: positionProperty,
        model: { uri: 'Bennu.glb', minimumPixelSize: 64 },
        path: new Cesium.PathGraphics({ width: 2, material: Cesium.Color.ORANGE.withAlpha(0.5) })
    });

    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 1;
    viewer.timeline.zoomTo(startTime, stopTime);
    viewer.flyTo(asteroidEntity);

    // Reset for next scenario
    resetSandbox();
}

function resetSandbox() {
    sandboxState = 'inactive';
    document.getElementById('sandbox-controls').style.display = 'none';
    document.getElementById('sandbox-init-btn').disabled = false;
    updateSandboxInstructions();
}

function updateSandboxInstructions() {
    const instructionsP = document.getElementById('sandbox-instructions');
    if (!instructionsP) return;

    switch (sandboxState) {
        case 'selecting_asteroid':
            instructionsP.textContent = '1. Select an asteroid from the list.';
            break;
        case 'selecting_target':
            instructionsP.textContent = '2. Click on the globe to set an impact target.';
            break;
        case 'ready_to_launch':
            instructionsP.textContent = '3. Target acquired. Press Launch!';
            break;
        default:
            instructionsP.textContent = 'Welcome to the Sandbox!';
            break;
    }
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

// --- EXISTING / DEPRECATED FUNCTIONS ---

// In main.js

async function preloadHeatmapData(showByDefault = false) {
    try {
        const neosUrl = `${import.meta.env.VITE_API_URL}/czml/catalog`;
        heatmapDataSource = await Cesium.CzmlDataSource.load(neosUrl);
        
        // --- REPLACE THE OLD forEach LOOP WITH THIS NEW LOGIC ---
        const dotImage = createDotImage();
        const neoScaleByDistance = new Cesium.NearFarScalar(1.5e8, 1.0, 5.0e9, 0.5);

        heatmapDataSource.entities.values.forEach(entity => {
            const entityType = entity.properties?.entity_type?.getValue();

            if (entityType === 'planet') {
                // It's a planet, so we trust the styling from the CZML
                // and just ensure the label is visible.
                if (entity.label) {
                    entity.label.scaleByDistance = new Cesium.NearFarScalar(1.5e8, 1.0, 8.0e10, 0.2);
                }
            } else {
                // It's an asteroid, apply the billboard and classification color
                entity.billboard = {
                    image: dotImage,
                    color: getColorByClassification(entity.properties.classification?.getValue()),
                    scaleByDistance: neoScaleByDistance,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                };
                // Hide asteroid labels by default to reduce clutter
                if (entity.label) {
                    entity.label.show = false;
                }
            }
        });
        // --- END OF REPLACEMENT ---

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

// --- HELPER FUNCTIONS ---

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

// ===============================================================
// --- PHASE 1: MISSION LOGIC ---
// ===============================================================

// --- Add this new function ---
function toggleMissionSelector() {
    const missionPanel = document.getElementById('mission-selection-panel');
    const isVisible = missionPanel.style.display === 'block';
    missionPanel.style.display = isVisible ? 'none' : 'block';
}
// --- ADD THIS NEW IMPLEMENTATION ---
// In main.js

// In main.js
// In main.js, replace the entire function
// In main.js

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
          viewer.camera.zoomOut(2.5e10);
      });
    
        // Adjust model scale to be dynamic
        const impactorEntity = phase1DataSource.entities.getById('impactor2025');
        if (impactorEntity && impactorEntity.model) {
            impactorEntity.model.scale = new Cesium.CallbackProperty(function(time, result) {
                const modelPosition = impactorEntity.position.getValue(time, result);
                if (modelPosition) {
                    const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, modelPosition);
                    return calculateScale(distance);
                }
                return 20000.0; // default scale
            }, false);
        }    }// --- Add these two new functions anywhere in main.js ---

// In main.js, replace the existing function
// In main.js, replace the existing function
function launchCharacterizationProbe() {
    missionState.probeLaunched = true; 
    alert("You have chosen to launch a characterization probe. This will provide vital data but costs precious time and $200M from your budget.");

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
        model: { uri: '/OSIRIS.glb', minimumPixelSize: 48 },
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
function proceedBlind() {
    console.log("Proceeding with blind launch...");
    missionState.probeLaunched = false;
    alert("You have chosen to proceed directly to mitigation design. This saves time, but you will be operating with less precise data, increasing the risk of failure.");
    
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

function makePanelsDraggable() {
    const panels = document.querySelectorAll('.draggable-panel');
    let activePanel = null;
    let offsetX, offsetY;

    const onMouseDown = (e, panel) => {
        if (e.target.classList.contains('minimize-btn')) return; // Don't drag when clicking minimize
        activePanel = panel;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!activePanel) return;
        e.preventDefault();
        activePanel.style.left = `${e.clientX - offsetX}px`;
        activePanel.style.top = `${e.clientY - offsetY}px`;
    };

    const onMouseUp = () => {
        activePanel = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    panels.forEach(panel => {
        const header = panel.querySelector('.panel-header');
        if (header) {
            header.addEventListener('mousedown', (e) => onMouseDown(e, panel));
        }
    });
}

function setupPanelToggles() {
    const panels = document.querySelectorAll('.draggable-panel');
    panels.forEach(panel => {
        const minimizeBtn = panel.querySelector('.minimize-btn');
        const content = panel.querySelector('.panel-content');
        if (minimizeBtn && content) {
            minimizeBtn.addEventListener('click', () => {
                content.classList.toggle('minimized');
            });
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

async function launchMitigationMission() {
    console.log("--- PHASE 3: LAUNCHING MITIGATION MISSION ---");

    const launchBtn = document.getElementById('launch-mitigation-btn');
    launchBtn.disabled = true;
    launchBtn.textContent = "CALCULATING TRAJECTORY...";

    // 1. GATHER DATA FROM THE UI
    const vehicleKey = document.getElementById('launch-vehicle-select').value;
    const trajectoryBtn = document.querySelector('.porkchop-btn.selected');
    const launchPrepTimeDays = parseInt(document.getElementById('status-prep-time').textContent, 10);

    // 2. CALCULATE THE PRECISE LAUNCH TIME
    const currentTime = viewer.clock.currentTime;
    const actualLaunchTime = Cesium.JulianDate.addDays(currentTime, launchPrepTimeDays, new Cesium.JulianDate());
    const launchTimeISO = Cesium.JulianDate.toIso8601(actualLaunchTime, 0) + 'Z';
    
    console.log(`Current Sim Time: ${Cesium.JulianDate.toIso8601(currentTime)}`);
    console.log(`Prep Time: ${launchPrepTimeDays} days`);
    console.log(`Calculated Launch Time for Backend: ${launchTimeISO}`);

    // 3. CONSTRUCT THE PAYLOAD FOR THE BACKEND
    const payload = {
        trajectory: {
            travel_time_days: parseInt(trajectoryBtn.dataset.time, 10),
            required_deltav: parseInt(trajectoryBtn.dataset.deltav, 10)
        },
        launchTimeISO: launchTimeISO
    };

    try {
        // 4. SEND DATA TO THE BACKEND
        const response = await fetch(`${import.meta.env.VITE_API_URL}/simulation/launch_mitigation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();

        // 5. TRANSITION THE UI FROM PHASE 2 TO PHASE 3
        document.getElementById('phase2-mission-hub').style.display = 'none';
        document.getElementById('impact-timer-container').style.borderColor = '#00ffff'; // Change timer color to cyan for cruise phase
        document.getElementById('phase3-mission-ops').style.display = 'block';

        // 6. LOAD THE NEW TRAJECTORY DATA INTO CESIUM
        if (mitigationDataSource) {
            viewer.dataSources.remove(mitigationDataSource, true);
        }
        mitigationDataSource = await Cesium.CzmlDataSource.load(result.czml);
        await viewer.dataSources.add(mitigationDataSource);

        // 7. ADVANCE THE GAME CLOCK and FLY THE CAMERA
        // The player "experiences" the prep time passing instantly.
        viewer.clock.currentTime = actualLaunchTime.clone();
        
        const vehicleEntity = mitigationDataSource.entities.getById('mitigation_vehicle');
        if (vehicleEntity) {
            viewer.flyTo(vehicleEntity, { duration: 5.0, offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.toRadians(45), 5000000) });
            viewer.trackedEntity = vehicleEntity;
        }

    } catch (error) {
        console.error("Failed to launch mitigation mission:", error);
        alert(`Launch Failed: ${error.message}`);
        launchBtn.disabled = false; // Re-enable the button on failure
        launchBtn.textContent = "Launch Mitigation Mission";
    }
}