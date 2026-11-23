import * as THREE from 'three';

// Brand palette (mirrors tailwind.config.js)
const C = {
  yellow: '#FFD60A',
  magenta: '#FF2E88',
  cyan: '#22D3EE',
  skin: '#FFE2CC',
  navy: '#26264A',
  dark: '#14142A',
  white: '#F5F5FA',
  ink: '#120B24',
  green: '#22C55E',
  red: '#FF3B4E'
};

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const smooth = (x, a, b) => {
  const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

const lerpAngle = (a, b, k) => {
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * k;
};

// Stage layout: Flash-chan (outside) on the left, entry gate in the middle, Gate-kun on the right
const FLASH_X = -1.4;
const GATE_X = 1.35;
const GATE_Z = -0.6;
const POST_X = 0.95;
const CHAR_SCALE = 0.9;
const SQUASH = 0.58; // elliptical stage depth

// Gate interaction script — mirrors the real scan results (see SCAN_RESULTS on the server):
// ENTRY_OK lets her in; she sneaks back out without an exit scan, so the next try is ALREADY_INSIDE
const SCRIPT = ['ok', 'denied'];
const PRESENT_HOLD = 0.9; // extra seconds holding the pass up before the scan (room for dialogue)
const BLOCK_AT = 2.45; // when Gate-kun's palm stops her on an ALREADY INSIDE round

// Seeded RNG so the ticket QR + particles look the same on every load
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeToonGradient() {
  const data = new Uint8Array([70, 150, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawTicket(canvas) {
  // Draw in 512x288 units, rasterised at 3x so text stays crisp on hi-DPI screens
  const W = 512, H = 288, S = 3;
  canvas.width = W * S;
  canvas.height = H * S;
  const c = canvas.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  const path = (x, y, w, h) => roundRect(c, x, y, w, h, 28);
  c.clearRect(0, 0, W, H);
  c.textBaseline = 'alphabetic';
  path(6, 6, W - 12, H - 12);
  c.fillStyle = C.yellow;
  c.fill();
  c.save();
  c.clip();
  // halftone dots
  c.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < H; y += 14) for (let x = 0; x < W; x += 14) {
    c.beginPath(); c.arc(x, y, 2.2, 0, TAU); c.fill();
  }
  // bottom magenta strip
  c.fillStyle = C.magenta;
  c.fillRect(0, H - 70, W, 70);
  c.restore();
  c.lineWidth = 10;
  c.strokeStyle = '#000';
  path(6, 6, W - 12, H - 12);
  c.stroke();

  // perforation
  c.setLineDash([10, 10]);
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(345, 20); c.lineTo(345, H - 80); c.stroke();
  c.setLineDash([]);

  c.fillStyle = '#111';
  c.font = '78px Bangers, Impact, "Arial Black", sans-serif';
  c.fillText('FLASHPASS', 26, 102);
  c.font = '800 28px "JetBrains Mono", monospace';
  c.fillText('ALL ACCESS', 30, 148);
  c.font = '800 24px "JetBrains Mono", monospace';
  c.fillText('3-DAY • ₹52', 30, 186);
  c.fillStyle = '#fff';
  c.font = '40px Bangers, Impact, "Arial Black", sans-serif';
  c.fillText('ADMIT ONE ⚡ ZERO QUEUE', 28, H - 24);

  // QR-ish block
  const rand = rng(42);
  const qx = 370, qy = 40, cells = 11, cs = 11;
  c.fillStyle = '#fff';
  c.fillRect(qx - 8, qy - 8, cells * cs + 16, cells * cs + 16);
  c.fillStyle = '#000';
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const finder = (i < 3 && j < 3) || (i > 7 && j < 3) || (i < 3 && j > 7);
    if (finder || rand() > 0.5) c.fillRect(qx + i * cs, qy + j * cs, cs, cs);
  }
}

// Handheld gate scanner screen: ready → scanning → ENTRY OK / ALREADY INSIDE
function drawScannerScreen(canvas, state) {
  const W = 176, H = 208, S = 2;
  canvas.width = W * S;
  canvas.height = H * S;
  const c = canvas.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  const bg = { ready: '#06202a', scan: '#1c0b2a', ok: C.green, denied: C.red }[state];
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  c.textAlign = 'center';
  c.fillStyle = state === 'ok' || state === 'denied' ? '#fff' : C.cyan;
  c.font = '800 15px "JetBrains Mono", monospace';
  c.fillText('GATE 1 • ENTRY', W / 2, 26);
  const big = '60px Bangers, Impact, "Arial Black", sans-serif';
  const mid = '30px Bangers, Impact, "Arial Black", sans-serif';
  if (state === 'ready') {
    c.strokeStyle = C.cyan;
    c.lineWidth = 5;
    const b = 40, x0 = 38, y0 = 48, sz = 100;
    [[x0, y0, 1, 1], [x0 + sz, y0, -1, 1], [x0, y0 + sz, 1, -1], [x0 + sz, y0 + sz, -1, -1]].forEach(([x, y, dx, dy]) => {
      c.beginPath(); c.moveTo(x, y + dy * b / 2); c.lineTo(x, y); c.lineTo(x + dx * b / 2, y); c.stroke();
    });
    c.font = mid;
    c.fillText('READY', W / 2, 188);
  } else if (state === 'scan') {
    c.fillStyle = C.red;
    c.fillRect(20, 96, W - 40, 6);
    c.fillStyle = C.magenta;
    c.font = mid;
    c.fillText('SCANNING…', W / 2, 160);
  } else {
    c.font = big;
    c.fillText(state === 'ok' ? '✓' : '✕', W / 2, 108);
    c.font = mid;
    c.fillText(state === 'ok' ? 'ENTRY OK' : 'ALREADY IN', W / 2, 150);
    c.font = '800 14px "JetBrains Mono", monospace';
    c.fillText(state === 'ok' ? '0.31s • DAY 1' : 'ANTI-PASSBACK', W / 2, 182);
  }
}

// Floating verdict hologram above the two characters
function drawStatus(canvas, ok) {
  const W = 256, S = 2;
  canvas.width = canvas.height = W * S;
  const c = canvas.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  c.clearRect(0, 0, W, W);
  c.beginPath();
  c.arc(W / 2, W / 2, 104, 0, TAU);
  c.fillStyle = ok ? C.green : C.red;
  c.fill();
  c.lineWidth = 14;
  c.strokeStyle = '#000';
  c.stroke();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const glyph = () => {
    c.beginPath();
    if (ok) {
      c.moveTo(78, 132); c.lineTo(112, 166); c.lineTo(180, 92);
    } else {
      c.moveTo(88, 88); c.lineTo(168, 168); c.moveTo(168, 88); c.lineTo(88, 168);
    }
    c.stroke();
  };
  c.lineWidth = 34; c.strokeStyle = '#000'; glyph();
  c.lineWidth = 20; c.strokeStyle = '#fff'; glyph();
}

function drawBadge(canvas) {
  const W = 128, H = 160, S = 2;
  canvas.width = W * S;
  canvas.height = H * S;
  const c = canvas.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  roundRect(c, 4, 4, W - 8, H - 8, 14);
  c.fillStyle = C.magenta;
  c.fill();
  c.lineWidth = 6;
  c.strokeStyle = '#000';
  c.stroke();
  c.textAlign = 'center';
  c.fillStyle = '#fff';
  c.font = '44px Bangers, Impact, "Arial Black", sans-serif';
  c.fillText('STAFF', W / 2, 62);
  c.fillStyle = C.yellow;
  c.fillRect(16, 78, W - 32, 34);
  c.fillStyle = '#111';
  c.font = '800 17px "JetBrains Mono", monospace';
  c.fillText('GATE 1', W / 2, 101);
  c.fillStyle = '#fff';
  c.font = '800 13px "JetBrains Mono", monospace';
  c.fillText('FLASHPASS', W / 2, 136);
}

function drawGateSign(canvas) {
  const W = 512, H = 100, S = 2;
  canvas.width = W * S;
  canvas.height = H * S;
  const c = canvas.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  c.fillStyle = C.dark;
  c.fillRect(0, 0, W, H);
  c.fillStyle = C.magenta;
  c.fillRect(0, H - 12, W, 12);
  c.textAlign = 'center';
  c.fillStyle = C.yellow;
  c.font = '62px Bangers, Impact, "Arial Black", sans-serif';
  c.fillText('⚡ GATE 1 • ENTRY ⚡', W / 2, 68);
}

function makeSpriteTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function boltGeometry(scale = 1) {
  const s = new THREE.Shape();
  s.moveTo(0.12, 0.5);
  s.lineTo(-0.25, -0.02);
  s.lineTo(-0.02, -0.02);
  s.lineTo(-0.14, -0.5);
  s.lineTo(0.27, 0.08);
  s.lineTo(0.04, 0.08);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1
  });
  geo.center();
  geo.scale(scale, scale, scale);
  return geo;
}

/**
 * Builds the FlashPass hero scene inside `container`: Flash-chan (fan with the pass)
 * and Gate-kun (gate volunteer with the scanner) acting out a gate scan on loop.
 * `onBeat(name, kind)` fires on 'present' | 'scan' | 'ok' | 'denied' | 'highfive' | 'inside' | 'sneak' | 'blocked' | 'end'.
 * Returns a controller with `dispose()` and `scan()` (start a scan round now).
 */
export function createHeroScene(container, { onBeat, reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.cursor = 'pointer';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 2.2, 10.8);
  const lookAt = new THREE.Vector3(0, 1.85, 0);
  camera.position.copy(camBase);

  // ---------- Lights ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rimM = new THREE.PointLight(C.magenta, 30, 12);
  rimM.position.set(-4, 3, -2.5);
  scene.add(rimM);
  const rimC = new THREE.PointLight(C.cyan, 30, 12);
  rimC.position.set(4, 2.5, -2.5);
  scene.add(rimC);

  // ---------- Material helpers ----------
  const gradientMap = makeToonGradient();
  const matCache = new Map();
  const toon = (color, emissive = null, emissiveIntensity = 0.5) => {
    const k = `${color}|${emissive}|${emissiveIntensity}`;
    if (!matCache.has(k)) {
      const m = new THREE.MeshToonMaterial({ color, gradientMap });
      if (emissive) {
        m.emissive = new THREE.Color(emissive);
        m.emissiveIntensity = emissiveIntensity;
      }
      matCache.set(k, m);
    }
    return matCache.get(k);
  };
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const extraTextures = [];

  // Inverted-hull comic outline
  const part = (geo, mat, outline = 1.06) => {
    const m = new THREE.Mesh(geo, mat);
    if (outline) {
      const o = new THREE.Mesh(geo, outlineMat);
      o.scale.setScalar(outline);
      m.add(o);
    }
    return m;
  };

  const UP = new THREE.Vector3(0, 1, 0);
  const onSphere = (r, theta, phi) =>
    new THREE.Vector3(r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta), r * Math.sin(theta) * Math.cos(phi));
  const addSpike = (parent, mat, base, dir, len, rad) => {
    const g = new THREE.ConeGeometry(rad, len, 7);
    g.translate(0, len / 2, 0);
    const s = part(g, mat, 1.07);
    s.position.copy(base);
    s.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    parent.add(s);
    return s;
  };

  // Anime eye: sclera, layered iris, highlights, lash, wing and brow
  const makeEye = (head, side, o) => {
    const eye = new THREE.Group();
    eye.position.set(side * o.x, o.y, o.z);
    eye.rotation.y = side * 0.36;
    const sclera = part(new THREE.SphereGeometry(1, 24, 18), toon(C.white), 1.12);
    sclera.scale.set(0.15, o.h, 0.05);
    eye.add(sclera);

    const iris = new THREE.Group();
    const irisMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), toon(o.iris, o.irisDeep, 0.35));
    irisMesh.scale.set(0.11, o.h - 0.04, 0.04);
    irisMesh.position.z = 0.022;
    iris.add(irisMesh);
    // Darker limbal ring + lower glow give the iris anime-style depth
    const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), new THREE.MeshBasicMaterial({ color: o.ring }));
    ring.scale.set(0.125, o.h - 0.025, 0.035);
    ring.position.z = 0.018;
    iris.add(ring);
    const lowGlow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: o.glow }));
    lowGlow.scale.set(0.065, 0.04, 0.02);
    lowGlow.position.set(0, -(o.h - 0.1), 0.055);
    iris.add(lowGlow);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: C.ink }));
    pupil.scale.set(0.06, o.h * 0.47, 0.03);
    pupil.position.z = 0.045;
    iris.add(pupil);
    const hl = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), hl);
    h1.position.set(0.035, o.h * 0.32, 0.07);
    iris.add(h1);
    const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), hl);
    h2.position.set(-0.035, -o.h * 0.29, 0.065);
    iris.add(h2);
    eye.add(iris);

    const lash = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.05), new THREE.MeshBasicMaterial({ color: C.ink }));
    lash.position.set(side * 0.02, o.h - 0.01, 0.02);
    lash.rotation.z = side * -0.18;
    eye.add(lash);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.04), new THREE.MeshBasicMaterial({ color: C.ink }));
    wing.position.set(side * 0.19, o.h - 0.04, 0.02);
    wing.rotation.z = side * 0.55;
    eye.add(wing);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, o.browH, 0.03), new THREE.MeshBasicMaterial({ color: o.brow }));
    brow.position.set(side * 0.02, o.h + 0.1, -0.01);
    brow.rotation.z = side * o.browTilt;
    eye.add(brow);

    head.add(eye);
    return { eye, iris, brow };
  };

  // ---------- Stage ----------
  const stage = new THREE.Group();
  scene.add(stage);

  const platform = part(new THREE.CylinderGeometry(2.7, 2.85, 0.22, 64), toon(C.dark), 1.03);
  platform.position.y = -0.11;
  platform.scale.z = SQUASH;
  stage.add(platform);

  const glowRingMat = new THREE.MeshBasicMaterial({ color: C.yellow });
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.035, 8, 128), glowRingMat);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.01;
  stage.add(glowRing);

  const orbitWrap = new THREE.Group();
  orbitWrap.scale.z = SQUASH;
  orbitWrap.position.y = 0.05;
  stage.add(orbitWrap);
  const orbitRing = new THREE.Group();
  const orbitTorus = new THREE.Mesh(
    new THREE.TorusGeometry(3.1, 0.015, 6, 160),
    new THREE.MeshBasicMaterial({ color: C.magenta, transparent: true, opacity: 0.8 })
  );
  orbitTorus.rotation.x = Math.PI / 2;
  orbitRing.add(orbitTorus);
  const nodeGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  const nodeMat = new THREE.MeshBasicMaterial({ color: C.cyan });
  for (let i = 0; i < 14; i++) {
    const n = new THREE.Mesh(nodeGeo, nodeMat);
    const a = (i / 14) * TAU;
    n.position.set(Math.cos(a) * 3.1, 0, Math.sin(a) * 3.1);
    orbitRing.add(n);
  }
  orbitWrap.add(orbitRing);

  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(C.yellow) }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main(){
        float a = pow(1.0 - vUv.y, 1.6) * 0.28;
        a *= 0.7 + 0.3 * sin(vUv.y * 36.0 - uTime * 5.0);
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const beamGeo = new THREE.CylinderGeometry(0.95, 1.3, 3.6, 48, 1, true);
  const shadowGeo = new THREE.CircleGeometry(0.8, 32);

  // Each character stands in its own root (light beam + contact shadow travel with it)
  const makeRoot = (x) => {
    const root = new THREE.Group();
    root.position.x = x;
    root.scale.setScalar(CHAR_SCALE);
    stage.add(root);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 1.8;
    root.add(beam);
    const shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.014;
    root.add(shadow);
    return { root, shadow, beam };
  };

  // ---------- Entry gate: arch + glass flap doors ----------
  const gate = new THREE.Group();
  gate.position.z = GATE_Z;
  stage.add(gate);
  const gateLedMat = new THREE.MeshBasicMaterial({ color: C.cyan });
  [-1, 1].forEach((side) => {
    const post = part(new THREE.BoxGeometry(0.3, 3.7, 0.42), toon(C.navy), 1.04);
    post.position.set(side * POST_X, 1.85, 0);
    gate.add(post);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.2, 0.3), gateLedMat);
    strip.position.set(side * (POST_X - 0.16), 1.85, 0);
    gate.add(strip);
  });
  const lintel = part(new THREE.BoxGeometry(2.3, 0.5, 0.46), toon(C.dark), 1.04);
  lintel.position.y = 3.95;
  gate.add(lintel);
  const signCanvas = document.createElement('canvas');
  drawGateSign(signCanvas);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.43), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0, 3.95, 0.235);
  gate.add(sign);
  // NFC/QR reader pad on Gate-kun's post
  const pad = part(new THREE.BoxGeometry(0.2, 0.26, 0.06), toon(C.ink), 1.1);
  pad.position.set(POST_X, 1.6, 0.24);
  gate.add(pad);
  const padLight = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), gateLedMat);
  padLight.position.set(POST_X, 1.6, 0.275);
  gate.add(padLight);

  const doorMat = new THREE.MeshBasicMaterial({
    color: C.cyan, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false
  });
  const doorW = POST_X - 0.16;
  const doors = [-1, 1].map((side) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * (POST_X - 0.15), 0, 0);
    gate.add(hinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(doorW, 1.1, 0.03), doorMat);
    panel.position.set(-side * doorW / 2, 1.05, 0);
    hinge.add(panel);
    const rail = part(new THREE.BoxGeometry(doorW, 0.07, 0.07), toon(C.ink), 1.08);
    rail.position.set(-side * doorW / 2, 1.62, 0);
    hinge.add(rail);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), gateLedMat);
    edge.position.set(-side * (doorW - 0.03), 1.05, 0);
    hinge.add(edge);
    return { hinge, side };
  });

  // ---------- Flash-chan ----------
  const { root: flashRoot, shadow, beam: flashBeam } = makeRoot(FLASH_X);
  const char = new THREE.Group();
  flashRoot.add(char);

  // Legs
  const makeLeg = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.95, 0);
    const leg = part(new THREE.CapsuleGeometry(0.13, 0.42, 6, 12), toon(C.navy));
    leg.position.y = -0.32;
    pivot.add(leg);
    const shoe = part(new THREE.SphereGeometry(1, 20, 14), toon(C.magenta));
    shoe.scale.set(0.17, 0.13, 0.25);
    shoe.position.set(0, -0.7, 0.06);
    pivot.add(shoe);
    const sole = part(new THREE.SphereGeometry(1, 20, 10), toon(C.white), 1.05);
    sole.scale.set(0.18, 0.05, 0.26);
    sole.position.set(0, -0.79, 0.06);
    pivot.add(sole);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.1), toon(C.white));
    lace.position.set(0, -0.6, 0.14);
    lace.rotation.x = -0.5;
    pivot.add(lace);

    // Hover-boot thruster flame
    const jet = new THREE.Group();
    jet.position.set(0, -0.84, 0.05);
    const outer = new THREE.ConeGeometry(0.13, 0.5, 16, 1, true);
    outer.rotateX(Math.PI);
    outer.translate(0, -0.25, 0);
    jet.add(new THREE.Mesh(outer, jetMat));
    const inner = new THREE.ConeGeometry(0.06, 0.28, 12, 1, true);
    inner.rotateX(Math.PI);
    inner.translate(0, -0.14, 0);
    jet.add(new THREE.Mesh(inner, jetCoreMat));
    pivot.add(jet);
    jets.push(jet);

    char.add(pivot);
    return pivot;
  };
  const jets = [];
  const jetMat = new THREE.MeshBasicMaterial({
    color: C.cyan, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const jetCoreMat = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const legL = makeLeg(0.17);
  const legR = makeLeg(-0.17);

  // Torso
  const torso = new THREE.Group();
  torso.position.y = 1.3;
  char.add(torso);
  const jacket = part(new THREE.CapsuleGeometry(0.4, 0.35, 8, 20), toon(C.yellow));
  jacket.scale.set(1, 1, 0.82);
  torso.add(jacket);
  const pants = part(new THREE.CylinderGeometry(0.36, 0.4, 0.26, 24), toon(C.navy), 1.04);
  pants.position.y = -0.42;
  torso.add(pants);
  const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.03), toon(C.ink));
  zipper.position.set(0, 0.02, 0.33);
  torso.add(zipper);
  const emblem = part(boltGeometry(0.32), toon(C.magenta, C.magenta, 0.3), 1.12);
  emblem.position.set(0.18, 0.12, 0.33);
  torso.add(emblem);

  // Jacket details: magenta hem band, belt + buckle, pockets, popped collar
  const hem = part(new THREE.TorusGeometry(0.39, 0.05, 8, 32), toon(C.magenta), 1.06);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.84, 1);
  hem.position.y = -0.3;
  torso.add(hem);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.035, 6, 32), toon(C.ink));
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.9, 1);
  belt.position.y = -0.38;
  torso.add(belt);
  const buckle = part(new THREE.BoxGeometry(0.12, 0.08, 0.04), toon(C.yellow, C.yellow, 0.4), 1.15);
  buckle.position.set(0, -0.38, 0.34);
  torso.add(buckle);
  [-1, 1].forEach((side) => {
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.04), toon(C.ink));
    pocket.position.set(side * 0.2, -0.12, 0.31);
    pocket.rotation.set(0, side * 0.45, side * 0.35);
    torso.add(pocket);
  });
  const collar = part(
    new THREE.CylinderGeometry(0.3, 0.26, 0.2, 24, 1, true, Math.PI * 0.35, Math.PI * 1.3),
    new THREE.MeshToonMaterial({ color: C.yellow, gradientMap, side: THREE.DoubleSide }),
    1.04
  );
  collar.position.y = 0.5;
  torso.add(collar);

  // Scarf
  const scarf = part(new THREE.TorusGeometry(0.27, 0.09, 10, 24), toon(C.cyan), 1.05);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.55;
  torso.add(scarf);
  const makeTail = (len, x, rotZ) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.52, 0.18);
    const g = new THREE.BoxGeometry(0.17, len, 0.05);
    g.translate(0, -len / 2, 0);
    const tail = part(g, toon(C.cyan), 1.08);
    pivot.add(tail);
    pivot.rotation.z = rotZ;
    torso.add(pivot);
    return pivot;
  };
  const tailA = makeTail(0.62, 0.15, 0.9);
  const tailB = makeTail(0.45, 0.1, 0.55);

  // Arms (shared by both characters — sleeve/cuff colours vary)
  const makeArm = (parent, x, { sleeve: sleeveColor, cuff: cuffColor, skin, band: withBand = false }) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, 0);
    const sleeve = part(new THREE.CapsuleGeometry(0.115, 0.42, 6, 12), toon(sleeveColor));
    sleeve.position.y = -0.3;
    pivot.add(sleeve);
    const cuff = part(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 16), toon(cuffColor), 1.05);
    cuff.position.y = -0.5;
    pivot.add(cuff);
    if (withBand) {
      // Glowing smart-band
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 20), new THREE.MeshBasicMaterial({ color: C.cyan }));
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.56;
      pivot.add(band);
    }
    const hand = part(new THREE.SphereGeometry(1, 16, 12), toon(skin));
    hand.scale.set(0.12, 0.13, 0.1);
    hand.position.y = -0.66;
    pivot.add(hand);
    const thumb = part(new THREE.SphereGeometry(0.045, 10, 8), toon(skin), 1.12);
    thumb.position.set(-Math.sign(x) * 0.09, -0.62, 0.05);
    pivot.add(thumb);
    parent.add(pivot);
    return pivot;
  };
  const flashArmLook = { sleeve: C.yellow, cuff: C.magenta, skin: C.skin, band: true };
  const armWave = makeArm(torso, 0.48, flashArmLook);
  const armTicket = makeArm(torso, -0.48, flashArmLook);

  // Ticket (held in armTicket, counter-rotated so it faces the camera)
  const TICKET_ARM = { x: -1.2, z: -0.15 };
  const ticketHolder = new THREE.Group();
  ticketHolder.position.y = -0.66;
  ticketHolder.rotation.set(-TICKET_ARM.x, 0, -TICKET_ARM.z, 'ZYX');
  armTicket.add(ticketHolder);

  const ticketCanvas = document.createElement('canvas');
  drawTicket(ticketCanvas);
  const ticketTex = new THREE.CanvasTexture(ticketCanvas);
  ticketTex.colorSpace = THREE.SRGBColorSpace;
  ticketTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ticketFace = new THREE.MeshBasicMaterial({ map: ticketTex, transparent: true });
  const ticketEdge = toon(C.yellow);
  const ticket = new THREE.Group();
  const ticketCard = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.506, 0.02),
    [ticketEdge, ticketEdge, ticketEdge, ticketEdge, ticketFace, ticketEdge]
  );
  ticket.add(ticketCard);
  const ticketGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 0.85),
    new THREE.MeshBasicMaterial({
      map: makeSpriteTexture(), color: C.yellow, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  ticketGlow.position.z = -0.03;
  ticket.add(ticketGlow);
  ticket.position.set(-0.26, 0.22, 0.1);
  ticket.scale.setScalar(1.15);
  ticketHolder.add(ticket);

  // QR target on the ticket face + red scan line that sweeps it
  const qrAnchor = new THREE.Object3D();
  qrAnchor.position.set(0.306, 0.077, 0.015);
  ticket.add(qrAnchor);
  const scanBarMat = new THREE.MeshBasicMaterial({
    color: C.red, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const scanBar = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.018), scanBarMat);
  scanBar.position.copy(qrAnchor.position).setZ(0.016);
  ticket.add(scanBar);

  // Head
  const neck = part(new THREE.CylinderGeometry(0.11, 0.12, 0.18, 12), toon(C.skin), 1.04);
  neck.position.y = 1.9;
  char.add(neck);

  const head = new THREE.Group();
  head.position.y = 2.45;
  char.add(head);
  const R = 0.62;
  head.add(part(new THREE.SphereGeometry(R, 40, 30), toon(C.skin), 1.035));

  // Anime eyes
  const flashEyeLook = {
    x: 0.21, y: -0.02, z: 0.555, h: 0.19, iris: C.cyan, irisDeep: '#0b6f80', ring: '#0d4f63',
    glow: '#a8f7ff', brow: '#9b1452', browH: 0.03, browTilt: -0.05
  };
  const flashEyes = [-1, 1].map((side) => makeEye(head, side, flashEyeLook));
  const eyes = flashEyes.map((e) => e.eye);
  const irises = flashEyes.map((e) => e.iris);

  // Tiny anime nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), toon('#f3b49b'));
  nose.position.set(0, -0.12, 0.615);
  head.add(nose);

  // Mouth (open happy smile)
  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(0.075, 20, Math.PI, Math.PI),
    new THREE.MeshBasicMaterial({ color: '#7a1033', side: THREE.DoubleSide })
  );
  mouth.position.set(0, -0.24, 0.575);
  mouth.rotation.x = -0.4;
  head.add(mouth);
  const tongue = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 16, Math.PI, Math.PI),
    new THREE.MeshBasicMaterial({ color: '#ff6f9c', side: THREE.DoubleSide })
  );
  tongue.position.set(0, -0.285, 0.565);
  tongue.rotation.x = -0.4;
  head.add(tongue);

  // Blush
  const blushMat = new THREE.MeshBasicMaterial({ color: '#ff7aa8', transparent: true, opacity: 0.55, depthWrite: false });
  [-1, 1].forEach((side) => {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), blushMat);
    b.scale.y = 0.6;
    b.position.set(side * 0.34, -0.17, 0.505);
    b.rotation.y = side * 0.6;
    head.add(b);
  });

  // Embarrassed sweat drop (shows when the gate says "already inside")
  const sweat = new THREE.Group();
  const sweatMat = toon('#bdf4ff', C.cyan, 0.3);
  const drop = part(new THREE.SphereGeometry(0.07, 14, 10), sweatMat, 1.15);
  sweat.add(drop);
  const dropTip = new THREE.ConeGeometry(0.066, 0.12, 14);
  dropTip.translate(0, 0.075, 0);
  sweat.add(part(dropTip, sweatMat, 1.12));
  sweat.position.set(-0.55, 0.3, 0.35);
  sweat.scale.setScalar(0.001);
  head.add(sweat);

  // Hair
  const hair = new THREE.Group();
  head.add(hair);
  const hairMat = toon(C.magenta);
  const hairBack = part(new THREE.SphereGeometry(R + 0.04, 32, 24, Math.PI, Math.PI, 0, 2.3), hairMat, 1.03);
  hair.add(hairBack);
  const hairTop = part(new THREE.SphereGeometry(R + 0.045, 32, 24, 0, TAU, 0, 1.05), hairMat, 1.03);
  hair.add(hairTop);

  const spikeRand = rng(7);

  // Swept-back spikes around crown and back
  [0.25, 0.75, 1.2, 1.65, 2.05].forEach((theta, ring) => {
    const count = [5, 9, 10, 9, 7][ring];
    for (let i = 0; i < count; i++) {
      const phi = (i / count) * TAU + ring * 0.3;
      const front = Math.cos(phi) > 0.35 && theta > 0.6;
      if (front) continue;
      const base = onSphere(R - 0.05, theta, phi);
      const dir = base.clone().normalize();
      dir.z -= 0.45;
      dir.y += 0.15;
      addSpike(hair, hairMat, base, dir, 0.42 + spikeRand() * 0.3 + (theta > 1.5 ? 0.15 : 0), 0.17 + spikeRand() * 0.06);
    }
  });

  // Front bangs
  [-0.85, -0.55, -0.25, 0.05, 0.35, 0.65].forEach((a, i) => {
    const base = onSphere(R - 0.04, 0.6, a);
    const dir = new THREE.Vector3(Math.sin(a) * 0.5 + (i % 2 ? 0.08 : -0.08), -1, 0.75);
    addSpike(hair, hairMat, base, dir, i % 2 ? 0.4 : 0.46, 0.16);
  });

  // Side locks framing the face
  [-1, 1].forEach((side) => {
    const base = onSphere(R - 0.02, 1.15, side * 1.15);
    addSpike(hair, hairMat, base, new THREE.Vector3(side * 0.25, -1, 0.2), 0.62, 0.12);
  });

  // Ahoge (signature antenna strand)
  const ahogeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.05, 0.25, 0.08),
    new THREE.Vector3(0.22, 0.4, 0.05),
    new THREE.Vector3(0.32, 0.3, -0.02)
  ]);
  const ahogePivot = new THREE.Group();
  ahogePivot.position.set(0, R + 0.02, 0.05);
  ahogePivot.add(part(new THREE.TubeGeometry(ahogeCurve, 20, 0.035, 6, false), hairMat, 1.15));
  head.add(ahogePivot);

  // Headphones
  const phones = new THREE.Group();
  head.add(phones);
  const band = part(new THREE.TorusGeometry(R + 0.1, 0.045, 8, 40, Math.PI), toon(C.ink), 1.08);
  band.rotation.x = -0.25;
  phones.add(band);
  [-1, 1].forEach((side) => {
    const cup = part(new THREE.CylinderGeometry(0.19, 0.19, 0.14, 24), toon(C.ink), 1.06);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(side * (R + 0.02), 0, -0.02);
    phones.add(cup);
    const led = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 24), new THREE.MeshBasicMaterial({ color: C.cyan }));
    led.rotation.y = Math.PI / 2;
    led.position.set(side * (R + 0.1), 0, -0.02);
    phones.add(led);
  });

  // ---------- Gate-kun: the FlashPass gate volunteer ----------
  const GK = { skin: '#F1C6A1', hair: '#ECEBFF', jacket: '#3D3D86' };
  const { root: gateRoot, shadow: gkShadow, beam: gkBeam } = makeRoot(GATE_X);
  const gk = new THREE.Group();
  gateRoot.add(gk);

  // Grounded legs (no hover boots — he's the one standing at the gate)
  const makeGkLeg = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.95, 0);
    const leg = part(new THREE.CapsuleGeometry(0.14, 0.44, 6, 12), toon(C.ink));
    leg.position.y = -0.34;
    pivot.add(leg);
    const shoe = part(new THREE.SphereGeometry(1, 20, 14), toon(C.cyan));
    shoe.scale.set(0.18, 0.13, 0.27);
    shoe.position.set(0, -0.72, 0.07);
    pivot.add(shoe);
    const sole = part(new THREE.SphereGeometry(1, 20, 10), toon(C.white), 1.05);
    sole.scale.set(0.19, 0.05, 0.28);
    sole.position.set(0, -0.81, 0.07);
    pivot.add(sole);
    gk.add(pivot);
    return pivot;
  };
  const gkLegL = makeGkLeg(0.18);
  const gkLegR = makeGkLeg(-0.18);

  const gkTorso = new THREE.Group();
  gkTorso.position.y = 1.32;
  gk.add(gkTorso);
  const hoodie = part(new THREE.CapsuleGeometry(0.42, 0.36, 8, 20), toon(GK.jacket));
  hoodie.scale.set(1, 1, 0.84);
  gkTorso.add(hoodie);
  const gkPants = part(new THREE.CylinderGeometry(0.37, 0.41, 0.26, 24), toon(C.ink), 1.04);
  gkPants.position.y = -0.44;
  gkTorso.add(gkPants);

  // Hi-vis vest, open at the front, with reflective stripes
  const vestMat = new THREE.MeshToonMaterial({ color: C.cyan, gradientMap, side: THREE.DoubleSide });
  const vest = part(new THREE.CylinderGeometry(0.445, 0.455, 0.62, 28, 1, true, 0.55, TAU - 1.1), vestMat, 1.03);
  vest.scale.z = 0.86;
  vest.position.y = 0.02;
  gkTorso.add(vest);
  const stripeMat = new THREE.MeshBasicMaterial({ color: C.yellow, side: THREE.DoubleSide });
  [-0.14, 0.12].forEach((y) => {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.458, 0.46, 0.055, 28, 1, true, 0.55, TAU - 1.1), stripeMat);
    stripe.scale.z = 0.87;
    stripe.position.y = y;
    gkTorso.add(stripe);
  });
  // Hood bunched behind the neck
  const hood = part(new THREE.TorusGeometry(0.26, 0.1, 10, 24), toon(GK.jacket), 1.05);
  hood.rotation.x = Math.PI / 2 - 0.25;
  hood.position.set(0, 0.55, -0.05);
  gkTorso.add(hood);
  // Radio pouch on the belt
  const radio = part(new THREE.BoxGeometry(0.12, 0.18, 0.08), toon(C.ink), 1.08);
  radio.position.set(-0.36, -0.36, 0.12);
  radio.rotation.y = -0.5;
  gkTorso.add(radio);
  const radioLed = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: C.green }));
  radioLed.position.set(0, 0.06, 0.045);
  radio.add(radioLed);

  // Lanyard + STAFF badge
  [-1, 1].forEach((side) => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.015), toon(C.magenta));
    strap.position.set(side * 0.08, 0.3, 0.36);
    strap.rotation.z = side * -0.28;
    strap.rotation.x = -0.25;
    gkTorso.add(strap);
  });
  const badgeCanvas = document.createElement('canvas');
  drawBadge(badgeCanvas);
  const badgeTex = new THREE.CanvasTexture(badgeCanvas);
  badgeTex.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true }));
  badge.position.set(0, 0.0, 0.385);
  badge.rotation.x = -0.12;
  gkTorso.add(badge);

  // Arms: scanner hand on his far side (local +x), free hand nearest Flash-chan
  const gkArmLook = { sleeve: GK.jacket, cuff: C.cyan, skin: GK.skin };
  const gkArmScan = makeArm(gkTorso, 0.5, gkArmLook);
  const gkArmFree = makeArm(gkTorso, -0.5, gkArmLook);

  // Raised digit: thumbs-up on ENTRY OK, finger wag on ALREADY INSIDE
  const digitGeo = new THREE.CapsuleGeometry(0.035, 0.1, 4, 8);
  digitGeo.rotateX(Math.PI / 2);
  const gkDigit = part(digitGeo, toon(GK.skin), 1.15);
  gkDigit.position.set(0, -0.66, 0.13);
  gkDigit.scale.setScalar(0.001);
  gkArmFree.add(gkDigit);

  // Handheld scanner (counter-rotated so its screen faces the camera)
  const SCAN_ARM = { x: -0.95, z: 0.12 };
  const scannerHolder = new THREE.Group();
  scannerHolder.position.y = -0.68;
  scannerHolder.rotation.set(-SCAN_ARM.x, 0, -SCAN_ARM.z, 'ZYX');
  gkArmScan.add(scannerHolder);
  const scanner = new THREE.Group();
  scanner.position.set(0.02, 0.14, 0.1);
  scannerHolder.add(scanner);
  scanner.add(part(new THREE.BoxGeometry(0.26, 0.34, 0.08), toon(C.ink), 1.06));
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.082), new THREE.MeshBasicMaterial({ color: C.cyan }));
  bezel.position.y = 0.155;
  scanner.add(bezel);
  const screenStates = {};
  const screenCanvases = {};
  ['ready', 'scan', 'ok', 'denied'].forEach((s) => {
    const cv = document.createElement('canvas');
    drawScannerScreen(cv, s);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    screenCanvases[s] = cv;
    screenStates[s] = tex;
    extraTextures.push(tex);
  });
  const screenMat = new THREE.MeshBasicMaterial({ map: screenStates.ready });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.25), screenMat);
  screen.position.set(0, -0.01, 0.042);
  scanner.add(screen);
  const setScreen = (s) => { screenMat.map = screenStates[s]; };
  // Laser emitter on the edge facing Flash-chan
  const emitter = new THREE.Object3D();
  emitter.position.set(-0.14, 0.11, 0.02);
  scanner.add(emitter);
  const emitterGlowMat = new THREE.SpriteMaterial({
    map: makeSpriteTexture(), color: C.red, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const emitterGlow = new THREE.Sprite(emitterGlowMat);
  emitterGlow.scale.setScalar(0.3);
  emitter.add(emitterGlow);
  emitter.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: C.red })));

  // Head
  const gkNeck = part(new THREE.CylinderGeometry(0.115, 0.125, 0.18, 12), toon(GK.skin), 1.04);
  gkNeck.position.y = 1.93;
  gk.add(gkNeck);
  const gkHead = new THREE.Group();
  gkHead.position.y = 2.47;
  gk.add(gkHead);
  const GR = 0.6;
  gkHead.add(part(new THREE.SphereGeometry(GR, 40, 30), toon(GK.skin), 1.035));

  const gkEyeLook = {
    x: 0.2, y: -0.03, z: 0.537, h: 0.15, iris: C.magenta, irisDeep: '#8a0f47', ring: '#5c0b31',
    glow: '#ffb3d4', brow: '#5b5a99', browH: 0.05, browTilt: 0.2
  };
  const gkEyeSet = [-1, 1].map((side) => makeEye(gkHead, side, gkEyeLook));

  const gkNose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), toon('#e0a383'));
  gkNose.position.set(0, -0.12, 0.595);
  gkHead.add(gkNose);

  // Confident grin + open "nice!" mouth that blends in on results
  const grin = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.016, 6, 16, Math.PI),
    new THREE.MeshBasicMaterial({ color: '#5a1026' })
  );
  grin.rotation.set(-0.35, 0, Math.PI + 0.12);
  grin.position.set(0.02, -0.2, 0.565);
  gkHead.add(grin);
  const gkMouth = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 20, Math.PI, Math.PI),
    new THREE.MeshBasicMaterial({ color: '#7a1033', side: THREE.DoubleSide })
  );
  gkMouth.position.set(0.02, -0.21, 0.57);
  gkMouth.rotation.x = -0.4;
  gkMouth.scale.setScalar(0.001);
  gkHead.add(gkMouth);

  // Silver spiky hair under a backwards cap
  const gkHair = new THREE.Group();
  gkHead.add(gkHair);
  const gkHairMat = toon(GK.hair);
  gkHair.add(part(new THREE.SphereGeometry(GR + 0.035, 32, 24, Math.PI, Math.PI, 0, 2.0), gkHairMat, 1.03));
  const gkSpikeRand = rng(21);
  [1.2, 1.55, 1.85].forEach((theta, ring) => {
    const count = [11, 10, 7][ring];
    for (let i = 0; i < count; i++) {
      const phi = (i / count) * TAU + ring * 0.25;
      if (Math.cos(phi) > 0.2) continue;
      const base = onSphere(GR - 0.04, theta, phi);
      const dir = base.clone().normalize();
      dir.z -= 0.35;
      dir.y += ring === 0 ? 0.35 : -0.1;
      addSpike(gkHair, gkHairMat, base, dir, 0.3 + gkSpikeRand() * 0.22, 0.14 + gkSpikeRand() * 0.05);
    }
  });
  // Bangs under the cap brim + tuft popping out of the snapback hole
  [-0.7, -0.35, 0, 0.35, 0.7].forEach((a, i) => {
    const base = onSphere(GR - 0.03, 0.95, a);
    addSpike(gkHair, gkHairMat, base, new THREE.Vector3(Math.sin(a) * 0.6, -0.55, 1), i % 2 ? 0.26 : 0.32, 0.13);
  });
  [-0.3, 0, 0.3].forEach((a, i) => {
    const base = onSphere(GR - 0.05, 0.55, a);
    addSpike(gkHair, gkHairMat, base, new THREE.Vector3(Math.sin(a) * 0.8, 1, 0.55), i === 1 ? 0.5 : 0.38, 0.12);
  });

  const cap = new THREE.Group();
  gkHead.add(cap);
  cap.add(part(new THREE.SphereGeometry(GR + 0.07, 32, 16, 0, TAU, 0, 1.12), toon(C.magenta), 1.03));
  const brim = part(new THREE.BoxGeometry(0.52, 0.045, 0.34), toon(C.magenta), 1.08);
  brim.position.set(0, 0.3, -0.62);
  brim.rotation.x = -0.32;
  cap.add(brim);
  const capButton = part(new THREE.SphereGeometry(0.05, 10, 8), toon(C.yellow), 1.15);
  capButton.position.y = GR + 0.07;
  cap.add(capButton);
  const snap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.04), toon(C.ink));
  snap.position.set(0, 0.29, 0.55);
  snap.rotation.x = 0.45;
  cap.add(snap);

  // Single-ear radio headset with mic boom (on the side facing the camera when he turns)
  const earCup = part(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 20), toon(C.ink), 1.06);
  earCup.rotation.z = Math.PI / 2;
  earCup.position.set(GR + 0.02, -0.02, -0.02);
  gkHead.add(earCup);
  const earLed = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 20), new THREE.MeshBasicMaterial({ color: C.cyan }));
  earLed.rotation.y = Math.PI / 2;
  earLed.position.set(GR + 0.08, -0.02, -0.02);
  gkHead.add(earLed);
  const micCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(GR + 0.06, -0.06, 0.02),
    new THREE.Vector3(GR - 0.02, -0.25, 0.3),
    new THREE.Vector3(0.24, -0.3, 0.52)
  ]);
  gkHead.add(part(new THREE.TubeGeometry(micCurve, 16, 0.018, 6, false), toon(C.ink), 1.2));
  const micTip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshBasicMaterial({ color: C.cyan }));
  micTip.position.set(0.24, -0.3, 0.52);
  gkHead.add(micTip);

  // ---------- Scan laser (world space, re-aimed each frame) ----------
  const laserMat = new THREE.MeshBasicMaterial({
    color: C.red, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const laserGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true);
  laserGeo.translate(0, 0.5, 0);
  const laser = new THREE.Mesh(laserGeo, laserMat);
  const laserGlowMat = laserMat.clone();
  const laserGlowGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true);
  laserGlowGeo.translate(0, 0.5, 0);
  laser.add(new THREE.Mesh(laserGlowGeo, laserGlowMat));
  laser.visible = false;
  scene.add(laser);
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();

  // ---------- Verdict hologram ----------
  const statusTex = {};
  [true, false].forEach((ok) => {
    const cv = document.createElement('canvas');
    drawStatus(cv, ok);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    statusTex[ok ? 'ok' : 'denied'] = tex;
    extraTextures.push(tex);
  });
  const statusMat = new THREE.SpriteMaterial({ map: statusTex.ok, transparent: true, depthWrite: false });
  // Shown inside the arch, above the flap doors
  const status = new THREE.Sprite(statusMat);
  status.position.set(0, 2.5, GATE_Z + 0.1);
  status.scale.setScalar(0.001);
  stage.add(status);
  const ringBase = new THREE.Color(C.yellow);
  const ringTarget = { ok: new THREE.Color(C.green), denied: new THREE.Color(C.red) };
  const gateIdle = new THREE.Color(C.cyan);

  // Fonts may land after first draw — repaint once they do
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      drawTicket(ticketCanvas);
      ticketTex.needsUpdate = true;
      drawBadge(badgeCanvas);
      badgeTex.needsUpdate = true;
      drawGateSign(signCanvas);
      signTex.needsUpdate = true;
      Object.keys(screenStates).forEach((s) => {
        drawScannerScreen(screenCanvases[s], s);
        screenStates[s].needsUpdate = true;
      });
    }).catch(() => {});
  }

  // Shockwave ring on the platform (fires on take-off, landing, verdicts and high-fives)
  const shockMat = new THREE.MeshBasicMaterial({
    color: C.yellow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 64), shockMat);
  shock.rotation.x = Math.PI / 2;
  shock.position.y = 0.04;
  stage.add(shock);
  let shockStart = -10;
  const fireShock = (x, z = 0) => {
    shock.position.x = x;
    shock.position.z = z;
    shockStart = elapsed;
  };

  // ---------- Particles ----------
  const PCOUNT = 320;
  const pPos = new Float32Array(PCOUNT * 3);
  const pCol = new Float32Array(PCOUNT * 3);
  const pVel = new Float32Array(PCOUNT * 3);
  const palette = [new THREE.Color(C.yellow), new THREE.Color(C.magenta), new THREE.Color(C.cyan), new THREE.Color('#ffffff')];
  const prand = rng(1337);
  const resetParticle = (i, burst = false, bx = 0, by = 2, bz = 0) => {
    const a = prand() * TAU;
    const r = burst ? 0.3 + prand() * 0.5 : 0.6 + prand() * 3.0;
    pPos[i * 3] = bx + Math.cos(a) * r;
    pPos[i * 3 + 1] = burst ? by - 0.4 + prand() * 0.8 : prand() * 0.4;
    pPos[i * 3 + 2] = bz + Math.sin(a) * r * (burst ? 1 : SQUASH);
    const sp = burst ? 3 + prand() * 4 : 0;
    pVel[i * 3] = burst ? Math.cos(a) * sp : 0;
    pVel[i * 3 + 1] = burst ? 1 + prand() * 4 : 0.4 + prand() * 0.9;
    pVel[i * 3 + 2] = burst ? Math.sin(a) * sp : 0;
  };
  const burst = (n, x, y, z = 0) => {
    for (let i = 0; i < n; i++) resetParticle(Math.floor(prand() * PCOUNT), true, x, y, z);
  };
  for (let i = 0; i < PCOUNT; i++) {
    resetParticle(i);
    pPos[i * 3 + 1] = prand() * 4.5;
    const col = palette[Math.floor(prand() * palette.length)];
    pCol.set([col.r, col.g, col.b], i * 3);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.09, map: makeSpriteTexture(), vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  stage.add(points);

  // ---------- Interaction ----------
  const pointer = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  const onPointerMove = (e) => {
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.35;
    pointer.x = THREE.MathUtils.clamp((e.clientX - cx) / (window.innerWidth / 2), -1, 1);
    pointer.y = THREE.MathUtils.clamp((e.clientY - cy) / (window.innerHeight / 2), -1, 1);
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // Flash-chan's jump-spin (wherever she currently is)
  let action = null; // { start }
  const jump = () => {
    if (action) return;
    action = { start: elapsed };
    fireShock(flashRoot.position.x, flashRoot.position.z);
    burst(90, flashRoot.position.x, 2, flashRoot.position.z);
  };

  // Path for slipping back outside around the gate (skipping the exit scan)
  const sneakPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -1.5),
    new THREE.Vector3(-1.4, 0, -1.55),
    new THREE.Vector3(-2.35, 0, -0.7),
    new THREE.Vector3(FLASH_X, 0, 0)
  ]);
  const vC = new THREE.Vector3();
  const vT = new THREE.Vector3();

  // Gate scan round: present pass → laser scan → verdict → (high-five on ENTRY OK)
  let seq = null; // { start, kind, fired }
  let seqCount = 0;
  const beat = (name) => {
    seq.fired.add(name);
    onBeat?.(name, seq.kind);
  };
  const scan = () => {
    if (seq) return;
    seq = { start: elapsed, kind: SCRIPT[seqCount++ % SCRIPT.length], fired: new Set() };
    beat('present');
  };
  renderer.domElement.addEventListener('click', scan);

  // ---------- Resize ----------
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep both characters in frame on narrow containers
    const fitFov = THREE.MathUtils.radToDeg(2 * Math.atan(2.95 / camera.aspect / camBase.z));
    camera.fov = Math.min(Math.max(30, fitFov), 50);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- Loop ----------
  const speed = reducedMotion ? 0.35 : 1;
  let elapsed = 0;
  let last = performance.now();
  let raf = 0;
  let visible = true;
  let nextBlink = 2;
  let gkNextBlink = 3.1;
  let nextSeq = reducedMotion ? Infinity : 3.5;
  let waveAmt = 0;
  let fYaw = 0.15;

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05) * speed;
    last = now;
    if (!visible) return;
    elapsed += dt;
    const t = elapsed;

    // Look-at follow
    look.x = lerp(look.x, pointer.x, 0.08);
    look.y = lerp(look.y, pointer.y, 0.08);

    // ----- Scan round timeline -----
    let face = 0; // turned toward each other, pass + scanner raised
    let scanOn = 0;
    let verdict = 0; // envelope of the result display
    let five = 0; // high-five pose
    let slap = 0;
    let doorOpen = 0;
    let fx = FLASH_X;
    let fz = 0;
    let travelYaw = null; // overrides Flash-chan's idle facing while she moves
    let travel = 0; // boot thrust while gliding
    let cheer = 0; // waving from inside the gate
    let shy = 0; // sweat-drop embarrassment after being blocked
    let block = 0; // Gate-kun standing in the lane, palm out
    let watch = 0; // Gate-kun eyeing her as she sneaks back out
    let seqS = -10; // timeline clock for this round
    const kind = seq?.kind;
    if (seq) {
      // Hold the "showing the pass" pose so the two can talk turn by turn before the scan
      const raw = t - seq.start;
      const s = raw < 0.65 ? raw : Math.max(0.65, raw - PRESENT_HOLD);
      seqS = s;
      const end = kind === 'ok' ? 8.0 : 4.7;
      face = smooth(s, 0, 0.6) * (1 - (kind === 'ok' ? smooth(s, 2.5, 2.9) : smooth(s, 1.55, 1.8)));
      if (s >= 0.7 && !seq.fired.has('scan')) {
        beat('scan');
        setScreen('scan');
      }
      scanOn = s > 0.7 && s < 1.5 ? 1 : 0;
      if (s >= 1.5 && !seq.fired.has(kind)) {
        beat(kind);
        setScreen(kind);
        statusMat.map = statusTex[kind];
        fireShock(0, GATE_Z);
        if (kind === 'ok') jump();
        else burst(30, 0, 2.5, GATE_Z);
      }

      if (kind === 'ok') {
        // ENTRY OK: doors open → high-five on the way → through the gate → sneak back out
        verdict = smooth(s, 1.5, 1.75) * (1 - smooth(s, 2.6, 3.0));
        doorOpen = smooth(s, 1.6, 2.2) * (1 - smooth(s, 5.3, 5.8));
        if (s >= 2.8 && s < 3.4) {
          const k = easeInOut((s - 2.8) / 0.6);
          fx = lerp(FLASH_X, -0.35, k);
          fz = lerp(0, 0.45, k);
          travelYaw = 1.3;
          travel = 1;
        } else if (s >= 3.4 && s < 3.85) {
          fx = -0.35;
          fz = 0.45;
          travelYaw = 0.3;
        } else if (s >= 3.85 && s < 4.9) {
          const k = easeInOut((s - 3.85) / 1.05);
          fx = lerp(-0.35, 0, k);
          fz = lerp(0.45, -1.5, k);
          travelYaw = Math.PI;
          travel = 1;
        } else if (s >= 4.9 && s < 5.7) {
          fx = 0;
          fz = -1.5;
          travelYaw = 0;
          cheer = smooth(s, 4.9, 5.1) * (1 - smooth(s, 5.5, 5.7));
          if (!seq.fired.has('inside')) {
            beat('inside');
            jump();
          }
        } else if (s >= 5.7 && s < 7.8) {
          const k = easeInOut((s - 5.7) / 2.1);
          sneakPath.getPoint(k, vC);
          sneakPath.getTangent(k, vT);
          fx = vC.x;
          fz = vC.z;
          travelYaw = Math.atan2(vT.x, vT.z);
          travel = 1;
          if (!seq.fired.has('sneak')) beat('sneak');
        }
        five = smooth(s, 3.3, 3.5) * (1 - smooth(s, 3.75, 3.95));
        if (s >= 3.5 && !seq.fired.has('highfive')) {
          beat('highfive');
          fireShock(0.35, 0.45);
          burst(110, 0.4, 2.9, 0.45);
        }
        slap = s >= 3.5 ? Math.max(0, 1 - (s - 3.5) / 0.35) : 0;
        watch = smooth(s, 5.7, 6.1) * (1 - smooth(s, 7.5, 7.9));
      } else {
        // ALREADY INSIDE: doors stay shut, she rushes anyway, Gate-kun steps in and blocks her
        verdict = smooth(s, 1.5, 1.75) * (1 - smooth(s, 3.8, 4.2));
        block = smooth(s, 1.6, 1.95) * (1 - smooth(s, 3.6, 4.1));
        if (s >= 1.9 && s < BLOCK_AT) {
          const k = Math.pow((s - 1.9) / (BLOCK_AT - 1.9), 2);
          fx = lerp(FLASH_X, -0.95, k);
          fz = lerp(0, 0.35, k);
          travelYaw = 1.2;
          travel = 1;
        } else if (s >= BLOCK_AT && s < BLOCK_AT + 0.75) {
          const k = 1 - Math.pow(1 - (s - BLOCK_AT) / 0.75, 3);
          fx = lerp(-0.95, FLASH_X, k);
          fz = lerp(0.35, 0, k);
          travelYaw = 0.5;
        }
        if (s >= BLOCK_AT && !seq.fired.has('blocked')) {
          beat('blocked');
          fireShock(-0.7, 0.35);
          burst(45, -0.7, 2.2, 0.35);
        }
        shy = smooth(s, BLOCK_AT, BLOCK_AT + 0.15) * (1 - smooth(s, 4.0, 4.5));
      }
      if (s >= end) {
        beat('end');
        seq = null;
        setScreen('ready');
        nextSeq = t + 5 + Math.random() * 2;
      }
    } else if (t > nextSeq) {
      scan();
    }
    const okAmt = kind === 'ok' ? verdict : 0;
    const noAmt = kind === 'denied' ? verdict : 0;
    const bump = kind === 'denied' && seq && seqS >= BLOCK_AT ? Math.max(0, 1 - (seqS - BLOCK_AT) / 0.3) : 0;

    // ----- Flash-chan -----
    let hoverY = 0.32 + Math.sin(t * 2.2) * 0.09 + travel * 0.12;
    const idleYaw = look.x * 0.25 * (1 - face) + 0.15 + face * 0.6;
    fYaw = lerpAngle(fYaw, travelYaw ?? idleYaw, 1 - Math.pow(0.86, dt * 60));
    let spin = 0;

    let jumpP = 0;
    if (action) {
      const p = Math.min((t - action.start) / 1.25, 1);
      jumpP = Math.sin(p * Math.PI);
      hoverY += jumpP * 0.85;
      spin += easeInOut(p) * TAU;
      if (p >= 1) {
        action = null;
        fireShock(flashRoot.position.x, flashRoot.position.z); // landing impact
      }
    }
    flashRoot.position.set(fx - slap * 0.05 - bump * 0.08, 0, fz);
    flashBeam.visible = Math.hypot(fx - FLASH_X, fz) < 0.15;
    char.position.y = hoverY;
    char.rotation.y = fYaw + spin;
    char.rotation.z = Math.sin(t * 1.1) * 0.03 + bump * 0.25;
    char.rotation.x = travel * 0.12;

    const s = 1 - (hoverY - 0.3) * 0.25;
    shadow.scale.setScalar(Math.max(s, 0.4));
    shadow.material.opacity = 0.5 * Math.max(s, 0.3);

    // Breathing
    torso.scale.set(1 + Math.sin(t * 2.2) * 0.012, 1 + Math.sin(t * 2.2 + 1) * 0.015, 1);

    // Head: follow the cursor, glance back at the camera while showing the pass
    head.rotation.y = lerp(look.x * 0.55, -0.3, face) * (travelYaw === null ? 1 : 0.3);
    head.rotation.x = look.y * 0.3 * (1 - face) - jumpP * 0.2 + shy * 0.12;
    head.rotation.z = Math.sin(t * 1.3) * 0.05 - look.x * 0.06 + shy * 0.22;
    irises.forEach((ir) => {
      ir.position.x = lerp(look.x * 0.03, -0.02, face);
      ir.position.y = -look.y * 0.03 * (1 - face);
    });
    sweat.scale.setScalar(Math.max(shy, 0.001));
    sweat.position.y = 0.3 - shy * 0.06 + Math.sin(t * 6) * 0.015 * shy;

    // Eyes: blink, happy "^^" squint while jumping, ">_<" when blocked, wink mid-wave
    let open = 1;
    if (t > nextBlink) {
      const b = (t - nextBlink) / 0.16;
      open = b < 1 ? Math.abs(1 - b * 2) * 0.9 + 0.1 : 1;
      if (b >= 1) nextBlink = t + 2.5 + Math.random() * 3;
    }
    const squint = 1 - jumpP * 0.8 - shy * 0.65;
    const cyc = t % 7;
    const winkP = !seq && cyc > 1.2 && cyc < 1.75 ? Math.sin(((cyc - 1.2) / 0.55) * Math.PI) : 0;
    eyes[0].scale.y = Math.min(open, squint);
    eyes[1].scale.y = Math.min(open, squint, 1 - winkP * 0.88);

    // Mouth opens wide with excitement, shrinks when caught re-entering
    mouth.scale.set(1 + jumpP * 0.5 + winkP * 0.2 + slap * 0.4, 1 + jumpP * 1.4 + winkP * 0.3 + slap * 0.8 - shy * 0.6, 1);
    tongue.scale.set(1 + jumpP * 0.5, 1 + jumpP * 1.2, 1);
    tongue.position.y = -0.285 - jumpP * 0.06;

    // Hover-boot flames flicker, roar during the jump and while gliding
    jets.forEach((j) => j.scale.set(1, 0.5 + Math.random() * 0.25 + jumpP * 1.1 + travel * 0.6, 1));

    // Hair + scarf physics-ish sway
    hair.rotation.z = Math.sin(t * 3) * 0.025;
    hair.rotation.x = -jumpP * 0.12;
    ahogePivot.rotation.z = Math.sin(t * 4.5) * 0.25 - shy * 0.6;
    ahogePivot.rotation.x = Math.sin(t * 3.2) * 0.15 - jumpP * 0.5 + shy * 0.6;
    tailA.rotation.z = 0.9 + Math.sin(t * 8) * 0.18 + jumpP * 0.6 + travel * 0.5;
    tailA.rotation.x = Math.sin(t * 6.5) * 0.25;
    tailB.rotation.z = 0.55 + Math.sin(t * 8 + 1.2) * 0.2 + jumpP * 0.5 + travel * 0.5;
    tailB.rotation.x = Math.sin(t * 7 + 0.5) * 0.25;

    // Wave arm: waves at the cursor when idle / from inside the gate, raises for the high-five
    const waving = (!seq && (cyc < 3 || jumpP > 0.05)) || cheer > 0.1;
    waveAmt = lerp(waveAmt, waving ? 1 : 0, 1 - Math.pow(0.94, dt * 60));
    const waveZ = lerp(0.28 + Math.sin(t * 2) * 0.05, 2.55 + Math.sin(t * 9) * 0.28 + jumpP * 0.3, waveAmt);
    armWave.rotation.z = lerp(waveZ + okAmt * 0.6, 2.6 - slap * 0.2, five);
    armWave.rotation.x = lerp(lerp(0, -0.25, waveAmt), -0.2, five);

    // Ticket arm: thrust the pass toward the scanner
    armTicket.rotation.x = lerp(TICKET_ARM.x + Math.sin(t * 2.2) * 0.06, -1.42, face) - jumpP * 0.6;
    armTicket.rotation.z = lerp(TICKET_ARM.z, 0.12, face);
    ticket.rotation.z = lerp(0.12 + Math.sin(t * 1.7) * 0.06, 0.02, face);
    ticketGlow.material.opacity = 0.4 + Math.sin(t * 4) * 0.2 + scanOn * 0.3;

    // Dangling legs (trail behind while gliding)
    legL.rotation.x = Math.sin(t * 2.2) * 0.14 - jumpP * 0.7 + travel * 0.35;
    legR.rotation.x = Math.sin(t * 2.2 + Math.PI) * 0.14 - jumpP * 0.5 + travel * 0.25;

    // ----- Gate-kun -----
    const hop = Math.sin(smooth(seqS, 1.5, 2.0) * Math.PI) * okAmt;
    const gx = lerp(GATE_X, 0.5, block) - five * 0.25 + slap * 0.05;
    const gz = lerp(0, 0.35, block);
    gateRoot.position.set(gx, 0, gz);
    gkBeam.visible = block < 0.05;
    gk.position.y = -0.08 + Math.abs(Math.sin(t * 2.2 + 0.8)) * 0.02 + hop * 0.25;
    // Suspicious stare that tracks Flash-chan while she slips back outside
    const stare = THREE.MathUtils.clamp(Math.atan2(fx - gx, fz - gz + 0.8), -1.3, 1.3);
    let gYaw = lerp(look.x * 0.2 - 0.15, -0.62, face);
    gYaw = lerp(gYaw, -0.3, five);
    gYaw = lerp(gYaw, -0.15, block);
    gYaw = lerp(gYaw, stare * 0.6, watch);
    gk.rotation.y = gYaw;
    gk.rotation.z = Math.sin(t * 1.1 + 2) * 0.02;
    gkTorso.scale.set(1 + Math.sin(t * 2.2 + 0.8) * 0.012, 1 + Math.sin(t * 2.2 + 1.8) * 0.015, 1);
    gkShadow.scale.setScalar(1 - hop * 0.2);

    gkHead.rotation.y = lerp(lerp(look.x * 0.45, 0.25, face), stare * 0.4, watch) - noAmt * 0.15 * Math.sin(t * 10) - block * 0.3;
    gkHead.rotation.x = lerp(look.y * 0.25, 0.18, scanOn * face) - okAmt * 0.1;
    gkHead.rotation.z = Math.sin(t * 1.2 + 1) * 0.04 + okAmt * 0.1 + watch * 0.08;
    gkEyeSet.forEach(({ iris }) => {
      iris.position.x = lerp(lerp(look.x * 0.03, -0.025, face), Math.sign(stare) * 0.03, watch);
      iris.position.y = lerp(-look.y * 0.03, -0.02, scanOn);
    });
    let gkOpen = 1;
    if (t > gkNextBlink) {
      const b = (t - gkNextBlink) / 0.15;
      gkOpen = b < 1 ? Math.abs(1 - b * 2) * 0.9 + 0.1 : 1;
      if (b >= 1) gkNextBlink = t + 2.8 + Math.random() * 3;
    }
    const stern = Math.max(noAmt, block, watch * 0.7);
    gkEyeSet.forEach(({ eye, brow }, i) => {
      const side = i ? 1 : -1;
      // Focused squint while scanning / side-eye, stern brows on a rejected pass
      eye.scale.y = Math.min(gkOpen, 1 - scanOn * 0.35 - okAmt * 0.5 - watch * 0.4);
      brow.rotation.z = side * (0.2 + stern * 0.3 - okAmt * 0.25);
      brow.position.y = 0.25 - stern * 0.04 + okAmt * 0.03;
    });
    grin.scale.set(1, 1 - stern * 0.85, 1);
    const gkOpenMouth = Math.max(okAmt, slap, bump);
    gkMouth.scale.setScalar(Math.max(gkOpenMouth, 0.001));
    grin.visible = gkOpenMouth < 0.3;
    gkHair.rotation.z = Math.sin(t * 3 + 1) * 0.02;

    // Scanner arm: lowered at rest, aimed at the pass during the scan
    gkArmScan.rotation.x = lerp(SCAN_ARM.x + Math.sin(t * 2.2 + 0.8) * 0.05, -1.4, face);
    gkArmScan.rotation.z = lerp(SCAN_ARM.z, -0.12, face);

    // Free arm: hand on hip → thumbs up / finger wag → high-five / palm-out block
    const gesture = Math.max(okAmt, noAmt);
    let freeX = lerp(0.05, -1.35, gesture);
    let freeZ = lerp(-0.45, -0.25 + Math.sin(t * 14) * 0.28 * noAmt, gesture);
    freeX = lerp(freeX, -0.35, five);
    freeZ = lerp(freeZ, -2.6 + slap * 0.2, five);
    freeX = lerp(freeX, -0.25, block);
    freeZ = lerp(freeZ, -1.5 + Math.sin(t * 12) * 0.08 + bump * 0.2, block);
    gkArmFree.rotation.x = freeX;
    gkArmFree.rotation.z = freeZ;
    gkDigit.scale.setScalar(Math.max(gesture * (1 - five), block, 0.001));

    gkLegL.rotation.x = -hop * 0.4;
    gkLegR.rotation.x = -hop * 0.3;

    // ----- Laser, screen glow + verdict hologram -----
    laser.visible = scanOn > 0;
    emitterGlowMat.opacity = scanOn * (0.7 + Math.random() * 0.3);
    scanBarMat.opacity = scanOn * 0.9;
    if (scanOn) {
      const sweep = Math.sin(t * 16) * 0.09;
      scanBar.position.y = qrAnchor.position.y + sweep;
      emitter.getWorldPosition(vA);
      scanBar.getWorldPosition(vB);
      vB.sub(vA);
      const len = vB.length();
      laser.position.copy(vA);
      laser.quaternion.setFromUnitVectors(UP, vB.normalize());
      laser.scale.set(1, len, 1);
      const flick = 0.75 + Math.random() * 0.25;
      laserMat.opacity = flick;
      laserGlowMat.opacity = flick * 0.35;
    }

    const pop = verdict > 0 ? 1 + Math.sin(Math.min(verdict, 1) * Math.PI) * 0.25 : 0;
    status.scale.setScalar(Math.max(verdict * pop * 0.95, 0.001));
    status.position.y = 2.5 + Math.sin(t * 3) * 0.05;
    status.material.rotation = noAmt * Math.sin(t * 18) * 0.08;
    glowRingMat.color.copy(ringBase).lerp(kind ? ringTarget[kind] : ringBase, verdict);
    shockMat.color.copy(glowRingMat.color);

    // Gate: green + swung open on ENTRY OK, flashing red and locked on ALREADY INSIDE
    doors.forEach(({ hinge, side }) => {
      hinge.rotation.y = -side * easeInOut(doorOpen) * Math.PI * 0.5;
    });
    const alarm = Math.max(noAmt, block) * (Math.sin(t * 20) > 0 ? 1 : 0.45);
    const gateState = kind === 'ok' ? Math.max(verdict, doorOpen) : alarm;
    gateLedMat.color.copy(gateIdle).lerp(kind ? ringTarget[kind] : gateIdle, gateState);
    doorMat.color.copy(gateLedMat.color);
    doorMat.opacity = 0.35 + alarm * 0.3 + Math.sin(t * 3) * 0.05;

    // Shockwave
    const sp = (t - shockStart) / 0.7;
    if (sp >= 0 && sp <= 1) {
      shock.scale.setScalar(0.6 + sp * 2.4);
      shockMat.opacity = (1 - sp) * 0.9;
    } else {
      shockMat.opacity = 0;
    }

    // Stage
    orbitRing.rotation.y = -t * 0.4;
    const gk2 = 1 + Math.sin(t * 3) * 0.015;
    glowRing.scale.set(gk2, gk2 * SQUASH, 1);
    beamMat.uniforms.uTime.value = t;

    // Particles
    for (let i = 0; i < PCOUNT; i++) {
      const k = i * 3;
      pPos[k] += pVel[k] * dt;
      pPos[k + 1] += pVel[k + 1] * dt;
      pPos[k + 2] += pVel[k + 2] * dt;
      pVel[k] *= 0.96;
      pVel[k + 2] *= 0.96;
      if (pVel[k + 1] > 1.3) pVel[k + 1] *= 0.97;
      if (pPos[k + 1] > 4.8 || Math.abs(pPos[k]) > 5.5) resetParticle(i);
    }
    pGeo.attributes.position.needsUpdate = true;

    // Camera parallax
    camera.position.x = camBase.x + look.x * 0.6;
    camera.position.y = camBase.y - look.y * 0.3;
    camera.lookAt(lookAt);

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  // Pause when off-screen or tab hidden
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && !document.hidden;
  });
  io.observe(container);
  const onVis = () => {
    visible = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    scan,
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', scan);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      });
      extraTextures.forEach((tex) => tex.dispose());
      gradientMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
