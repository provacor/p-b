// The pb monogram animations (Three.js), played full-screen at three moments:
//   0 · Spinning Cycle  — Fourier epicycles draw pb        → while the app loads (splash)
//   1 · Chaos to Order  — Lorenz strands fold back into pb → on the red Progress tab
//   2 · Spinning Tops   — three tops draw pb on a table    → the first time the game zone opens
// Every frame is a pure function of time, so a stage can be played faster than its design
// length. A tap skips. Without WebGL, with Three.js missing, or with reduced motion the
// promise resolves at once and nothing is shown.
import { motionReduced } from './a11y.js?v=202610240714';

const STAGE_START = [0, 9000, 19000, 29000];
const STAGE_LEN = [9000, 10000, 10000];

let threeLoad = null;
function loadThree() {
  if (window.THREE) return Promise.resolve(true);
  threeLoad ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'assets/vendor/three.min.js';
    s.onload = () => resolve(!!window.THREE);
    s.onerror = () => { threeLoad = null; resolve(false); };
    document.head.append(s);
  });
  return threeLoad;
}

let engine = null; // built once, on the first play
let queue = Promise.resolve();
const pending = new Map(); // stage → its queued play, so a double tap doesn't play it twice

// Plays one stage. `speed` stretches time (2 = twice as fast). `until` (a promise) keeps the
// finished logo on screen until it settles — the splash waits for the app's data this way.
export function playMotion(stage, { speed = 1, until = null, label = '' } = {}) {
  if (pending.has(stage)) return pending.get(stage);
  const run = queue.then(() => runStage(stage, speed, until, label)).catch(() => {}).finally(() => pending.delete(stage));
  pending.set(stage, run);
  queue = run;
  return run;
}

async function runStage(stage, speed, until, label) {
  if (motionReduced()) return;
  const el = document.createElement('div');
  el.className = 'pbm';
  el.setAttribute('role', 'presentation');
  el.innerHTML = `<canvas class="pbm-gl" aria-hidden="true"></canvas>${label ? `<p class="pbm-label">${label}</p>` : ''}<p class="pbm-skip">ছুঁয়ে দিলে এড়িয়ে যাবে</p>`;
  document.body.append(el);
  if (!(await loadThree())) { el.remove(); return; }
  try {
    engine ??= makeEngine();
  } catch {
    engine = false;
  }
  if (!engine) { el.remove(); return; }
  el.querySelector('.pbm-gl').replaceWith(engine.canvas);
  engine.resize(el);

  const from = STAGE_START[stage], to = from + STAGE_LEN[stage];
  let ready = !until, skipped = false;
  until?.then(() => { ready = true; }, () => { ready = true; });
  await new Promise((done) => {
    const t0 = performance.now();
    const skip = () => { skipped = true; };
    el.addEventListener('pointerdown', skip);
    const onResize = () => engine.resize(el);
    window.addEventListener('resize', onResize);
    const loop = (now) => {
      const T = from + (now - t0) * speed;
      if (skipped || (T >= to && ready)) {
        window.removeEventListener('resize', onResize);
        return done();
      }
      if (T < to) engine.draw(T);
      else engine.hold((T - to) / 1000); // finished logo, gently glowing, until the app is ready
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  el.classList.add('out');
  await new Promise((r) => setTimeout(r, 320));
  el.remove();
}

function makeEngine() {
  const THREE = window.THREE;
  const C = { orange: 0xE07A57, cyan: 0x5CC8C8, yellow: 0xF2CF63, white: 0xEEF2F4 };
  const small = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  const RIB_W = 0.068;
  const CAM_D = 7.2;
  const G0 = 0.16; // resting glow strength

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- pb geometry: SVG units (viewBox 0 10 300 300) → world ---------- */
  const R = 52;
  const SEG = {
    pStemUp: { L: [46, 280, 46, 160] },
    pTop: { A: [98, 160, 180, 360] },
    pUnder: { A: [98, 160, 0, 180] },
    bStemUp: { L: [150, 160, 150, 40] },
    bStemDown: { L: [150, 40, 150, 160] },
    bUnder: { A: [202, 160, 180, 0] },
    bOver: { A: [202, 160, 0, -180] },
    pStemDown: { L: [46, 160, 46, 280] },
    pBowl: { A: [98, 160, 180, 540] },
    bBowl: { A: [202, 160, 180, -180] },
  };
  const toW = (x, y) => [(x - 150) / 100, -(y - 160) / 100];
  const segLen = (s) => (s.L ? Math.hypot(s.L[2] - s.L[0], s.L[3] - s.L[1]) : Math.abs(s.A[3] - s.A[2]) * Math.PI / 180 * R);
  const segAt = (s, u) => {
    if (s.L) return toW(lerp(s.L[0], s.L[2], u), lerp(s.L[1], s.L[3], u));
    const a = lerp(s.A[2], s.A[3], u) * Math.PI / 180;
    return toW(s.A[0] + R * Math.cos(a), s.A[1] + R * Math.sin(a));
  };
  function makePath(list) {
    const lens = list.map(segLen), cum = [0];
    lens.forEach((l) => cum.push(cum[cum.length - 1] + l));
    const total = cum[cum.length - 1];
    return {
      total,
      at(f) {
        const d = clamp(f) * total;
        let i = 0;
        while (i < list.length - 1 && d > cum[i + 1]) i++;
        return segAt(list[i], lens[i] ? (d - cum[i]) / lens[i] : 0);
      },
    };
  }
  const sample = (path, n) => Array.from({ length: n }, (_, i) => path.at(i / (n - 1)));
  const TOUR = makePath([SEG.pStemUp, SEG.pTop, SEG.bStemUp, SEG.bStemDown, SEG.bUnder, SEG.bOver, SEG.pUnder, SEG.pStemDown]);
  const STROKES = [[SEG.pStemUp], [SEG.pBowl], [SEG.bBowl], [SEG.bStemUp]].map(makePath);

  /* ---------- renderer / scene ---------- */
  const canvas = document.createElement('canvas');
  canvas.className = 'pbm-gl';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.05, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 0.95); sun.position.set(2.5, -3, 5); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fdcff, 0.45); rim.position.set(-3, 4, 2); scene.add(rim);

  let viewFit = 1;
  function resize(host) {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    viewFit = camera.aspect < 1 ? 1 / camera.aspect * 0.7 : 1; // a phone held upright: pb fills about two thirds of the width
  }

  /* ---------- ribbons: thick 2D strokes as meshes ---------- */
  function ribbonGeom(list, w, z) {
    const total = list.reduce((s, p) => s + p.length, 0), pos = new Float32Array(total * 6), idx = [];
    let base = 0;
    list.forEach((pts) => {
      const n = pts.length; let nx = 0, ny = 1;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[Math.min(n - 1, i + 1)], c = pts[Math.max(0, i - 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        if (i === n - 1 || Math.hypot(tx, ty) < 1e-7) { tx = a[0] - c[0]; ty = a[1] - c[1]; }
        const l = Math.hypot(tx, ty);
        if (l > 1e-7) { nx = -ty / l; ny = tx / l; }
        pos.set([a[0] + nx * w / 2, a[1] + ny * w / 2, z, a[0] - nx * w / 2, a[1] - ny * w / 2, z], (base + i) * 6);
        if (i < n - 1) { const k = (base + i) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      base += n;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.userData.segs = total - list.length;
    return g;
  }
  // soft glow: bright centre line fading to transparent edges, with round caps on open strokes
  function softRibbonGeom(list, w, z, color) {
    const pos = [], col = [], idx = [], c = new THREE.Color(color);
    const push = (x, y, a) => { pos.push(x, y, z); col.push(c.r, c.g, c.b, a); return pos.length / 3 - 1; };
    const cap = (p, dx, dy, nx, ny) => {
      const ctr = push(p[0], p[1], 1); let prev = -1;
      for (let k = 0; k <= 10; k++) {
        const th = k / 10 * Math.PI, ex = nx * Math.cos(th) + dx * Math.sin(th), ey = ny * Math.cos(th) + dy * Math.sin(th);
        const v = push(p[0] + ex * w / 2, p[1] + ey * w / 2, 0);
        if (prev >= 0) idx.push(ctr, prev, v);
        prev = v;
      }
    };
    list.forEach((pts) => {
      const n = pts.length, N = [];
      let nx = 0, ny = 1;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[Math.min(n - 1, i + 1)], cc = pts[Math.max(0, i - 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        if (i === n - 1 || Math.hypot(tx, ty) < 1e-7) { tx = a[0] - cc[0]; ty = a[1] - cc[1]; }
        const l = Math.hypot(tx, ty);
        if (l > 1e-7) { nx = -ty / l; ny = tx / l; }
        N.push([nx, ny]);
      }
      let pl, pc, pr;
      for (let i = 0; i < n; i++) {
        const [px, py] = pts[i], [qx, qy] = N[i];
        const L = push(px + qx * w / 2, py + qy * w / 2, 0), Cc = push(px, py, 1), Rr = push(px - qx * w / 2, py - qy * w / 2, 0);
        if (i > 0) idx.push(pl, pc, L, pc, Cc, L, pc, pr, Cc, pr, Rr, Cc);
        pl = L; pc = Cc; pr = Rr;
      }
      const closed = Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 1e-4;
      if (!closed) {
        cap(pts[0], -N[0][1], N[0][0], N[0][0], N[0][1]);
        cap(pts[n - 1], N[n - 1][1], -N[n - 1][0], N[n - 1][0], N[n - 1][1]);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    return g;
  }
  const setRange = (mesh, f) => mesh.geometry.setDrawRange(0, Math.round(clamp(f) * mesh.geometry.userData.segs) * 6);
  const nFor = (path) => Math.max(40, Math.round(path.total / (small ? 2.2 : 1.4)));

  const matDraw = new THREE.MeshBasicMaterial({ color: C.orange, side: THREE.DoubleSide });
  const matSolid = new THREE.MeshBasicMaterial({ color: C.orange, side: THREE.DoubleSide, transparent: true, depthFunc: THREE.LessDepth });
  const matGlow = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false });

  const N_PATH = small ? 640 : 1024;
  const tourPts = sample(TOUR, N_PATH);
  const tourRibbon = new THREE.Mesh(ribbonGeom([tourPts], RIB_W, 0.001), matDraw);
  const strokePts = STROKES.map((p) => sample(p, nFor(p)));
  const pbSolid = new THREE.Mesh(ribbonGeom(strokePts, RIB_W, 0.001), matSolid);
  const pbGlow = new THREE.Mesh(softRibbonGeom(strokePts, RIB_W * 4.6, 0, C.orange), matGlow);
  pbGlow.renderOrder = -1;
  scene.add(pbGlow, pbSolid, tourRibbon);

  /* ---------- stage 1 · Fourier epicycles ---------- */
  const K = small ? 160 : 300;
  const coeffs = (() => {
    const N = N_PATH, re = tourPts.map((p) => p[0]), im = tourPts.map((p) => p[1]), out = [];
    for (let k = -N / 2; k < N / 2; k++) {
      let sr = 0, si = 0;
      for (let n = 0; n < N; n++) {
        const a = -2 * Math.PI * k * n / N, c = Math.cos(a), s = Math.sin(a);
        sr += re[n] * c - im[n] * s; si += re[n] * s + im[n] * c;
      }
      sr /= N; si /= N;
      out.push({ k, amp: Math.hypot(sr, si), ph: Math.atan2(si, sr), re: sr, im: si });
    }
    const c0 = out.find((o) => o.k === 0);
    const rest = out.filter((o) => o.k !== 0).sort((a, b) => b.amp - a.amp).slice(0, K);
    return { c0, rest };
  })();
  const epi = new THREE.Group(); scene.add(epi);
  const overlay = (m) => { m.depthTest = false; m.depthWrite = false; m.transparent = true; return m; };
  const armGeom = new THREE.BufferGeometry();
  armGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array((K + 1) * 3), 3));
  const armMat = overlay(new THREE.LineBasicMaterial({ color: C.white, opacity: 0.75 }));
  const arms = new THREE.Line(armGeom, armMat); arms.renderOrder = 3; epi.add(arms);
  const circGeom = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2), Math.sin(i / 96 * Math.PI * 2), 0)));
  const circMat = overlay(new THREE.LineBasicMaterial({ color: C.white, opacity: 0.16 }));
  const NCIRC = Math.min(K, small ? 50 : 90);
  const circles = Array.from({ length: NCIRC }, () => { const l = new THREE.Line(circGeom, circMat); l.renderOrder = 2; epi.add(l); return l; });
  const HEADS = Math.min(K, small ? 24 : 40);
  const headGeom = new THREE.BufferGeometry();
  headGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HEADS * 9), 3));
  const headMat = overlay(new THREE.MeshBasicMaterial({ color: C.white, opacity: 0.75, side: THREE.DoubleSide }));
  const heads = new THREE.Mesh(headGeom, headMat); heads.renderOrder = 3; epi.add(heads);
  const tipMat = overlay(new THREE.MeshBasicMaterial({ color: C.white }));
  const tip = new THREE.Mesh(new THREE.CircleGeometry(0.022, 20), tipMat); tip.renderOrder = 4; epi.add(tip);

  function epicycleAt(u) {
    const pos = armGeom.attributes.position.array, hp = headGeom.attributes.position.array;
    let x = coeffs.c0.re, y = coeffs.c0.im;
    pos[0] = x; pos[1] = y; pos[2] = 0.003;
    coeffs.rest.forEach((c, i) => {
      if (i < NCIRC) { circles[i].position.set(x, y, 0.002); circles[i].scale.setScalar(Math.max(c.amp, 1e-5)); }
      const a = 2 * Math.PI * c.k * u + c.ph, dx = c.amp * Math.cos(a), dy = c.amp * Math.sin(a);
      const nx = x + dx, ny = y + dy;
      if (i < HEADS) {
        const L = Math.hypot(dx, dy) || 1e-6, h = Math.min(0.05, Math.max(0.01, L * 0.25)), ux = dx / L, uy = dy / L;
        const bx = nx - ux * h, by = ny - uy * h, px = -uy * h * 0.42, py = ux * h * 0.42;
        hp.set([nx, ny, 0.003, bx + px, by + py, 0.003, bx - px, by - py, 0.003], i * 9);
      }
      x = nx; y = ny;
      pos[(i + 1) * 3] = x; pos[(i + 1) * 3 + 1] = y; pos[(i + 1) * 3 + 2] = 0.003;
    });
    armGeom.attributes.position.needsUpdate = true;
    headGeom.attributes.position.needsUpdate = true;
    tip.position.set(x, y, 0.004);
  }

  /* ---------- stage 2 · Lorenz strands ---------- */
  const M = small ? 170 : 320, P = small ? 64 : 80, STEPS_PER_S = 85, W = Math.ceil(11 * STEPS_PER_S);
  const lorenz = (() => {
    const dt = 0.009, sig = 10, rho = 28, beta = 8 / 3;
    const f = (x, y, z) => [sig * (y - x), x * (rho - z) - y, x * y - beta * z];
    const rk = (s) => {
      const [x, y, z] = s;
      const k1 = f(x, y, z), k2 = f(x + k1[0] * dt / 2, y + k1[1] * dt / 2, z + k1[2] * dt / 2);
      const k3 = f(x + k2[0] * dt / 2, y + k2[1] * dt / 2, z + k2[2] * dt / 2), k4 = f(x + k3[0] * dt, y + k3[1] * dt, z + k3[2] * dt);
      return [x + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), y + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]), z + dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])];
    };
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let s = [0.1, 0, 0]; const master = [];
    for (let i = 0; i < 6000; i++) { s = rk(s); if (i > 500) master.push(s); }
    const L = P + W, data = new Float32Array(M * L * 3), delay = new Float32Array(M), pal = [];
    const colors = [new THREE.Color(C.cyan), new THREE.Color(C.orange), new THREE.Color(C.yellow), new THREE.Color(0x8fe3d6)];
    for (let m = 0; m < M; m++) {
      let st = master[Math.floor(rnd() * master.length)].map((v) => v + (rnd() - .5) * .02);
      for (let j = 0; j < L; j++) {
        st = rk(st);
        const o = (m * L + j) * 3;
        data[o] = st[0] / 11.5; data[o + 1] = (st[2] - 24) / 11.5; data[o + 2] = st[1] / 11.5;
      }
      delay[m] = rnd();
      pal.push(colors[Math.floor(rnd() * 3.35) % 4]);
    }
    return { data, L, delay, pal };
  })();
  const strandTargets = new Float32Array(M * P * 2);
  for (let m = 0; m < M; m++) for (let j = 0; j < P; j++) strandTargets.set(TOUR.at((m + j / (P - 1)) / M), (m * P + j) * 2);
  const NSEG = M * (P - 1);
  const strandGeom = new THREE.BufferGeometry();
  strandGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NSEG * 6), 3));
  strandGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NSEG * 8), 4));
  const strandMat = overlay(new THREE.LineBasicMaterial({ vertexColors: true, opacity: 0.9 }));
  const strands = new THREE.LineSegments(strandGeom, strandMat); strands.renderOrder = 2; scene.add(strands);
  const tmpCol = new THREE.Color(), orangeCol = new THREE.Color(C.orange);

  function strandsAt(tau, blendFn, colorMix) {
    const pos = strandGeom.attributes.position.array, col = strandGeom.attributes.color.array;
    const off = Math.floor(tau * STEPS_PER_S), { data, L, delay, pal } = lorenz;
    let k = 0, kc = 0;
    for (let m = 0; m < M; m++) {
      const b = blendFn(delay[m]);
      tmpCol.copy(pal[m]).lerp(orangeCol, colorMix);
      let px = 0, py = 0, pz = 0, pa = 0;
      for (let j = 0; j < P; j++) {
        const o = (m * L + Math.min(L - 1, j + off)) * 3, t2 = (m * P + j) * 2;
        const x = lerp(data[o], strandTargets[t2], b), y = lerp(data[o + 1], strandTargets[t2 + 1], b), z = lerp(data[o + 2], 0.002, b);
        const a = 0.25 + 0.75 * (j / (P - 1)) * (1 - 0.5 * b) + 0.5 * b * (1 - j / (P - 1));
        if (j > 0) {
          pos[k] = px; pos[k + 1] = py; pos[k + 2] = pz; pos[k + 3] = x; pos[k + 4] = y; pos[k + 5] = z;
          col[kc] = col[kc + 4] = tmpCol.r; col[kc + 1] = col[kc + 5] = tmpCol.g; col[kc + 2] = col[kc + 6] = tmpCol.b;
          col[kc + 3] = pa; col[kc + 7] = a;
          k += 6; kc += 8;
        }
        px = x; py = y; pz = z; pa = a;
      }
    }
    strandGeom.attributes.position.needsUpdate = true;
    strandGeom.attributes.color.needsUpdate = true;
  }

  /* ---------- stage 3 · spinning tops ---------- */
  function topMesh(profile, color, opts = {}) {
    const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), 56);
    const pos = g.attributes.position;
    if (opts.star) for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x), s = 1 + 0.2 * Math.cos(5 * a);
      pos.setX(i, x * s); pos.setZ(i, z * s);
    }
    const params = { roughness: .42, metalness: .06, transparent: true, flatShading: !!opts.star };
    if (opts.sectors) {
      const cols = new Float32Array(pos.count * 3), c1 = new THREE.Color(color), c2 = new THREE.Color(0xfff6dc);
      for (let i = 0; i < pos.count; i++) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i)), c = (Math.floor((a + Math.PI) / (Math.PI / 4)) % 2) ? c1 : c2;
        cols.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      params.vertexColors = true;
    } else { params.color = color; params.emissive = new THREE.Color(color).multiplyScalar(0.12); }
    g.computeVertexNormals();
    g.rotateX(Math.PI / 2); // lathe axis Y → Z (normal of the logo plane)
    const mat = new THREE.MeshStandardMaterial(params);
    const spin = new THREE.Group(); spin.add(new THREE.Mesh(g, mat));
    const tilt = new THREE.Group(); tilt.add(spin);
    const root = new THREE.Group(); root.add(tilt);
    return { root, tilt, spin, mat };
  }
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  const S3 = 0.9, DRAW0 = 1.7, DRAW1 = 7.6, TRAIL_SPAN = 2.2, TRAIL_N = small ? 150 : 300, TRAIL_W = 0.03;
  const TOPS = [
    { profile: [[0, 0], [.04, .03], [.17, .12], [.2, .16], [.12, .2], [.03, .22], [.025, .42], [0, .42]], color: C.orange, opts: { star: true },
      trail: C.yellow, path: makePath([SEG.pStemUp, SEG.pTop]), u0: 0, u1: 1, H: .42, ph: 0, prec: 7, show: 1.0 },
    { profile: [[0, 0], [.04, .04], [.14, .2], [.2, .24], [.18, .27], [.03, .28], [.025, .46], [0, .46]], color: C.cyan, opts: {},
      trail: 0x9af0e6, path: makePath([SEG.bUnder, SEG.bOver, SEG.bStemUp]), u0: 0, u1: 1, H: .46, ph: 2.1, prec: 9, show: 1.0 },
    { profile: [[0, 0], [.03, .03], [.06, .08], [.22, .14], [.23, .18], [.2, .21], [.03, .23], [.025, .4], [0, .4]], color: C.yellow, opts: { sectors: true },
      trail: C.orange, path: makePath([SEG.pUnder]), u0: .16, u1: .96, H: .4, ph: 4.2, prec: 6, show: 2.2 },
  ];
  TOPS.forEach((t) => {
    t.m = topMesh(t.profile, t.color, t.opts);
    t.m.root.scale.setScalar(S3);
    scene.add(t.m.root);
    t.ribbon = new THREE.Mesh(ribbonGeom([sample(t.path, nFor(t.path))], RIB_W, 0.0015), matDraw);
    scene.add(t.ribbon);
    t.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    t.shadow.renderOrder = 1;
    scene.add(t.shadow);
    const tg = new THREE.BufferGeometry(), idx = [];
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 8), 4));
    for (let i = 0; i < TRAIL_N - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    tg.setIndex(idx);
    t.trailMesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    t.trailMesh.renderOrder = 5;
    scene.add(t.trailMesh);
    t.col = new THREE.Color(t.trail);
    t.pts = Array.from({ length: TRAIL_N }, () => new THREE.Vector3());
  });

  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), vZ = new THREE.Vector3(0, 0, 1), vX = new THREE.Vector3(1, 0, 0);
  function topState(t, tau) {
    const u = clamp((tau - DRAW0) / (DRAW1 - DRAW0)), lu = clamp((u - t.u0) / (t.u1 - t.u0));
    const [x, y] = t.path.at(lu);
    const settle = smooth((tau - DRAW1) / 1.2);
    const theta = (0.28 + 0.06 * Math.sin(17 * tau + t.ph)) * (1 - 0.6 * settle);
    const phi = t.prec * tau + t.ph, psi = 36 * tau + t.ph * 3;
    return { x, y, lu, theta, phi, psi };
  }
  const appearOf = (t, tau) => smooth((tau - t.show) / 0.5);
  const vanishOf = (tau) => smooth((tau - 7.7) / 1.0);
  function tipAt(t, tau, out) {
    const s = topState(t, tau), h = t.H * S3 * appearOf(t, tau) * (1 - vanishOf(tau)), st = Math.sin(s.theta);
    return out.set(s.x + h * st * Math.sin(s.phi), s.y - h * st * Math.cos(s.phi), 0.004 + h * Math.cos(s.theta) + 0.5 * vanishOf(tau));
  }
  const vt = new THREE.Vector3(), vv = new THREE.Vector3(), vs = new THREE.Vector3();
  function updateTrail(t, tau) {
    const pos = t.trailMesh.geometry.attributes.position.array, col = t.trailMesh.geometry.attributes.color.array, P3 = t.pts;
    for (let i = 0; i < TRAIL_N; i++) tipAt(t, Math.max(t.show, tau - (1 - i / (TRAIL_N - 1)) * TRAIL_SPAN), P3[i]);
    const fadeAll = 1 - vanishOf(tau);
    for (let i = 0; i < TRAIL_N; i++) {
      const a = P3[Math.max(0, i - 1)], b = P3[Math.min(TRAIL_N - 1, i + 1)], p = P3[i];
      vt.subVectors(b, a); vv.subVectors(camera.position, p);
      vs.crossVectors(vt, vv);
      const l = vs.length(), f = i / (TRAIL_N - 1);
      const back = (1 - f) * TRAIL_SPAN, alive = clamp((tau - back - t.show) * 2.5);
      const w = l > 1e-9 ? TRAIL_W * Math.pow(f, 0.6) * 0.5 / l : 0;
      pos.set([p.x + vs.x * w, p.y + vs.y * w, p.z + vs.z * w, p.x - vs.x * w, p.y - vs.y * w, p.z - vs.z * w], i * 6);
      const br = Math.pow(f, 1.2) * alive * fadeAll;
      col.set([t.col.r, t.col.g, t.col.b, br, t.col.r, t.col.g, t.col.b, br], i * 8);
    }
    t.trailMesh.geometry.attributes.position.needsUpdate = true;
    t.trailMesh.geometry.attributes.color.needsUpdate = true;
  }

  /* ---------- frames (pure functions of time) ---------- */
  function camFront() { camera.position.set(0, 0, CAM_D * viewFit); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0); }
  function reset() {
    epi.visible = false; strands.visible = false; tourRibbon.visible = false;
    pbSolid.visible = false; pbGlow.visible = false;
    TOPS.forEach((t) => { t.m.root.visible = false; t.ribbon.visible = false; t.trailMesh.visible = false; t.shadow.visible = false; });
  }
  function showSolid(op, glow) {
    pbSolid.visible = op > 0.003; matSolid.opacity = op;
    pbGlow.visible = glow > 0.003; matGlow.opacity = glow;
  }

  function frame1(tau) { // 0–9 s
    camFront();
    epi.visible = true;
    const u = clamp((tau - 0.6) / 7.0);
    epicycleAt(u);
    const a = smooth(tau / 0.6) * (1 - smooth((tau - 7.7) / 0.9));
    armMat.opacity = 0.75 * a; headMat.opacity = 0.75 * a; circMat.opacity = 0.17 * a; tipMat.opacity = a;
    if (u < 1) { tourRibbon.visible = true; setRange(tourRibbon, u); }
    else showSolid(1, G0 + 0.42 * smooth((tau - 7.6) / 0.5) * (1 - smooth((tau - 8.3) / 0.7)));
  }

  function frame2(tau) { // 0–10 s
    const p = ease((tau - 0.5) / 8.4), ang = p * Math.PI * 2, lift = Math.sin(p * Math.PI);
    const d = (CAM_D + 1.6 * lift) * viewFit;
    camera.position.set(Math.sin(ang) * d, 1.9 * lift, Math.cos(ang) * d); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
    strands.visible = true;
    const blend = (dl) => (tau < 5 ? 1 - ease((tau - 0.25 - dl * 0.7) / 1.7) : ease((tau - 5.1 - dl * 1.2) / 2.4));
    strandsAt(tau, blend, smooth((tau - 7.2) / 1.6));
    strandMat.opacity = 0.92 * smooth(tau / 0.25) * (1 - smooth((tau - 9.0) / 0.9));
    const rib = clamp((1 - smooth(tau / 0.6)) + smooth((tau - 8.5) / 0.9));
    showSolid(rib, G0 * rib + 0.36 * smooth((tau - 8.8) / .5) * (1 - smooth((tau - 9.4) / .6)));
  }

  const camTilt = new THREE.Vector3(), FRONT = new THREE.Vector3(0, 0, CAM_D);
  function frame3(tau) { // 0–10 s
    const k = ease(tau / 1.5) * (1 - ease((tau - 7.9) / 1.6));
    const az = -0.42 + 0.84 * smooth((tau - 0.3) / 8);
    camTilt.set(5.4 * Math.sin(az), -5.4 * Math.cos(az), 4.3);
    camera.position.copy(FRONT).lerp(camTilt, k).multiplyScalar(viewFit);
    camera.up.set(0, 1, 0); camera.lookAt(0, 0.1 * k, 0);
    const drawing = tau < DRAW1;
    if (drawing) showSolid(1 - 0.86 * smooth(tau / 1.2), G0 * (1 - smooth(tau / 1.2)));
    else showSolid(1, G0 * smooth((tau - DRAW1) / 0.6) + 0.42 * smooth((tau - 8.4) / .6) * (1 - smooth((tau - 9.1) / .9)));
    const vanish = vanishOf(tau);
    TOPS.forEach((t) => {
      const s = topState(t, tau), appear = appearOf(t, tau), size = appear * (1 - vanish);
      if (drawing) { t.ribbon.visible = true; setRange(t.ribbon, s.lu); }
      const r = t.m.root; r.visible = size > 0.002;
      r.position.set(s.x, s.y, 0.004 + 0.5 * vanish);
      r.scale.setScalar(S3 * Math.max(0.002, size));
      qa.setFromAxisAngle(vZ, s.phi); qb.setFromAxisAngle(vX, s.theta);
      t.m.tilt.quaternion.copy(qa).multiply(qb);
      t.m.spin.rotation.set(0, 0, s.psi);
      t.m.mat.opacity = 1 - vanish;
      t.shadow.visible = size > 0.002;
      t.shadow.position.set(s.x, s.y, 0.0008);
      t.shadow.scale.setScalar(Math.max(0.002, size));
      t.shadow.material.opacity = 0.9 * size;
      t.trailMesh.visible = true;
      updateTrail(t, tau);
    });
  }

  function draw(T) {
    reset();
    if (T < STAGE_START[1]) frame1(T / 1000);
    else if (T < STAGE_START[2]) frame2((T - STAGE_START[1]) / 1000);
    else frame3((T - STAGE_START[2]) / 1000);
    renderer.render(scene, camera);
  }
  function hold(tau) {
    reset();
    camFront();
    showSolid(1, G0 + 0.1 * Math.sin(tau * 2.2) ** 2);
    renderer.render(scene, camera);
  }

  return { canvas, resize, draw, hold };
}
