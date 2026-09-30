/**
 * AsteriaNav-3D Client Visualization Engine
 * WebGL 3D Planetary Surface Reconstruction, Hazard Classification & Rover Waypoint Traversal
 */

// Global State
let scene, camera, renderer, controls;
let terrainMesh, pointCloud, roverMarker, trajectoryLine, landingMarker;
let gridRes = 96;
let terrainWidth = 100;
let terrainHeight = 100;
let currentMode = "heatmap";
let reliefScale = 1.8;
let showHazards = true;
let showPath = true;
let showLanding = true;
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
        console.error("Three.js not loaded. Retrying or using fallback.");
        setTimeout(init, 500);
        return;
    }

    // Scene & Camera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.005);

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.5, 1000);
    camera.position.set(70, 60, 85);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // OrbitControls
    if (THREE.OrbitControls) {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 - 0.02; // Keep above horizon
        controls.minDistance = 20;
        controls.maxDistance = 250;
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
    const ambientLight = new THREE.AmbientLight(0x223344, 0.9);
    scene.add(ambientLight);

    // Planetary Primary Sun
    const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.6);
    sunLight.position.set(80, 100, 60);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -70;
    sunLight.shadow.camera.right = 70;
    sunLight.shadow.camera.top = 70;
    sunLight.shadow.camera.bottom = -70;
    scene.add(sunLight);

    // Secondary fill light for deep crater shadows
    const fillLight = new THREE.DirectionalLight(0x00aaff, 0.4);
    fillLight.position.set(-60, 40, -60);
    scene.add(fillLight);
}

function createStarfield() {
    const starCount = 1200;
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    const starColors = [];

    for (let i = 0; i < starCount; i++) {
        const x = (Math.random() - 0.5) * 800;
        const y = Math.random() * 400 + 50;
        const z = (Math.random() - 0.5) * 800;
        starPos.push(x, y, z);

        const color = Math.random() > 0.3 ? new THREE.Color(0x88ccff) : new THREE.Color(0xffffff);
        starColors.push(color.r, color.g, color.b);
    }

    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.Float32BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
        size: 1.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.85
    });

    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
}

// Procedural Elevation Generator
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
                const rim = 0.5 * Math.exp(-Math.pow(r - 0.45, 2) / 0.025);
                const depression = -0.75 * Math.exp(-Math.pow(r, 2) / 0.09);
                const micro = 0.06 * Math.sin(12 * xNorm) * Math.cos(12 * yNorm);
                z = rim + depression + micro;
            } else if (type === "canyon") {
                const fault = -0.9 / (1 + Math.exp(-12 * (yNorm - 0.2 * Math.sin(3 * xNorm))));
                const ridge = 0.35 * Math.sin(5 * xNorm) * Math.exp(-Math.pow(yNorm, 2) / 0.12);
                z = fault + ridge + 0.04 * Math.cos(15 * xNorm);
            } else if (type === "boulders") {
                const base = 0.2 * Math.sin(3 * xNorm) * Math.cos(3 * yNorm);
                let peaks = 0;
                const boulders = [
                    [-0.3, 0.2, 0.5], [0.25, -0.35, 0.6], [0.4, 0.3, 0.45],
                    [-0.45, -0.45, 0.38], [0.05, 0.45, 0.5]
                ];
                for (const b of boulders) {
                    peaks += b[2] * Math.exp(-(Math.pow(xNorm - b[0], 2) + Math.pow(yNorm - b[1], 2)) / 0.015);
                }
                z = base + peaks;
            } else { // highlands
                z = 0.35 * Math.sin(4 * xNorm + yNorm) + 0.25 * Math.cos(3 * yNorm - xNorm) + 0.1 * Math.sin(8 * xNorm);
            }

            elevationData[i][j] = z;
        }
    }

    // Compute Slopes & Surface
    computeSlopeGradients();
    build3DRepresentation();
    generateRoverTrajectory();
    updateTelemetryMetrics();
    logConsole(`Generated 3D elevation field: ${type.toUpperCase()}`, "ok");
}

function computeSlopeGradients() {
    const size = gridRes;
    const step = terrainWidth / size;

    for (let i = 0; i < size; i++) {
        slopeData[i] = [];
        for (let j = 0; j < size; j++) {
            const nextI = Math.min(i + 1, size - 1);
            const prevI = Math.max(i - 1, 0);
            const nextJ = Math.min(j + 1, size - 1);
            const prevJ = Math.max(j - 1, 0);

            const dz_dy = (elevationData[nextI][j] - elevationData[prevI][j]) / ((nextI - prevI) * step || 1);
            const dz_dx = (elevationData[i][nextJ] - elevationData[i][prevJ]) / ((nextJ - prevJ) * step || 1);

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
            const z = elevationData[i][j] * reliefScale * 15;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
    }

    let vertexIdx = 0;
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const z = elevationData[i][j] * reliefScale * 15;
            pos.setY(vertexIdx, z);

            const slope = slopeData[i][j];

            if (showHazards && slope >= 24) {
                // Critical Hazard: Vibrant Red
                color.setHex(0xff2244);
            } else if (showHazards && slope >= 13) {
                // Cautionary Slope: Amber
                color.setHex(0xffaa00);
            } else if (currentMode === "heatmap") {
                // Elevation Heatmap gradient: Blue -> Cyan -> Green -> Yellow -> Red
                const normZ = (z - minZ) / ((maxZ - minZ) || 1);
                color.setHSL(0.65 * (1 - normZ), 0.95, 0.5);
            } else if (currentMode === "pointcloud") {
                // Laser Point Cloud glow
                color.setHex(0x00f0ff);
            } else {
                // Surface Regolith: Martian ochre / lunar grey
                const shade = 0.5 + 0.5 * (z - minZ) / ((maxZ - minZ) || 1);
                color.setRGB(0.7 * shade, 0.45 * shade, 0.35 * shade);
            }

            colors.push(color.r, color.g, color.b);
            vertexIdx++;
        }
    }

    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    if (currentMode === "pointcloud") {
        const pointMat = new THREE.PointsMaterial({
            size: 1.4,
            vertexColors: true,
            transparent: true,
            opacity: 0.9
        });
        pointCloud = new THREE.Points(geo, pointMat);
        scene.add(pointCloud);
    } else {
        const isWire = currentMode === "wireframe";
        const meshMat = new THREE.MeshStandardMaterial({
            vertexColors: isWire ? false : true,
            color: isWire ? 0x00f0ff : 0xffffff,
            wireframe: isWire,
            roughness: 0.75,
            metalness: 0.1,
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

    // Find center of minimum slope
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
    const worldY = elevationData[bestI][bestJ] * reliefScale * 15 + 0.3;

    const ringGeo = new THREE.RingGeometry(5.0, 5.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x20e386, side: THREE.DoubleSide });
    landingMarker = new THREE.Mesh(ringGeo, ringMat);
    landingMarker.position.set(worldX, worldY, worldZ);
    scene.add(landingMarker);

    document.getElementById("land-coords").innerText = `GRID [${bestI}, ${bestJ}]`;
    document.getElementById("land-slope").innerText = `${minSlope.toFixed(1)}°`;
}

function generateRoverTrajectory() {
    if (trajectoryLine) scene.remove(trajectoryLine);
    if (roverMarker) scene.remove(roverMarker);
    if (!showPath) return;

    const points = [];
    const size = gridRes;
    let curI = 15, curJ = 15;
    const targetI = size - 20, targetJ = size - 20;

    for (let step = 0; step < 60; step++) {
        const worldX = (curJ / (size - 1)) * terrainWidth - terrainWidth / 2;
        const worldZ = (curI / (size - 1)) * terrainHeight - terrainHeight / 2;
        const worldY = elevationData[curI][curJ] * reliefScale * 15 + 0.6;
        points.push(new THREE.Vector3(worldX, worldY, worldZ));

        if (Math.abs(curI - targetI) < 2 && Math.abs(curJ - targetJ) < 2) break;

        // Step forward towards target, avoiding slope >= 24
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
        const curvePoints = roverCurve.getPoints(100);
        const pathGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const pathMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 3 });
        trajectoryLine = new THREE.Line(pathGeo, pathMat);
        scene.add(trajectoryLine);

        // Rover 3D Model Marker
        const roverGeo = new THREE.BoxGeometry(2.5, 1.2, 3.2);
        const roverMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.8, roughness: 0.3 });
        roverMarker = new THREE.Mesh(roverGeo, roverMat);
        roverMarker.castShadow = true;
        scene.add(roverMarker);
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
                const elev = (elevationData[gridY][gridX] * reliefScale * 15).toFixed(2);
                const slope = slopeData[gridY][gridX].toFixed(1);
                const status = slope >= 24 ? "HAZARD" : (slope >= 13 ? "CAUTION" : "SAFE");

                document.getElementById("hud-coord").innerText = `X: ${pt.x.toFixed(1)}m | Y: ${pt.z.toFixed(1)}m`;
                document.getElementById("hud-elev").innerText = `${elev} m`;
                document.getElementById("hud-slope").innerText = `${slope}° (${status})`;
                logConsole(`Inspected: [${pt.x.toFixed(1)}, ${pt.z.toFixed(1)}] Elev: ${elev}m Slope: ${slope}° (${status})`, status === "SAFE" ? "ok" : "warn");
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
            logConsole(`Visualization Mode: ${currentMode.toUpperCase()}`, "sys");
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
        build3DRepresentation();
        generateRoverTrajectory();
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
        logConsole("Executing Neural Surface Reconstruction pass...", "sys");
        const sel = document.getElementById("terrain-select").value;
        generateProceduralTerrain(sel);
    });

    document.getElementById("btn-reset-cam").addEventListener("click", () => {
        camera.position.set(70, 60, 85);
        if (controls) controls.target.set(0, 5, 0);
        logConsole("Camera Orientation Reset to Default Horizon", "sys");
    });

    // Image Upload
    const imgUpload = document.getElementById("image-upload");
    imgUpload.addEventListener("change", handleImageUpload);
}

// Convert 2D Optical Image to 3D Metric Elevation
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    logConsole(`Reading optical frame: ${file.name}`, "sys");
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
                    // Photometric luminance: Y = 0.299R + 0.587G + 0.114B
                    const lum = (0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2]) / 255.0;
                    elevationData[i][j] = (lum - 0.5) * 1.5;
                }
            }

            computeSlopeGradients();
            build3DRepresentation();
            generateRoverTrajectory();
            updateTelemetryMetrics();
            logConsole("2D Optical Frame mapped to 3D Metric Point Cloud!", "ok");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function updateTelemetryMetrics() {
    const size = gridRes;
    let safeCount = 0, hazardCount = 0;
    const total = size * size;

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (slopeData[i][j] < 13) safeCount++;
            else if (slopeData[i][j] >= 24) hazardCount++;
        }
    }

    const safePct = ((safeCount / total) * 100).toFixed(1);
    const hazardPct = ((hazardCount / total) * 100).toFixed(1);

    document.getElementById("metric-voxels").innerText = (total).toLocaleString();
    document.getElementById("metric-relief").innerText = `${(reliefScale * 20).toFixed(1)} m`;
    document.getElementById("metric-safe").innerText = `${safePct}%`;
    document.getElementById("metric-hazard").innerText = `${hazardPct}%`;
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
function animate() {
    requestAnimationFrame(animate);

    // Rover Motion along traversal curve
    if (roverMarker && roverCurve && showPath) {
        roverT += 0.0015;
        if (roverT > 1.0) roverT = 0;

        const pos = roverCurve.getPoint(roverT);
        roverMarker.position.copy(pos);

        // Orient rover along path tangent
        const tangent = roverCurve.getTangent(roverT);
        roverMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

        // Update Attitude HUD
        const pitch = Math.sin(roverT * 20) * 3.5;
        const roll = Math.cos(roverT * 15) * 2.1;
        document.getElementById("pitch-val").innerText = `${pitch > 0 ? "+" : ""}${pitch.toFixed(1)}°`;
        document.getElementById("roll-val").innerText = `${roll > 0 ? "+" : ""}${roll.toFixed(1)}°`;
        document.getElementById("pitch-bar").style.width = `${Math.min(Math.max((pitch + 15) / 30 * 100, 5), 95)}%`;
        document.getElementById("roll-bar").style.width = `${Math.min(Math.max((roll + 15) / 30 * 100, 5), 95)}%`;
    }

    if (controls) controls.update();
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