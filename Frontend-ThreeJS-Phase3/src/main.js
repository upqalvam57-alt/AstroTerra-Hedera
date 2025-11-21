import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- CONFIGURATION ---
const CONFIG = {
    sunSize: 10,
    earthSize: 2,
    asteroidSize: 0.8,
    shipSize: 0.3,
    gridSize: 200,
    // Positions (Tactical Scale - not real scale)
    sunPos: new THREE.Vector3(0, 0, 0),
    earthPos: new THREE.Vector3(30, 0, 0),
    asteroidPos: new THREE.Vector3(60, 10, -20),
    startShipPos: new THREE.Vector3(35, 0, 0), // Near Earth
};

// --- GLOBALS ---
let scene, camera, renderer, controls;
let ship, sun, earth, asteroid;
let currentTrajectoryLine, plannedTrajectoryLine;
let uncertaintySphere;
let engineGlow;
let animationId;
let time = 0;

// State
let missionState = 'DRIFT'; // DRIFT, PLANNING, BURNING, INTERCEPT

// --- INITIALIZATION ---
function init() {
    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005); // Deep blue-black
    scene.fog = new THREE.FogExp2(0x000005, 0.015);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(40, 20, 40); // Tactical view position

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // 4. Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.copy(CONFIG.startShipPos); // Focus on ship area initially

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0x333333);
    scene.add(ambientLight);

    const sunLight = new THREE.PointLight(0xffffff, 2, 300);
    sunLight.position.copy(CONFIG.sunPos);
    scene.add(sunLight);

    // 6. Create Objects
    createStarfield();
    createSun();
    createEarth();
    createAsteroid();
    createShip();
    createTrajectories();
    createUncertaintyEllipsoid();

    // 7. Setup UI Listeners
    setupUI();

    // 8. Hide Loading Screen
    setTimeout(() => {
        document.getElementById('loading').style.opacity = 0;
        setTimeout(() => document.getElementById('loading').remove(), 1000);
    }, 1500);

    // 9. Start Loop
    animate();
}

// --- OBJECT CREATION ---

function createStarfield() {
    const geometry = new THREE.BufferGeometry();
    const count = 3000;
    const positions = new Float32Array(count * 3);
    for(let i=0; i<count*3; i++) positions[i] = (Math.random() - 0.5) * 400;
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ size: 0.15, color: 0xffffff });
    scene.add(new THREE.Points(geometry, material));
}

function createSun() {
    const geo = new THREE.SphereGeometry(CONFIG.sunSize, 32, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    sun = new THREE.Mesh(geo, mat);
    
    // Sun Glow (Sprite)
    const spriteMat = new THREE.SpriteMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Sprite(spriteMat);
    glow.scale.set(40, 40, 1);
    sun.add(glow);
    
    scene.add(sun);
}

function createEarth() {
    const geo = new THREE.SphereGeometry(CONFIG.earthSize, 32, 32);
    const mat = new THREE.MeshPhongMaterial({ 
        color: 0x2233ff, 
        emissive: 0x112244,
        specular: 0x555555,
        shininess: 10
    });
    earth = new THREE.Mesh(geo, mat);
    earth.position.copy(CONFIG.earthPos);
    scene.add(earth);
}

function createAsteroid() {
    // Dodecahedron looks like a rock
    const geo = new THREE.DodecahedronGeometry(CONFIG.asteroidSize, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
    asteroid = new THREE.Mesh(geo, mat);
    asteroid.position.copy(CONFIG.asteroidPos);
    scene.add(asteroid);
}

function createShip() {
    // A simple cone for the ship
    const geo = new THREE.ConeGeometry(0.2, 0.8, 8);
    // Rotate geometry so the tip points +Z
    geo.rotateX(Math.PI / 2); 
    const mat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x004444 });
    ship = new THREE.Mesh(geo, mat);
    ship.position.copy(CONFIG.startShipPos);
    
    // Engine Glow (Hidden initially)
    const spriteMat = new THREE.SpriteMaterial({ 
        color: 0xff4500, 
        transparent: true, 
        opacity: 0,
        blending: THREE.AdditiveBlending
    });
    engineGlow = new THREE.Sprite(spriteMat);
    engineGlow.scale.set(2, 2, 1);
    engineGlow.position.set(0, 0, -0.5); // Behind ship
    ship.add(engineGlow);

    scene.add(ship);
}

function createTrajectories() {
    // 1. Drift Trajectory (Red - Misses target)
    const driftPoints = [];
    for(let i=0; i<=50; i++) {
        const t = i/50;
        // Linear interpolation that misses
        const p = new THREE.Vector3().lerpVectors(CONFIG.startShipPos, new THREE.Vector3(65, -5, -25), t);
        driftPoints.push(p);
    }
    const driftGeo = new THREE.BufferGeometry().setFromPoints(driftPoints);
    const driftMat = new THREE.LineDashedMaterial({ 
        color: 0xff0000, 
        dashSize: 1, 
        gapSize: 0.5, 
        opacity: 0.6, 
        transparent: true 
    });
    currentTrajectoryLine = new THREE.Line(driftGeo, driftMat);
    currentTrajectoryLine.computeLineDistances(); // Required for dashed lines
    scene.add(currentTrajectoryLine);

    // 2. Planned Trajectory (Green - Hits target) - Hidden Initially
    const planPoints = [];
    // Quadratic Bezier curve for a nice orbital arc
    const curve = new THREE.QuadraticBezierCurve3(
        CONFIG.startShipPos,
        new THREE.Vector3(50, 5, -10), // Control point
        CONFIG.asteroidPos
    );
    const points = curve.getPoints(50);
    
    const planGeo = new THREE.BufferGeometry().setFromPoints(points);
    const planMat = new THREE.LineBasicMaterial({ color: 0x00ff00, opacity: 0.8, transparent: true });
    plannedTrajectoryLine = new THREE.Line(planGeo, planMat);
    plannedTrajectoryLine.visible = false;
    scene.add(plannedTrajectoryLine);
}

function createUncertaintyEllipsoid() {
    // A semi-transparent sphere around the asteroid
    const geo = new THREE.SphereGeometry(3, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0xff0000, 
        wireframe: true, 
        transparent: true, 
        opacity: 0.3 
    });
    uncertaintySphere = new THREE.Mesh(geo, mat);
    uncertaintySphere.position.copy(CONFIG.asteroidPos);
    scene.add(uncertaintySphere);
}

// --- INTERACTION LOGIC ---

function setupUI() {
    const planBtn = document.getElementById('plan-btn');
    const executeBtn = document.getElementById('execute-btn');
    const statusText = document.getElementById('mission-status');
    const probDisplay = document.getElementById('prob-display');

    planBtn.addEventListener('click', () => {
        if (missionState !== 'DRIFT') return;
        
        missionState = 'PLANNING';
        statusText.textContent = "STATUS: MANEUVER CALCULATED. AWAITING CONFIRMATION.";
        statusText.style.color = "#ffff00"; // Yellow
        
        // Show Green Line, Fade Red Line
        plannedTrajectoryLine.visible = true;
        currentTrajectoryLine.material.opacity = 0.2;

        // Shrink Uncertainty
        uncertaintySphere.material.color.setHex(0xffff00);
        
        // Update UI
        planBtn.disabled = true;
        executeBtn.disabled = false;
        executeBtn.classList.add('primary');

        // Animate Probability
        let prob = 12.4;
        const interval = setInterval(() => {
            prob += 5;
            if (prob >= 98.5) {
                prob = 98.5;
                clearInterval(interval);
                probDisplay.style.color = "#00ff00";
            }
            probDisplay.textContent = prob.toFixed(1) + "%";
        }, 50);
    });

    executeBtn.addEventListener('click', () => {
        if (missionState !== 'PLANNING') return;

        missionState = 'BURNING';
        statusText.textContent = "STATUS: EXECUTING BURN...";
        statusText.style.color = "#00ffff"; // Cyan
        
        executeBtn.disabled = true;
        
        // Visuals
        engineGlow.material.opacity = 1;
        uncertaintySphere.scale.set(0.2, 0.2, 0.2); // Massive confidence boost
        uncertaintySphere.material.color.setHex(0x00ff00);

        // Deduct Delta V
        document.getElementById('deltav-display').textContent = "3,850 m/s";

        // Start Movement
        setTimeout(() => {
            engineGlow.material.opacity = 0; // Cut engines
            missionState = 'INTERCEPT';
            statusText.textContent = "STATUS: ON INTERCEPT COURSE";
            statusText.style.color = "#00ff00";
        }, 2000); // 2 second burn
    });
}

// --- ANIMATION LOOP ---

function animate() {
    requestAnimationFrame(animate);

    time += 0.005;

    // 1. Rotate Bodies
    if (earth) earth.rotation.y += 0.002;
    if (asteroid) asteroid.rotation.x += 0.005; asteroid.rotation.y += 0.005;
    if (uncertaintySphere) uncertaintySphere.rotation.z -= 0.002;

    // 2. Ship Movement Logic
    if (ship) {
        if (missionState === 'INTERCEPT') {
            // Move along the Green path (Quadratic Bezier)
            // We approximate by moving towards asteroid
            const speed = 0.05;
            const direction = new THREE.Vector3().subVectors(CONFIG.asteroidPos, ship.position).normalize();
            ship.position.add(direction.multiplyScalar(speed));
            ship.lookAt(CONFIG.asteroidPos);

            // Stop if close
            if (ship.position.distanceTo(CONFIG.asteroidPos) < 2) {
                document.getElementById('mission-status').textContent = "STATUS: TARGET INTERCEPTED";
                missionState = 'DONE';
            }
        } else if (missionState === 'DRIFT') {
            // Slight drift movement
            ship.position.x += 0.005;
            ship.position.z -= 0.002;
            ship.rotation.z = Math.sin(time) * 0.1; // Idle wobble
        } else if (missionState === 'BURNING') {
            // Shake effect
            ship.position.x += (Math.random() - 0.5) * 0.1;
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
init();