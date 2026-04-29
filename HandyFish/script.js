const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const startUI = document.getElementById("start-ui");
const selectUI = document.getElementById("select-ui");
const practiceUI = document.getElementById("practice-ui");
const startBtn = document.getElementById("start-btn");
const fishOptions = document.getElementById("fish-options");
const transitionOverlay = document.getElementById("transition-overlay");
const toast = document.getElementById("toast");
const startTip = document.getElementById("start-tip");
const selectTip = document.getElementById("select-tip");
const scoreEl = document.getElementById("score");
const remainEl = document.getElementById("remain");
const gestureStateEl = document.getElementById("gesture-state");
const helpBtn = document.getElementById("help-btn");
const guideModal = document.getElementById("guide-modal");
const closeGuide = document.getElementById("close-guide");
const resultModal = document.getElementById("result-modal");
const resultTitle = document.getElementById("result-title");
const resultText = document.getElementById("result-text");
const restartBtn = document.getElementById("restart-btn");
const inputVideo = document.getElementById("input-video");

const bgm = new Audio("./assets/audio/mixkit-water-flowing-ambience-loop-3126.wav");
bgm.loop = true;
bgm.volume = 0.35;

const bubbleSfx = new Audio("./assets/audio/mixkit-liquid-bubble-3000.wav");
bubbleSfx.volume = 0.65;

const fishTemplates = [
  { id: "azure", name: "深海蓝", color: "#5dc8ff", fin: "#c9f1ff" },
  { id: "coral", name: "珊瑚橙", color: "#ff8859", fin: "#ffd4b3" },
  { id: "mint", name: "薄荷绿", color: "#58cf9e", fin: "#d7ffe7" }
];
const HAND_X_MIRROR = true;

let scene = "start";
let sceneTime = 0;
let transitionLock = false;
let lastTime = 0;
let firstPracticeGuideShown = false;
let handTrackingReady = false;
let controlMode = "mouse";
let handVisible = false;
let startLaunchLock = false;
let selectLaunchLock = false;
let startHandTipShown = false;
let lastGestureStartTryAt = 0;
let lastGestureSelectTryAt = 0;

const mouse = { x: 0, y: 0 };
const ripplePoints = [];
const bubbles = [];
const scenePointerTrail = { x: null, y: null };

let gestureState = "none";
let prevGestureState = "none";
let handTarget = { x: 0, y: 0 };

const player = {
  x: 0,
  y: 0,
  tx: 0,
  ty: 0,
  size: 42,
  color: fishTemplates[0].color,
  fin: fishTemplates[0].fin,
  mouthOpen: false,
  biteArmed: false,
  armedPreyId: null
};

let preyList = [];
let score = 0;
let cameraRunner = null;

function setControlMode(mode) {
  controlMode = mode;
  updateStartTip();
  updateSelectTip();
  updateGestureUI(gestureState);
}

function updateStartTip(customText) {
  if (!startTip) return;
  if (customText) {
    startTip.textContent = customText;
    return;
  }
  if (scene !== "start") return;
  if (controlMode === "hand") {
    startTip.textContent = handVisible
      ? "移动手势鱼到 START，握拳即可进入"
      : "请把手放到摄像头画面内，等待识别";
    return;
  }
  startTip.textContent = "鼠标点击 START；识别到手势后可握拳进入";
}

function updateSelectTip(customText) {
  if (!selectTip) return;
  if (customText) {
    selectTip.textContent = customText;
    return;
  }
  if (scene !== "select") return;
  if (controlMode === "hand") {
    selectTip.textContent = handVisible
      ? "移动手势鱼到目标鱼卡片，握拳确认选择"
      : "请把手放到摄像头画面内，等待识别";
    return;
  }
  selectTip.textContent = "点击鱼卡片选择；识别到手势后可握拳确认";
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (!mouse.x && !mouse.y) {
    mouse.x = canvas.width * 0.5;
    mouse.y = canvas.height * 0.5;
  }
  if (!player.x && !player.y) {
    resetPlayerPosition();
  }
}

function resetPlayerPosition() {
  player.x = canvas.width * 0.5;
  player.y = canvas.height * 0.56;
  player.tx = player.x;
  player.ty = player.y;
}

function showToast(text, duration = 1600) {
  toast.textContent = text;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function setActiveSceneUI(name) {
  [startUI, selectUI, practiceUI].forEach((item) => item.classList.remove("active"));
  if (name === "start") {
    startUI.classList.add("active");
    document.body.style.cursor = "none";
    scenePointerTrail.x = null;
    scenePointerTrail.y = null;
    updateStartTip();
  } else if (name === "select") {
    selectUI.classList.add("active");
    document.body.style.cursor = "none";
    scenePointerTrail.x = null;
    scenePointerTrail.y = null;
    startBtn.classList.remove("gesture-hover");
    clearFishCardHover();
    updateSelectTip();
  } else {
    practiceUI.classList.add("active");
    document.body.style.cursor = "default";
    startBtn.classList.remove("gesture-hover");
    clearFishCardHover();
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clearFishCardHover() {
  fishOptions.querySelectorAll(".fish-card.gesture-hover").forEach((card) => {
    card.classList.remove("gesture-hover");
  });
}

function isPointInElement(el, x, y, padding = 0) {
  const rect = el.getBoundingClientRect();
  return (
    x >= rect.left - padding &&
    x <= rect.right + padding &&
    y >= rect.top - padding &&
    y <= rect.bottom + padding
  );
}

function isPointInStartButton(x, y, padding = 0) {
  return isPointInElement(startBtn, x, y, padding);
}

function getScenePointer() {
  if (controlMode === "hand" && handVisible) {
    return { x: handTarget.x, y: handTarget.y, source: "hand" };
  }
  return { x: mouse.x, y: mouse.y, source: "mouse" };
}

function getHoveredFishCard(x, y, padding = 0) {
  const cards = fishOptions.querySelectorAll(".fish-card");
  for (const card of cards) {
    if (isPointInElement(card, x, y, padding)) return card;
  }
  return null;
}

async function launchFromStart(triggerSource) {
  if (startLaunchLock || transitionLock || scene !== "start") return;
  startLaunchLock = true;
  startBtn.classList.add("scatter");
  startBtn.classList.remove("gesture-hover");
  bgm.play().catch(() => {});
  initHandTracking();
  createRipples(canvas.width * 0.5, canvas.height * 0.56, 10);
  if (triggerSource === "gesture") {
    showToast("握拳确认，进入选鱼界面", 1200);
  }
  await sleep(620);
  await switchScene("select");
  window.setTimeout(() => startBtn.classList.remove("scatter"), 900);
  startLaunchLock = false;
}

async function switchScene(nextScene) {
  if (transitionLock || scene === nextScene) return;
  transitionLock = true;
  transitionOverlay.classList.add("active");
  await sleep(620);
  scene = nextScene;
  sceneTime = 0;
  setActiveSceneUI(scene);
  if (scene === "practice") {
    startPractice();
  }
  await sleep(180);
  transitionOverlay.classList.remove("active");
  transitionLock = false;
}

function initFishCards() {
  fishOptions.innerHTML = "";
  fishTemplates.forEach((fish) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "fish-card";
    card.dataset.fishId = fish.id;
    card.innerHTML = `
      <svg width="130" height="70" viewBox="0 0 130 70" aria-hidden="true">
        <ellipse cx="58" cy="35" rx="38" ry="19" fill="${fish.color}"></ellipse>
        <polygon points="89,35 120,17 120,53" fill="${fish.fin}"></polygon>
        <circle cx="43" cy="30" r="3" fill="#041120"></circle>
      </svg>
    `;
    card.title = fish.name;
    card.addEventListener("click", () => {
      pickFishById(fish.id, "mouse");
    });
    fishOptions.appendChild(card);
  });
}

function pickFishById(fishId, source = "mouse") {
  if (scene !== "select" || selectLaunchLock || transitionLock) return;
  const chosen = fishTemplates.find((item) => item.id === fishId);
  if (!chosen) return;
  selectLaunchLock = true;
  player.color = chosen.color;
  player.fin = chosen.fin;
  if (source === "gesture") {
    showToast(`握拳确认：已选择 ${chosen.name}`, 1200);
  }
  switchScene("practice").finally(() => {
    selectLaunchLock = false;
  });
}

function seedStartButtonParticles() {
  document.querySelectorAll(".water-btn .particle").forEach((p) => {
    p.style.setProperty("--sx", Math.random().toFixed(2));
    p.style.setProperty("--sy", Math.random().toFixed(2));
  });
}

function createRipples(x, y, count = 1) {
  for (let i = 0; i < count; i += 1) {
    ripplePoints.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 18,
      r: 3 + Math.random() * 4,
      life: 1
    });
  }
}

function createBubbleBurst(x, y, amount = 11) {
  for (let i = 0; i < amount; i += 1) {
    bubbles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 2.8,
      vy: -Math.random() * 2.5 - 0.5,
      r: 2 + Math.random() * 4,
      life: 1
    });
  }
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function createPrey(index) {
  const size = randomRange(20, 28);
  return {
    id: `prey_${Date.now()}_${index}_${Math.floor(Math.random() * 10000)}`,
    x: randomRange(80, canvas.width - 80),
    y: randomRange(120, canvas.height - 70),
    vx: randomRange(-1.2, 1.2),
    vy: randomRange(-0.9, 0.9),
    size,
    color: `hsl(${190 + Math.random() * 80}, 72%, 62%)`,
    fin: "#d9f8ff",
    mouthOpen: false,
    dir: 1
  };
}

function startPractice() {
  score = 0;
  scoreEl.textContent = "0";
  gestureState = "none";
  prevGestureState = "none";
  updateGestureUI("none");
  resetPlayerPosition();
  player.mouthOpen = false;
  player.biteArmed = false;
  player.armedPreyId = null;
  preyList = [createPrey(0), createPrey(1), createPrey(2), createPrey(3)];
  remainEl.textContent = String(preyList.length);
  showToast("练习开始：可手势控制，或用鼠标+C/F 操作");
  if (!firstPracticeGuideShown) {
    firstPracticeGuideShown = true;
    guideModal.showModal();
  }
}

function drawWaterBackground(timeFactor, calm = false) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#081a2f");
  grad.addColorStop(0.5, "#0f3d66");
  grad.addColorStop(1, "#0a2038");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const lines = calm ? 5 : 8;
  for (let i = 0; i < lines; i += 1) {
    const y = ((i + 1) / (lines + 1)) * canvas.height * 0.85 + 30;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += 20) {
      const wave = Math.sin(x * 0.012 + timeFactor * 0.002 + i) * (calm ? 5 : 10);
      const wave2 = Math.cos(x * 0.007 - timeFactor * 0.0014 + i * 2) * (calm ? 3 : 6);
      const py = y + wave + wave2;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.strokeStyle = `rgba(149, 223, 255, ${calm ? 0.16 : 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawRipples(delta) {
  for (let i = ripplePoints.length - 1; i >= 0; i -= 1) {
    const rp = ripplePoints[i];
    rp.r += 26 * delta;
    rp.life -= 0.62 * delta;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(187, 238, 255, ${Math.max(rp.life, 0) * 0.55})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (rp.life <= 0) {
      ripplePoints.splice(i, 1);
    }
  }
}

function drawFish(fish, opts = {}) {
  const mouthOpen = Boolean(opts.mouthOpen);
  const facing = opts.facing || (fish.vx >= 0 ? 1 : -1);
  const body = fish.size;
  const tailX = fish.x - facing * body * 0.95;

  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.scale(facing, 1);
  ctx.beginPath();
  ctx.ellipse(0, 0, body, body * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = fish.color;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-body * 0.85, 0);
  ctx.lineTo(-body * 1.55, -body * 0.55);
  ctx.lineTo(-body * 1.55, body * 0.55);
  ctx.closePath();
  ctx.fillStyle = fish.fin;
  ctx.fill();

  if (mouthOpen) {
    ctx.beginPath();
    ctx.moveTo(body * 0.98, 0);
    ctx.lineTo(body * 0.65, -body * 0.22);
    ctx.lineTo(body * 0.65, body * 0.22);
    ctx.closePath();
    ctx.fillStyle = "#021524";
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(body * 0.99, -body * 0.1);
    ctx.lineTo(body * 0.99, body * 0.1);
    ctx.strokeStyle = "#06243d";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(body * 0.35, -body * 0.15, Math.max(2.5, body * 0.08), 0, Math.PI * 2);
  ctx.fillStyle = "#051426";
  ctx.fill();
  ctx.restore();

  if (opts.highlight) {
    ctx.beginPath();
    ctx.arc(fish.x, fish.y, body * 1.15, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(178, 240, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  if (opts.showBiteRange) {
    ctx.beginPath();
    ctx.arc(fish.x, fish.y, 130, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(155, 225, 255, 0.13)";
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function updatePrey(delta) {
  preyList.forEach((fish, idx) => {
    fish.x += fish.vx * 90 * delta;
    fish.y += fish.vy * 90 * delta;
    fish.vx += Math.sin(sceneTime * 0.001 + idx) * 0.003;
    fish.vy += Math.cos(sceneTime * 0.0013 + idx * 2) * 0.0025;
    fish.vx = Math.max(-1.4, Math.min(1.4, fish.vx));
    fish.vy = Math.max(-1.1, Math.min(1.1, fish.vy));
    fish.dir = fish.vx >= 0 ? 1 : -1;

    if (fish.x < 40 || fish.x > canvas.width - 40) fish.vx *= -1;
    if (fish.y < 70 || fish.y > canvas.height - 40) fish.vy *= -1;
  });
}

function updatePlayer(delta) {
  if (controlMode === "mouse") {
    player.tx = mouse.x;
    player.ty = mouse.y;
  } else if (gestureState === "fist") {
    player.tx = handTarget.x;
    player.ty = handTarget.y;
  }
  player.x += (player.tx - player.x) * Math.min(1, 5.5 * delta);
  player.y += (player.ty - player.y) * Math.min(1, 5.5 * delta);
  player.x = Math.max(50, Math.min(canvas.width - 50, player.x));
  player.y = Math.max(55, Math.min(canvas.height - 45, player.y));
}

function updateBubbles(delta) {
  for (let i = bubbles.length - 1; i >= 0; i -= 1) {
    const b = bubbles[i];
    b.x += b.vx * 60 * delta;
    b.y += b.vy * 60 * delta;
    b.life -= 0.8 * delta;
    b.vy -= 0.01;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(199, 244, 255, ${Math.max(b.life, 0) * 0.58})`;
    ctx.fill();
    if (b.life <= 0) bubbles.splice(i, 1);
  }
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function getNearestPrey() {
  if (!preyList.length) return null;
  let nearest = preyList[0];
  let minDist = distance(player, nearest);
  for (let i = 1; i < preyList.length; i += 1) {
    const d = distance(player, preyList[i]);
    if (d < minDist) {
      minDist = d;
      nearest = preyList[i];
    }
  }
  return { fish: nearest, dist: minDist };
}

function playBubbleSfx() {
  bubbleSfx.currentTime = 0;
  bubbleSfx.play().catch(() => {});
}

function attemptBite() {
  let target = null;
  if (player.armedPreyId) {
    target = preyList.find((item) => item.id === player.armedPreyId) || null;
  }
  if (!target) {
    const nearest = getNearestPrey();
    if (nearest && nearest.dist <= 132) target = nearest.fish;
  }
  if (!target) {
    player.mouthOpen = false;
    player.biteArmed = false;
    player.armedPreyId = null;
    showToast("目标太远，靠近后再尝试");
    return;
  }
  if (distance(player, target) > 140) {
    player.mouthOpen = false;
    player.biteArmed = false;
    player.armedPreyId = null;
    showToast("吞噬失败：请更靠近目标");
    return;
  }
  preyList = preyList.filter((f) => f.id !== target.id);
  score += 1;
  scoreEl.textContent = String(score);
  remainEl.textContent = String(preyList.length);
  createBubbleBurst(target.x, target.y, 13);
  createRipples(target.x, target.y, 3);
  playBubbleSfx();
  showToast("成功吞噬 +1 分");
  player.mouthOpen = false;
  player.biteArmed = false;
  player.armedPreyId = null;

  if (preyList.length === 0) {
    endPractice(true);
  }
}

function endPractice(cleared) {
  resultTitle.textContent = cleared ? "练习完成" : "练习结束";
  resultText.textContent = cleared
    ? `你吃掉了所有小鱼，最终得分 ${score} 分。`
    : `当前得分 ${score} 分，继续练习可以更熟练。`;
  if (!resultModal.open) resultModal.showModal();
}

function updateGestureUI(label) {
  const map = {
    none: "未检测",
    fist: "握拳（可移动）",
    c: "C 手势（张嘴准备）",
    open: "张开手掌"
  };
  if (controlMode === "mouse") {
    gestureStateEl.textContent = "控制模式: 鼠标（C 张嘴，F 吞噬）";
    return;
  }
  gestureStateEl.textContent = `手势状态: ${map[label] || "未识别"}`;
}

function triggerGesture(next) {
  if (gestureState === next) return;
  prevGestureState = gestureState;
  gestureState = next;
  updateGestureUI(next);
  handleGestureTransition(next);
}

function handleGestureTransition(next) {
  if (scene !== "practice") return;
  if (next === "c") {
    player.mouthOpen = true;
    player.biteArmed = true;
    const nearest = getNearestPrey();
    if (nearest && nearest.dist <= 130) {
      player.armedPreyId = nearest.fish.id;
      showToast("已张嘴，握拳即可吞噬");
    } else {
      player.armedPreyId = null;
      showToast("已张嘴，请先靠近小鱼");
    }
  }

  if (prevGestureState === "c" && next === "fist" && player.biteArmed) {
    attemptBite();
  } else if (next !== "c" && next !== "fist") {
    player.mouthOpen = false;
    player.biteArmed = false;
    player.armedPreyId = null;
  }
}

function detectGesture(landmarks) {
  const wrist = landmarks[0];
  const palm = landmarks[9];
  const tipIds = [8, 12, 16, 20];
  const pipIds = [6, 10, 14, 18];

  const curled = tipIds.map((tip, i) => {
    const pip = pipIds[i];
    const tipDist = Math.hypot(landmarks[tip].x - wrist.x, landmarks[tip].y - wrist.y);
    const pipDist = Math.hypot(landmarks[pip].x - wrist.x, landmarks[pip].y - wrist.y);
    return tipDist < pipDist * 1.02;
  });

  const thumbToPalm = Math.hypot(landmarks[4].x - palm.x, landmarks[4].y - palm.y);
  const thumbToIndex = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y);
  const allCurled = curled.every(Boolean) && thumbToPalm < 0.19;
  if (allCurled) return "fist";

  const cShape =
    thumbToIndex > 0.085 &&
    thumbToIndex < 0.24 &&
    curled[1] &&
    curled[2] &&
    curled[3] &&
    !allCurled;
  if (cShape) return "c";

  const openPalm = curled.filter(Boolean).length <= 1 && thumbToPalm > 0.2;
  if (openPalm) return "open";
  return "none";
}

async function initHandTracking() {
  if (handTrackingReady) return;
  if (!window.Hands || !window.Camera) {
    setControlMode("mouse");
    showToast("当前浏览器未加载手势库，已切换鼠标模式", 2200);
    return;
  }
  try {
    const hands = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.55
    });

    hands.onResults((results) => {
      if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
        handVisible = false;
        updateStartTip();
        updateSelectTip();
        triggerGesture("none");
        return;
      }

      handVisible = true;
      updateStartTip();
      updateSelectTip();
      if (controlMode !== "hand") {
        setControlMode("hand");
        showToast("已检测到手势，切换为手势控制", 1800);
      }
      if (scene === "start" && !startHandTipShown) {
        startHandTipShown = true;
        showToast("首页手势可用：移动到 START 后握拳进入", 2200);
      }

      const landmarks = results.multiHandLandmarks[0];
      const center = {
        x: (landmarks[0].x + landmarks[5].x + landmarks[17].x + landmarks[9].x) / 4,
        y: (landmarks[0].y + landmarks[5].y + landmarks[17].y + landmarks[9].y) / 4
      };
      handTarget.x = (HAND_X_MIRROR ? 1 - center.x : center.x) * canvas.width;
      handTarget.y = center.y * canvas.height;

      const detected = detectGesture(landmarks);
      triggerGesture(detected);
    });

    cameraRunner = new window.Camera(inputVideo, {
      onFrame: async () => {
        await hands.send({ image: inputVideo });
      },
      width: 640,
      height: 480
    });
    await cameraRunner.start();
    handTrackingReady = true;
    showToast("摄像头已启动，检测到手后自动启用手势", 1800);
  } catch (err) {
    console.error(err);
    setControlMode("mouse");
    showToast("摄像头初始化失败，已切换鼠标模式", 2200);
  }
}

function drawStartScene(delta) {
  const pointer = getScenePointer();
  const movedDist =
    scenePointerTrail.x == null
      ? 999
      : Math.hypot(pointer.x - scenePointerTrail.x, pointer.y - scenePointerTrail.y);
  if (movedDist > 5) {
    createRipples(pointer.x, pointer.y, 2);
  } else if (Math.random() < 0.08) {
    createRipples(pointer.x, pointer.y, 1);
  }
  scenePointerTrail.x = pointer.x;
  scenePointerTrail.y = pointer.y;

  const handHoverStart = pointer.source === "hand" && isPointInStartButton(pointer.x, pointer.y, 16);
  startBtn.classList.toggle("gesture-hover", handHoverStart);
  if (pointer.source === "hand") {
    if (handHoverStart && gestureState === "fist") {
      if (performance.now() - lastGestureStartTryAt > 1000) {
        lastGestureStartTryAt = performance.now();
        launchFromStart("gesture");
      }
      updateStartTip("已锁定 START，握拳确认中...");
    } else if (handHoverStart) {
      updateStartTip("已到达 START，保持手势并握拳进入");
    } else {
      updateStartTip();
    }
  } else {
    startBtn.classList.remove("gesture-hover");
    updateStartTip();
  }

  drawFish(
    {
      x: pointer.x,
      y: pointer.y,
      size: pointer.source === "hand" ? 26 : 24,
      color: pointer.source === "hand" ? "#86e4ff" : "#9ceeff",
      fin: "#dffcff",
      vx: 1
    },
    { mouthOpen: pointer.source === "hand" && gestureState === "fist", facing: 1 }
  );
  drawRipples(delta);
}

function drawSelectScene(delta) {
  for (let i = 0; i < 5; i += 1) {
    const t = sceneTime * 0.001 + i;
    drawFish(
      {
        x: canvas.width * 0.2 + i * (canvas.width * 0.15) + Math.sin(t) * 20,
        y: canvas.height * 0.72 + Math.cos(t * 1.3) * 16,
        size: 18 + i * 1.2,
        color: `hsl(${190 + i * 20}, 70%, 62%)`,
        fin: "#d6f9ff",
        vx: Math.sin(t)
      },
      { facing: Math.sin(t) >= 0 ? 1 : -1 }
    );
  }

  const pointer = getScenePointer();
  const movedDist =
    scenePointerTrail.x == null
      ? 999
      : Math.hypot(pointer.x - scenePointerTrail.x, pointer.y - scenePointerTrail.y);
  if (movedDist > 5) {
    createRipples(pointer.x, pointer.y, 2);
  } else if (Math.random() < 0.08) {
    createRipples(pointer.x, pointer.y, 1);
  }
  scenePointerTrail.x = pointer.x;
  scenePointerTrail.y = pointer.y;

  const hoveredCard = getHoveredFishCard(pointer.x, pointer.y, 12);
  clearFishCardHover();
  if (hoveredCard) hoveredCard.classList.add("gesture-hover");

  if (pointer.source === "hand") {
    if (hoveredCard && gestureState === "fist") {
      if (performance.now() - lastGestureSelectTryAt > 800) {
        lastGestureSelectTryAt = performance.now();
        pickFishById(hoveredCard.dataset.fishId, "gesture");
      }
      updateSelectTip(`已锁定 ${hoveredCard.title}，握拳确认中...`);
    } else if (hoveredCard) {
      updateSelectTip(`已悬停 ${hoveredCard.title}，握拳即可选择`);
    } else {
      updateSelectTip();
    }
  } else {
    clearFishCardHover();
    updateSelectTip();
  }

  drawFish(
    {
      x: pointer.x,
      y: pointer.y,
      size: pointer.source === "hand" ? 26 : 24,
      color: pointer.source === "hand" ? "#86e4ff" : "#9ceeff",
      fin: "#dffcff",
      vx: 1
    },
    { mouthOpen: pointer.source === "hand" && gestureState === "fist", facing: 1 }
  );
  drawRipples(delta);
}

function drawPracticeScene(delta) {
  updatePrey(delta);
  updatePlayer(delta);
  drawRipples(delta);

  preyList.forEach((fish) => drawFish(fish, { facing: fish.dir }));
  const nearest = getNearestPrey();
  drawFish(player, {
    mouthOpen: player.mouthOpen,
    facing: player.tx >= player.x ? 1 : -1,
    highlight: true,
    showBiteRange: true
  });
  if (nearest && nearest.dist <= 130 && player.mouthOpen) {
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(nearest.fish.x, nearest.fish.y);
    ctx.strokeStyle = "rgba(176, 237, 255, 0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  updateBubbles(delta);
}

function loop(now) {
  const delta = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
  lastTime = now;
  sceneTime += delta * 1000;

  drawWaterBackground(now, scene !== "practice");
  if (scene === "start") drawStartScene(delta);
  if (scene === "select") drawSelectScene(delta);
  if (scene === "practice") drawPracticeScene(delta);

  requestAnimationFrame(loop);
}

function bindEvents() {
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (scene === "start" || scene === "select") createRipples(mouse.x, mouse.y, 2);
  });

  canvas.addEventListener("pointerdown", () => {
    if (scene !== "practice" || controlMode !== "mouse") return;
    triggerGesture("fist");
  });

  window.addEventListener("keydown", (e) => {
    if (scene !== "practice" || controlMode !== "mouse" || e.repeat) return;
    const key = e.key.toLowerCase();
    if (key === "c") {
      triggerGesture("c");
    }
    if (key === "f" || key === " ") {
      triggerGesture("fist");
    }
  });

  window.addEventListener("keyup", (e) => {
    if (scene !== "practice" || controlMode !== "mouse") return;
    const key = e.key.toLowerCase();
    if (key === "c" && gestureState === "c") {
      triggerGesture("none");
    }
    if ((key === "f" || key === " ") && gestureState === "fist" && !player.biteArmed) {
      triggerGesture("none");
    }
  });

  startBtn.addEventListener("click", async () => {
    launchFromStart("mouse");
  });

  helpBtn.addEventListener("click", () => {
    if (!guideModal.open) guideModal.showModal();
  });

  closeGuide.addEventListener("click", () => {
    guideModal.close();
  });

  restartBtn.addEventListener("click", async () => {
    resultModal.close();
    await switchScene("start");
  });
}

function init() {
  resizeCanvas();
  setActiveSceneUI("start");
  initFishCards();
  seedStartButtonParticles();
  if (location.protocol === "file:") {
    showToast("本地直开模式：已尝试在首页启动手势识别", 1800);
  }
  bindEvents();
  initHandTracking();
  requestAnimationFrame(loop);
}

init();
