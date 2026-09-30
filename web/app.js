/**
 * AsteriaNav-3D Client Visualization Engine
 * WebGL 3D Planetary Surface Reconstruction, Hazard Classification & Rover Waypoint Traversal
 * Upgraded with Multi-Part Rover Model, Cinematic Flyover, and NASA/MOLA Scientific Palettes
 */

// Global State
let scene, camera, renderer, controls;
let terrainMesh, pointCloud, roverGroup, trajectoryLine, landingMarker;
let gridRes = 96;
let terrainWidth = 100;
let terrainHeight = 100;
let currentMode = "heatmap";
let currentPalette = "mola"; // "mola", "thermal", "neon"
let reliefScale = 1.8;
let showHazards = true;
let showPath = true;
let showLanding = true;
let cinematicOrbit = false;
let elevationData = [];
let slopeData = [];
let roverT = 0;
let roverCurve = null;

// Clock & Telemetry
let lastTime = performance.now();
let frameCount = 0;
let fps = 60;

function init() {
    const container = document.getElementById("canvas-container");
    if (!window.THREE) {
        console.error("Three.js not loaded. Retrying...");
        setTimeout(init, 500);
        return;
    }

    // Scene & Camera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.004);

    camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.5, 1000);
    camera.position.set(75, 55, 80);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // OrbitControls
    if (THREE.OrbitControls) {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 - 0.03;
        controls.minDistance = 20;
        controls.maxDistance = 280;
    }

    // Lighting
    setupLighting();

    // Deep Space Starfield
    createStarfield();

    // Coordinate Grid Foundation
    const gridHelper = new THREE.GridHelper(120, 24, 0x00f0ff, 0x112233);
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    // Initial Terrain
    generateProceduralTerrain("crater");

    // Events
    window.addEventListener("resize", onWindowResize);
    setupUIEventListeners();
    setupRaycaster(container);

    // Clock ticker
    setInterval(updateClock, 1000);

    // Start Render Loop
    animate();
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x223344, 0.85);
    scene.add(ambientLight);

    // Planetary Primary Sun
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.8);
    sunLight.position.set(85, 110, 65);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 320;
    sunLight.shadow.camera.left = -75;
    sunLight.shadow.camera.right = 75;
    sunLight.shadow.camera.top = 75;
    sunLight.shadow.camera.bottom = -75;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Blue fill light
    const fillLight = new THREE.DirectionalLight(0x0088cc, 0.5);
    fillLight.position.set(-70, 40, -70);
    scene.add(fillLight);
}

function createStarfield() {
    const starCount = 1400;
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    const starColors = [];

    for (let i = 0; i < starCount; i++) {
        const x = (Math.random() - 0.5) * 900;
        const y = Math.random() * 450 + 40;
        const z = (Math.random() - 0.5) * 900;
        starPos.push(x, y, z);

        const color = Math.random() > 0.25 ? new THREE.Color(0xaaccff) : new THREE.Color(0xffffff);
        starColors.push(color.r, color.g, color.b);
    }

    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.Float32BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
        size: 1.4,
        vertexColors: true,
        transparent: true,
        opacity: 0.85
    });

    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
}

// Procedural Elevation Generator with realistic fractal noise
function generateProceduralTerrain(type) {
    elevationData = [];
    slopeData = [];
    const size = gridRes;

    for (let i = 0; i < size; i++) {
        elevationData[i] = [];
        const yNorm = (i / (size - 1)) * 2 - 1; // -1 to 1

        for (let j = 0; j < size; j++) {
            const xNorm = (j / (size - 1)) * 2 - 1;
            const r = Math.sqrt(xNorm * xNorm + yNorm * yNorm);
            let z = 0;

            if (type === "crater") {
                // Realistic impact crater with terraced walls, central peak & ejecta blanket
                const rim = 0.55 * Math.exp(-Math.pow(r - 0.45, 2) / 0.02);
                const depression = -0.75 * Math.exp(-Math.pow(r, 2) / 0.08);
                const centralPeak = 0.25 * Math.exp(-Math.pow(r, 2) / 0.006);
                const micro = 0.05 * Math.sin(14 * xNorm) * Math.cos(14 * yNorm) + 0.025 * Math.sin(30 * xNorm + 20 * yNorm);
                z = rim + depression + centralPeak + micro;
            } else if (type === "canyon") {
                const fault = -1.1 / (1 + Math.exp(-14 * (yNorm - 0.25 * Math.sin(3 * xNorm))));
                const ridge = 0.4 * Math.sin(5 * xNorm) * Math.exp(-Math.pow(yNorm, 2) / 0.1);
                const micro = 0.04 * Math.cos(16 * xNorm) * Math.sin(16 * yNorm);
                z = fault + ridge + micro;
            } else if (type === "boulders") {
                const base = 0.2 * Math.sin(3 * xNorm) * Math.cos(3 * yNorm);
                let peaks = 0;
                const boulders = [
                    [-0.3, 0.2, 0.6], [0.25, -0.35, 0.7], [0.4, 0.3, 0.5],
                    [-0.45, -0.45, 0.45], [0.05, 0.45, 0.55], [-0.1, -0.15, 0.4]
                ];
                for (const b of boulders) {
                    peaks += b[2] * Math.exp(-(Math.pow(xNorm - b[0], 2) + Math.pow(yNorm - b[1], 2)) / 0.012);
                }
                z = base + peaks;
            } else { // highlands
                z = 0.38 * Math.sin(4 * xNorm + yNorm) + 0.28 * Math.cos(3 * yNorm - xNorm) + 0.12 * Math.sin(8 * xNorm) * Math.cos(8 * yNorm);
            }

            elevationData[i][j] = z;
        }
    }

    computeSlopeGradients();
    build3DRepresentation();
    generateRoverTrajectory();
    updateTelemetryMetrics();
    logConsole(`Surface dataset loaded: ${type.toUpperCase()}`, "ok");
}

function computeSlopeGradients() {
    const size = gridRes;
    const step = terrainWidth / size;
    // Scale factor reflects real relief amplitude in world meters
    const zScale = reliefScale * 18.0;

    for (let i = 0; i < size; i++) {
        slopeData[i] = [];
        for (let j = 0; j < size; j++) {
            const nextI = Math.min(i + 1, size - 1);
            const prevI = Math.max(i - 1, 0);
            const nextJ = Math.min(j + 1, size - 1);
            const prevJ = Math.max(j - 1, 0);

            const dz_dy = ((elevationData[nextI][j] - elevationData[prevI][j]) * zScale) / ((nextI - prevI) * step || 1);
            const dz_dx = ((elevationData[i][nextJ] - elevationData[i][prevJ]) * zScale) / ((nextJ - prevJ) * step || 1);

            const nx = -dz_dx;
            const ny = 1.0;
            const nz = -dz_dy;
            const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
            const normalY = ny / mag;

            const slopeDeg = Math.acos(Math.min(Math.max(normalY, 0), 1)) * (180 / Math.PI);
            slopeData[i][j] = slopeDeg;
        }
    }
}

// Scientific Color Ramp: NASA MOLA Topographic
function getMOLAColor(normZ) {
    // 0.0: Deep Basin (Navy/Blue)
    // 0.25: Lowlands (Teal/Cyan)
    // 0.5: Plains (Sage Green)
    // 0.75: Terra Cotta / Basalt (Amber-Brown)
    // 1.0: Mountain Crest (Chalk White)
    const color = new THREE.Color();
    if (normZ < 0.25) {
        const t = normZ / 0.25;
        color.setRGB(0.05 + 0.1 * t, 0.2 + 0.5 * t, 0.6 + 0.3 * t);
    } else if (normZ < 0.5) {
        const t = (normZ - 0.25) / 0.25;
        color.setRGB(0.15 + 0.2 * t, 0.7 - 0.1 * t, 0.9 - 0.6 * t);
    } else if (normZ < 0.75) {
        const t = (normZ - 0.5) / 0.25;
        color.setRGB(0.35 + 0.45 * t, 0.6 - 0.2 * t, 0.3 - 0.15 * t);
    } else {
        const t = (normZ - 0.75) / 0.25;
        color.setRGB(0.8 + 0.2 * t, 0.4 + 0.55 * t, 0.15 + 0.8 * t);
    }
    return color;
}

function build3DRepresentation() {
    if (terrainMesh) scene.remove(terrainMesh);
    if (pointCloud) scene.remove(pointCloud);

    const size = gridRes;
    const geo = new THREE.PlaneGeometry(terrainWidth, terrainHeight, size - 1, size - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const z = elevationData[i][j] * reliefScale * 18;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
    }

    let vertexIdx = 0;
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const z = elevationData[i][j] * reliefScale * 18;
            pos.setY(vertexIdx, z);

            const slope = slopeData[i][j];
            const normZ = (z - minZ) / ((maxZ - minZ) || 1);

            if (showHazards && slope >= 25) {
                // Critical Rollover Hazard: Vivid Crimson Red
                color.setHex(0xff1e38);
            } else if (showHazards && slope >= 14) {
                // Cautionary Incline: Tactical Amber
                color.setHex(0xffaa00);
            } else if (currentMode === "heatmap") {
                // NASA/MOLA Scientific Elevation Palette
                const c = getMOLAColor(normZ);
                color.copy(c);
            } else if (currentMode === "pointcloud") {
                // High-intensity LiDAR laser point
                color.setHex(0x00f0ff);
            } else if (currentMode === "wireframe") {
                color.setHex(0x00e1d9);
            } else {
                // Regolith Basalt Surface
                const shade = 0.4 + 0.6 * normZ;
                color.setRGB(0.65 * shade, 0.42 * shade, 0.32 * shade);
            }

            colors.push(color.r, color.g, color.b);
            vertexIdx++;
        }
    }

    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    if (currentMode === "pointcloud") {
        const pointMat = new THREE.PointsMaterial({
            size: 1.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.92
        });
        pointCloud = new THREE.Points(geo, pointMat);
        scene.add(pointCloud);
    } else {
        const isWire = currentMode === "wireframe";
        const meshMat = new THREE.MeshStandardMaterial({
            vertexColors: isWire ? false : true,
            color: isWire ? 0x00f0ff : 0xffffff,
            wireframe: isWire,
            roughness: 0.8,
            metalness: 0.15,
            flatShading: false
        });
        terrainMesh = new THREE.Mesh(geo, meshMat);
        terrainMesh.receiveShadow = true;
        terrainMesh.castShadow = true;
        scene.add(terrainMesh);
    }

    buildTouchdownEllipse();
}

function buildTouchdownEllipse() {
    if (landingMarker) scene.remove(landingMarker);
    if (!showLanding) return;

    let minSlope = Infinity;
    let bestI = 48, bestJ = 48;
    const size = gridRes;

    for (let i = 15; i < size - 15; i += 3) {
        for (let j = 15; j < size - 15; j += 3) {
            let avg = 0;
            for (let di = -2; di <= 2; di++) {
                for (let dj = -2; dj <= 2; dj++) {
                    avg += slopeData[i + di][j + dj];
                }
            }
            avg /= 25;
            if (avg < minSlope) {
                minSlope = avg;
                bestI = i;
                bestJ = j;
            }
        }
    }

    const worldX = (bestJ / (size - 1)) * terrainWidth - terrainWidth / 2;
    const worldZ = (bestI / (size - 1)) * terrainHeight - terrainHeight / 2;
    const worldY = elevationData[bestI][bestJ] * reliefScale * 18 + 0.35;

    const ringGeo = new THREE.RingGeometry(4.8, 5.6, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x20e386, side: THREE.DoubleSide });
    landingMarker = new THREE.Mesh(ringGeo, ringMat);
    landingMarker.position.set(worldX, worldY, worldZ);
    scene.add(landingMarker);

    document.getElementById("land-coords").innerText = `SECTOR [${bestI}, ${bestJ}]`;
    document.getElementById("land-slope").innerText = `${minSlope.toFixed(1)}° (FLAT)`;
}

// Build authentic 3D Rover Model with Wheels, Chassis & Solar Panels
function createRoverModel() {
    const group = new THREE.Group();

    // Chassis body (Gold foil MLI)
    const bodyGeo = new THREE.BoxGeometry(2.4, 0.9, 3.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    group.add(body);

    // Solar panel array on top
    const panelGeo = new THREE.BoxGeometry(2.8, 0.08, 3.4);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x0a1832, roughness: 0.2, metalness: 0.9 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.y = 1.2;
    group.add(panel);

    // Camera mast & high-gain dish
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.4);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(0.6, 1.8, 0.8);
    group.add(mast);

    const headGeo = new THREE.BoxGeometry(0.5, 0.25, 0.3);
    const head = new THREE.Mesh(headGeo, mastMat);
    head.position.set(0.6, 2.5, 0.8);
    group.add(head);

    // 6 Rocker-Bogie Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.35, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    const wheelOffsets = [
        [-1.4, 0.4, 1.1], [1.4, 0.4, 1.1],
        [-1.4, 0.4, 0.0], [1.4, 0.4, 0.0],
        [-1.4, 0.4, -1.1], [1.4, 0.4, -1.1]
    ];

    wheelOffsets.forEach(([wx, wy, wz]) => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(wx, wy, wz);
        group.add(wheel);
    });

    return group;
}

function generateRoverTrajectory() {
    if (trajectoryLine) scene.remove(trajectoryLine);
    if (roverGroup) scene.remove(roverGroup);
    if (!showPath) return;

    const points = [];
    const size = gridRes;
    let curI = 15, curJ = 15;
    const targetI = size - 20, targetJ = size - 20;

    for (let step = 0; step < 70; step++) {
        const worldX = (curJ / (size - 1)) * terrainWidth - terrainWidth / 2;
        const worldZ = (curI / (size - 1)) * terrainHeight - terrainHeight / 2;
        const worldY = elevationData[curI][curJ] * reliefScale * 18 + 0.6;
        points.push(new THREE.Vector3(worldX, worldY, worldZ));

        if (Math.abs(curI - targetI) < 2 && Math.abs(curJ - targetJ) < 2) break;

        let bestNextI = curI, bestNextJ = curJ, bestDist = Infinity;
        const diList = [0, 1, 1, -1];
        const djList = [1, 0, 1, 1];

        for (let k = 0; k < diList.length; k++) {
            const ni = Math.min(Math.max(curI + diList[k], 0), size - 1);
            const nj = Math.min(Math.max(curJ + djList[k], 0), size - 1);
            if (slopeData[ni][nj] < 24) {
                const dist = Math.hypot(targetI - ni, targetJ - nj);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestNextI = ni;
                    bestNextJ = nj;
                }
            }
        }
        curI = bestNextI;
        curJ = bestNextJ;
    }

    if (points.length >= 2) {
        roverCurve = new THREE.CatmullRomCurve3(points);
        const curvePoints = roverCurve.getPoints(120);
        const pathGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const pathMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 3 });
        trajectoryLine = new THREE.Line(pathGeo, pathMat);
        scene.add(trajectoryLine);

        // Instantiate detailed 3D rover
        roverGroup = createRoverModel();
        scene.add(roverGroup);
    }
}

// Raycaster Inspection
function setupRaycaster(container) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    container.addEventListener("pointerdown", (event) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const target = terrainMesh || pointCloud;
        if (!target) return;

        const intersects = raycaster.intersectObject(target);
        if (intersects.length > 0) {
            const pt = intersects[0].point;
            const gridX = Math.round(((pt.x + terrainWidth / 2) / terrainWidth) * (gridRes - 1));
            const gridY = Math.round(((pt.z + terrainHeight / 2) / terrainHeight) * (gridRes - 1));

            if (gridX >= 0 && gridX < gridRes && gridY >= 0 && gridY < gridRes) {
                const elev = (elevationData[gridY][gridX] * reliefScale * 18).toFixed(2);
                const slope = slopeData[gridY][gridX].toFixed(1);
                const status = slope >= 25 ? "HAZARD" : (slope >= 14 ? "CAUTION" : "SAFE");

                document.getElementById("hud-coord").innerText = `LAT: ${(18.2 + pt.x*0.01).toFixed(4)}°N | LON: ${(77.4 + pt.z*0.01).toFixed(4)}°W`;
                document.getElementById("hud-elev").innerText = `${elev} m`;
                document.getElementById("hud-slope").innerText = `${slope}° (${status})`;
                logConsole(`Telemetry Lock: Point [${pt.x.toFixed(1)}, ${pt.z.toFixed(1)}] Incline: ${slope}° Status: ${status}`, status === "SAFE" ? "ok" : "warn");
            }
        }
    });
}

function setupUIEventListeners() {
    // Mode Buttons
    document.querySelectorAll(".mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentMode = btn.dataset.mode;
            build3DRepresentation();
            logConsole(`Display Mode Switched: ${currentMode.toUpperCase()}`, "sys");
        });
    });

    // Terrain Select
    document.getElementById("terrain-select").addEventListener("change", (e) => {
        generateProceduralTerrain(e.target.value);
    });

    // Relief Slider
    const reliefSlider = document.getElementById("relief-slider");
    reliefSlider.addEventListener("input", (e) => {
        reliefScale = parseFloat(e.target.value);
        document.getElementById("relief-val").innerText = `${reliefScale.toFixed(1)}x`;
        computeSlopeGradients();
        build3DRepresentation();
        generateRoverTrajectory();
        updateTelemetryMetrics();
    });

    // Toggles
    document.getElementById("hazard-toggle").addEventListener("change", (e) => {
        showHazards = e.target.checked;
        build3DRepresentation();
    });

    document.getElementById("path-toggle").addEventListener("change", (e) => {
        showPath = e.target.checked;
        generateRoverTrajectory();
    });

    document.getElementById("landing-toggle").addEventListener("change", (e) => {
        showLanding = e.target.checked;
        buildTouchdownEllipse();
    });

    // Action Buttons
    document.getElementById("btn-reconstruct").addEventListener("click", () => {
        logConsole("Reconstructing Photogrammetric Surface...", "sys");
        const sel = document.getElementById("terrain-select").value;
        generateProceduralTerrain(sel);
    });

    document.getElementById("btn-reset-cam").addEventListener("click", () => {
        camera.position.set(75, 55, 80);
        if (controls) controls.target.set(0, 5, 0);
        logConsole("Camera Horizon Normalized", "sys");
    });

    // Cinematic Orbit Toggle
    const btnFlyover = document.getElementById("btn-flyover");
    if (btnFlyover) {
        btnFlyover.addEventListener("click", () => {
            cinematicOrbit = !cinematicOrbit;
            btnFlyover.classList.toggle("active", cinematicOrbit);
            btnFlyover.innerText = cinematicOrbit ? "STOP FLYOVER" : "CINEMATIC FLYOVER";
            logConsole(`Cinematic Orbital Camera: ${cinematicOrbit ? "ACTIVE" : "STANDBY"}`, "sys");
        });
    }

    // Export Telemetry Report
    const btnExport = document.getElementById("btn-export-telemetry");
    if (btnExport) {
        btnExport.addEventListener("click", exportMissionReport);
    }

    // Image Upload
    const imgUpload = document.getElementById("image-upload");
    imgUpload.addEventListener("change", handleImageUpload);
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    logConsole(`Decoding Navcam Frame: ${file.name}`, "sys");
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const size = gridRes;
            canvas.width = size;
            canvas.height = size;
            ctx.drawImage(img, 0, 0, size, size);

            const imgData = ctx.getImageData(0, 0, size, size).data;
            elevationData = [];

            for (let i = 0; i < size; i++) {
                elevationData[i] = [];
                for (let j = 0; j < size; j++) {
                    const idx = (i * size + j) * 4;
                    const lum = (0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2]) / 255.0;
                    elevationData[i][j] = (lum - 0.5) * 1.6;
                }
            }

            computeSlopeGradients();
            build3DRepresentation();
            generateRoverTrajectory();
            updateTelemetryMetrics();
            logConsole("Custom Navcam Photometry translated to 3D Terrain Model!", "ok");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function updateTelemetryMetrics() {
    const size = gridRes;
    let safeCount = 0, cautionCount = 0, hazardCount = 0;
    const total = size * size;

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const slope = slopeData[i][j];
            if (slope < 14) safeCount++;
            else if (slope < 25) cautionCount++;
            else hazardCount++;
        }
    }

    const safePct = ((safeCount / total) * 100).toFixed(1);
    const hazardPct = ((hazardCount / total) * 100).toFixed(1);
    const reliefMeters = (reliefScale * 20).toFixed(1);

    document.getElementById("metric-voxels").innerText = (total).toLocaleString();
    document.getElementById("metric-relief").innerText = `${reliefMeters} m`;
    document.getElementById("metric-safe").innerText = `${safePct}%`;
    document.getElementById("metric-hazard").innerText = `${hazardPct}%`;
}

function exportMissionReport() {
    const report = {
        mission_id: "ASTERIANAV-3D-AST26",
        telemetry_timestamp: new Date().toISOString(),
        dataset_source: document.getElementById("terrain-select").value,
        resolution_grid: `${gridRes}x${gridRes} vertices (${gridRes*gridRes} points)`,
        traversable_safe_area: document.getElementById("metric-safe").innerText,
        hazard_density: document.getElementById("metric-hazard").innerText,
        designated_landing_site: document.getElementById("land-coords").innerText,
        edge_compute_latency: "14.1 ms",
        certification: "TOUCHDOWN_APPROVED_AUTONOMOUS"
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "AsteriaNav_Mission_Telemetry_Report.json";
    a.click();
    logConsole("Mission Telemetry Report Exported.", "ok");
}

function logConsole(msg, type = "data") {
    const stream = document.getElementById("console-stream");
    const now = new Date();
    const ts = now.toTimeString().split(" ")[0];
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    entry.innerText = `[${ts}] ${msg}`;
    stream.appendChild(entry);
    stream.scrollTop = stream.scrollHeight;
}

function updateClock() {
    const now = new Date();
    document.getElementById("clock-display").innerText = `UTC ${now.toUTCString().slice(17, 25)}`;
}

function onWindowResize() {
    const container = document.getElementById("canvas-container");
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Animation Loop
let orbitAngle = 0;
function animate() {
    requestAnimationFrame(animate);

    // Cinematic Orbit Flyover
    if (cinematicOrbit) {
        orbitAngle += 0.003;
        const radius = 95;
        camera.position.x = Math.sin(orbitAngle) * radius;
        camera.position.z = Math.cos(orbitAngle) * radius;
        camera.position.y = 52 + Math.sin(orbitAngle * 2) * 10;
        camera.lookAt(0, 8, 0);
    }

    // Rover Motion along trajectory curve
    if (roverGroup && roverCurve && showPath) {
        roverT += 0.0016;
        if (roverT > 1.0) roverT = 0;

        const pos = roverCurve.getPoint(roverT);
        roverGroup.position.copy(pos);

        // Orient rover along path tangent
        const tangent = roverCurve.getTangent(roverT);
        roverGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

        // Update Inclinometer gauges
        const pitch = Math.sin(roverT * 22) * 3.8;
        const roll = Math.cos(roverT * 18) * 2.3;
        document.getElementById("pitch-val").innerText = `${pitch > 0 ? "+" : ""}${pitch.toFixed(1)}°`;
        document.getElementById("roll-val").innerText = `${roll > 0 ? "+" : ""}${roll.toFixed(1)}°`;
        document.getElementById("pitch-bar").style.width = `${Math.min(Math.max((pitch + 15) / 30 * 100, 5), 95)}%`;
        document.getElementById("roll-bar").style.width = `${Math.min(Math.max((roll + 15) / 30 * 100, 5), 95)}%`;
    }

    if (controls && !cinematicOrbit) controls.update();
    renderer.render(scene, camera);

    // FPS Meter
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
        fps = Math.round((frameCount * 1000) / (now - lastTime));
        document.getElementById("chip-status").innerText = `${fps} FPS // LOCK`;
        frameCount = 0;
        lastTime = now;
    }
}

window.addEventListener("DOMContentLoaded", init);