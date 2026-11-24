/* SICSEBEN - DETECTOR DE GESTOS */

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const status = document.getElementById("status");
const result = document.getElementById("result");
const sound = document.getElementById("sound");

/* CONFIGURACIÓN */

const CONFIG = {
    requiredMovements: 3,
    movementThreshold: 0.035,
    minInterval: 120,
    maxInterval: 2000,
    displayDuration: 4000,
    cooldown: 5000
};

let stream = null;
let handLandmarker = null;
let HandLandmarker = null;
let drawingUtils = null;

let running = false;
let animationId = null;
let resultTimer = null;
let sessionId = 0;

let lastVideoTime = -1;
let lastDirection = 0;
let lastMovementTime = 0;
let movementCount = 0;
let cooldownUntil = 0;
let smoothDifference = null;

/* CARGAR MEDIAPIPE */

async function initializeModel() {

    if (handLandmarker) return;

    const mediaPipe = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
    );

    HandLandmarker = mediaPipe.HandLandmarker;

    const vision = await mediaPipe.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "CPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    drawingUtils = new mediaPipe.DrawingUtils(ctx);
}

/* ACTIVAR CÁMARA */

async function startCamera() {

    const currentSession = ++sessionId;

    startButton.disabled = true;
    status.textContent = "Activando cámara...";

    try {

        const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            },
            audio: false
        });

        if (currentSession !== sessionId) {
            cameraStream.getTracks().forEach(track => track.stop());
            return;
        }

        stream = cameraStream;
        video.srcObject = stream;

        await video.play();

        if (currentSession !== sessionId) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        status.textContent = "Cargando detector...";

        await initializeModel();

        if (currentSession !== sessionId) return;

        resetMovement();

        lastVideoTime = -1;
        cooldownUntil = 0;
        running = true;

        stopButton.disabled = false;
        status.textContent = "Realiza el gesto 67";

        detectHands();

    } catch (error) {

        if (currentSession !== sessionId) return;

        console.error(error);

        stopCamera();

        status.textContent = `Error: ${error.message}`;
    }
}

/* DETECTAR MANOS */

function detectHands() {

    if (!running) return;

    try {

        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {

            lastVideoTime = video.currentTime;

            const now = performance.now();
            const detection = handLandmarker.detectForVideo(video, now);
            const hands = detection.landmarks || [];

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            hands.forEach(landmarks => {

                drawingUtils.drawConnectors(
                    landmarks,
                    HandLandmarker.HAND_CONNECTIONS,
                    {
                        color: "#a3e635",
                        lineWidth: 2
                    }
                );

                drawingUtils.drawLandmarks(landmarks, {
                    color: "#ffffff",
                    radius: 2,
                    lineWidth: 1
                });
            });

            if (now < cooldownUntil) {

                status.textContent = "¡SICSEBEN!";

            } else if (hands.length === 2) {

                status.textContent = "Realiza el gesto 67";

                analyzeGesture(hands, now);

            } else {

                status.textContent = "Muestra ambas manos";

                resetMovement();
            }
        }

        animationId = requestAnimationFrame(detectHands);

    } catch (error) {

        console.error(error);

        stopCamera();

        status.textContent = `Error: ${error.message}`;
    }
}

/* CENTRO DE LA PALMA */

function getPalmCenter(landmarks) {

    const points = [0, 5, 9, 13, 17];

    return {
        x: points.reduce((sum, i) => sum + landmarks[i].x, 0) / points.length,
        y: points.reduce((sum, i) => sum + landmarks[i].y, 0) / points.length
    };
}

/* RECONOCER GESTO */

function analyzeGesture(hands, now) {

    const [left, right] = hands
        .map(getPalmCenter)
        .sort((a, b) => a.x - b.x);

    if (Math.abs(left.x - right.x) < 0.08) {
        resetMovement();
        return;
    }

    if (lastMovementTime && now - lastMovementTime > CONFIG.maxInterval) {
        resetMovement();
    }

    const difference = left.y - right.y;

    smoothDifference = smoothDifference === null
        ? difference
        : smoothDifference * 0.4 + difference * 0.6;

    let direction = 0;

    if (smoothDifference > CONFIG.movementThreshold) {
        direction = 1;
    } else if (smoothDifference < -CONFIG.movementThreshold) {
        direction = -1;
    }

    if (direction === 0) return;

    if (lastDirection === 0) {

        lastDirection = direction;
        lastMovementTime = now;

        return;
    }

    if (
        direction !== lastDirection &&
        now - lastMovementTime >= CONFIG.minInterval
    ) {

        movementCount++;
        lastDirection = direction;
        lastMovementTime = now;

        if (movementCount >= CONFIG.requiredMovements) {
            activateGesture(now);
        }
    }
}

/* MOSTRAR IMAGEN Y SONIDO */

function activateGesture(now) {

    cooldownUntil = now + CONFIG.cooldown;

    result.classList.add("show");

    status.textContent = "¡SICSEBEN!";

    if (sound) {

        sound.currentTime = 0;

        sound.play().catch(error => {
            console.warn("Audio no disponible:", error);
        });
    }

    clearTimeout(resultTimer);

    resultTimer = setTimeout(() => {

        result.classList.remove("show");

        resetMovement();

    }, CONFIG.displayDuration);
}

/* REINICIAR MOVIMIENTOS */

function resetMovement() {

    movementCount = 0;
    lastDirection = 0;
    lastMovementTime = 0;
    smoothDifference = null;
}

/* DETENER CÁMARA */

function stopCamera() {

    sessionId++;
    running = false;

    cancelAnimationFrame(animationId);
    clearTimeout(resultTimer);

    if (stream) {

        stream.getTracks().forEach(track => track.stop());

        stream = null;
    }

    video.srcObject = null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    result.classList.remove("show");

    if (sound) {
        sound.pause();
    }

    resetMovement();

    status.textContent = "Cámara desactivada";

    startButton.disabled = false;
    stopButton.disabled = true;
}

/* EVENTOS */

startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);

window.addEventListener("pagehide", stopCamera);