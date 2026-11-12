import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sculptVert, sculptFrag, partVert, partFrag, skyVert, skyFrag, GradeShader } from './shaders.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
const damp = (c, t, r, dt) => lerp(c, t, 1 - Math.exp(-r * dt));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - t, 3);

function rng(seed) {
  let a = seed >>> 0, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  return () => { a |= 0; b |= 0; c |= 0; d |= 0; const t = (a + b | 0) + d | 0; d = d + 1 | 0; a = b ^ b >>> 9;
    b = c + (c << 3) | 0; c = c << 21 | c >>> 11; c = c + t | 0; return (t >>> 0) / 4294967296; };
}

/* One shot per [data-cam] chapter. Sculpture sits at the origin. */
export const SHOTS = [
  { p: [0.3, 0.25, 8.6], t: [-1.7, 0.05, 0], fov: 38 },   // 0 hero — sculpture right of centre
  { p: [-1.2, 6.2, 12.5], t: [0.4, -0.2, 0], fov: 36 },   // 1 statement — high and wide over the ring
  { p: [6.8, -1.4, 5.6], t: [0, 0.7, 0], fov: 48 },       // 2 capabilities — low, dramatic
  { p: [-4.2, -0.9, 7.8], t: [1.6, -2.7, -3], fov: 54 },  // 3 numbers — skimming the wave field
  { p: [0, 0.05, 2.9], t: [0, 0, 0], fov: 62 }            // 4 CTA — dive into the core
];

export function createWorld(canvas, { coarse, reduce }) {
  let renderer, scene, camera, composer, bloom, grade, curveP, curveT;
  const W = {};
  const RIG = { prog: 0, smooth: 0, px: 0, py: 0, tpx: 0, tpy: 0, intro: 1, introT0: 0, flash: 0 };
  let scale = 1, clock = 0, warm = 0;
  const PERF = { acc: 0, n: 0 };
  const R = rng(20261112);

  /* ---------------------------------------------------------- jobs (run by the preloader) */
  function initRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    if (!renderer.getContext()) throw new Error('no webgl');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#050507');
    camera = new THREE.PerspectiveCamera(SHOTS[0].fov, innerWidth / innerHeight, 0.1, 200);
    curveP = new THREE.CatmullRomCurve3(SHOTS.map(s => new THREE.Vector3(...s.p)), false, 'catmullrom', 0.45);
    curveT = new THREE.CatmullRomCurve3(SHOTS.map(s => new THREE.Vector3(...s.t)), false, 'catmullrom', 0.45);
  }

  function buildSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false }));
    scene.add(sky);
  }

  function buildSculpture() {
    const geo = new THREE.SphereGeometry(1.45, coarse ? 110 : 220, coarse ? 74 : 150);
    const mat = new THREE.ShaderMaterial({
      vertexShader: sculptVert, fragmentShader: sculptFrag,
      uniforms: { uTime: { value: 0 }, uAmp: { value: 0.34 }, uPointer: { value: new THREE.Vector2() },
        uLight: { value: new THREE.Vector3(2, 2, 3) }, uGlow: { value: 0.15 } }
    });
    W.sculpt = new THREE.Mesh(geo, mat);
    scene.add(W.sculpt);

    // halo behind the sculpture
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.3, 'rgba(255,255,255,.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    W.glowTex = new THREE.CanvasTexture(c);
    W.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.glowTex, color: '#6a4dff', transparent: true, opacity: .35,
      depthWrite: false, blending: THREE.AdditiveBlending }));
    W.halo.scale.set(9, 9, 1); W.halo.position.z = -1.5;
    scene.add(W.halo);
  }

  function buildParticles() {
    const N = coarse ? 9000 : 22000;
    const A = new Float32Array(N * 3), B = new Float32Array(N * 3), C = new Float32Array(N * 3),
      D = new Float32Array(N * 3), E = new Float32Array(N * 3), RR = new Float32Array(N * 4);
    const v = new THREE.Vector3(), tilt = new THREE.Euler(.42, 0, -.18), gauss = () => (R() + R() + R() - 1.5) / 1.5;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      // A: sphere shell
      v.set(gauss(), gauss(), gauss()).normalize().multiplyScalar(3.1 + R() * .7);
      A[k] = v.x; A[k + 1] = v.y; A[k + 2] = v.z;
      // B: tilted ring (galaxy disc)
      const th = R() * Math.PI * 2, rad = 3.6 + gauss() * .9 + (R() < .2 ? 1.6 : 0);
      v.set(Math.cos(th) * rad, gauss() * .12, Math.sin(th) * rad).applyEuler(tilt);
      B[k] = v.x; B[k + 1] = v.y; B[k + 2] = v.z;
      // C: double helix along x
      const x = (R() - .5) * 16, strand = i % 2 ? Math.PI : 0, rung = R() < .18;
      const ph = x * 1.1 + strand, rr = rung ? (R() * 2 - 1) * 1.25 : 1.25 + gauss() * .08;
      C[k] = x; C[k + 1] = .7 + Math.cos(ph) * rr; C[k + 2] = Math.sin(ph) * rr;
      // D: wave field under the sculpture
      D[k] = (R() - .5) * 26; D[k + 2] = -16 + R() * 22; D[k + 1] = -3.1 + gauss() * .05;
      // E: aura around the core
      v.set(gauss(), gauss(), gauss()).normalize().multiplyScalar(1.85 + R() * .35);
      E[k] = v.x; E[k + 1] = v.y; E[k + 2] = v.z;
      RR[i * 4] = R(); RR[i * 4 + 1] = R(); RR[i * 4 + 2] = R(); RR[i * 4 + 3] = R();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(A, 3));
    geo.setAttribute('aA', new THREE.BufferAttribute(A, 3));
    geo.setAttribute('aB', new THREE.BufferAttribute(B, 3));
    geo.setAttribute('aC', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('aD', new THREE.BufferAttribute(D, 3));
    geo.setAttribute('aE', new THREE.BufferAttribute(E, 3));
    geo.setAttribute('aR', new THREE.BufferAttribute(RR, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
    W.part = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: partVert, fragmentShader: partFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uMorph: { value: 0 }, uTime: { value: 0 }, uSize: { value: coarse ? 34 : 26 }, uPixel: { value: 1 }, uOpacity: { value: .55 } }
    }));
    scene.add(W.part);
  }

  function buildAtmos() {
    // orbit rings
    W.rings = [];
    [[2.25, .9, .2], [2.75, 1.25, -.5], [3.5, 1.5, .9]].forEach(([r, rx, rz], i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, .006, 6, 220),
        new THREE.MeshBasicMaterial({ color: i === 1 ? '#4de1ff' : '#8a6dff', transparent: true, opacity: .45,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.set(rx, 0, rz); m.userData.sp = (i % 2 ? -1 : 1) * (.05 + i * .03);
      scene.add(m); W.rings.push(m);
    });
    // floating dust
    if (!reduce) {
      const n = coarse ? 600 : 1600, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (R() - .5) * 40; pos[i * 3 + 1] = (R() - .5) * 22; pos[i * 3 + 2] = (R() - .5) * 40; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      W.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: .035, color: '#b9b2ff', transparent: true, opacity: .5,
        depthWrite: false, blending: THREE.AdditiveBlending }));
      scene.add(W.dust);
    }
  }

  function initPost() {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), coarse ? .5 : .6, .7, .5);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    grade.uniforms.uRes.value = new THREE.Vector2();
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    resize();
  }

  // scene shaders compile off the main thread (KHR_parallel_shader_compile) so the loader keeps animating
  async function compile() { applyCamera(); await renderer.compileAsync(scene, camera); }
  // first full render (post-processing passes) — run once the counter has finished, where a brief hitch is invisible
  function warmup() { applyCamera(); composer.render(); }

  const jobs = [
    ['Starting renderer', initRenderer],
    ['Painting the void', buildSky],
    ['Sculpting glass', buildSculpture],
    ['Seeding particles', buildParticles],
    ['Adding atmosphere', buildAtmos],
    ['Grading light', initPost],
    ['Compiling shaders', compile]
  ];

  /* ---------------------------------------------------------- frame */
  function resize() {
    if (!composer) return;
    const dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2) * scale;
    renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
    composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight);
    grade.uniforms.uRes.value.set(innerWidth * dpr, innerHeight * dpr);
    W.part.material.uniforms.uPixel.value = dpr;
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  }

  const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
  function applyCamera() {
    const N = SHOTS.length - 1, s = RIG.smooth, u = clamp(s / N, 0, 1);
    curveP.getPoint(u, _p); curveT.getPoint(u, _t);
    const i = clamp(Math.floor(s), 0, N - 1), f = clamp(s - i, 0, 1);
    let fov = lerp(SHOTS[i].fov, SHOTS[i + 1].fov, f);
    // tall screens: recentre the subject, step back and widen
    const k = clamp((1.5 - innerWidth / innerHeight) / 1.0, 0, 1) * (1 - smoothstep(3.4, 4, s));
    if (k > 0) {
      const MOB = [2.1, 2.6, 0, 2.6, 0];                 // per-shot: look lower so the sculpture rises above the copy
      const lift = lerp(MOB[i], MOB[i + 1], f * f * (3 - 2 * f));
      _t.x = lerp(_t.x, 0, k * (1 - smoothstep(0, 1, s))); _t.y -= k * lift;
      _d.subVectors(_p, _t).normalize(); _p.addScaledVector(_d, k * 5); fov *= 1 + k * .3;
    }
    const io = 1 - RIG.intro; _p.z += io * 7; _p.y += io * 1.2; fov += io * 10;    // intro dolly
    const par = 1 - smoothstep(2.5, 4, s);                                        // hand-held parallax, calm at the end
    _p.x += RIG.px * .45 * par; _p.y += RIG.py * .3 * par; _t.x -= RIG.px * .15 * par;
    camera.position.copy(_p); camera.lookAt(_t);
    if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  function governor(raw) {
    warm += raw; if (warm < 2) return;
    PERF.acc += raw; PERF.n++;
    if (PERF.n < 40) return;
    const avg = PERF.acc / PERF.n; PERF.acc = PERF.n = 0;
    if (avg > .022 && scale > .5) { scale = Math.max(.5, scale * (avg > .045 ? .65 : .85)); resize(); }
    else if (avg < .0135 && scale < 1) { scale = Math.min(1, scale + .08); resize(); }
  }

  function tick(raw) {
    const dt = Math.min(raw, .05);
    if (!reduce) clock += dt;
    governor(raw);
    RIG.smooth = reduce ? RIG.prog : damp(RIG.smooth, RIG.prog, 6, dt);
    RIG.px = damp(RIG.px, RIG.tpx, 3, dt); RIG.py = damp(RIG.py, RIG.tpy, 3, dt);
    if (RIG.introT0) RIG.intro = easeOut(clamp((performance.now() - RIG.introT0) / 2800, 0, 1));
    applyCamera();

    const s = RIG.smooth, dive = smoothstep(3.2, 4, s);
    const su = W.sculpt.material.uniforms;
    su.uTime.value = clock;
    su.uPointer.value.set(RIG.px, RIG.py);
    su.uLight.value.set(RIG.px * 4 + 1.5, 2 + RIG.py * 3, 3.5);
    su.uGlow.value = .12 + dive * 1.6 + Math.sin(clock * 1.4) * .04;
    su.uAmp.value = .34 + Math.sin(s * 1.7) * .08;
    W.sculpt.rotation.set(s * .3 + RIG.py * .12, clock * .12 + s * .9 + RIG.px * .2, 0);
    W.halo.material.opacity = .22 + dive * .6;

    const pu = W.part.material.uniforms;
    pu.uMorph.value = s; pu.uTime.value = clock;
    pu.uOpacity.value = .55 + dive * .35;
    W.part.rotation.y = clock * .03 + (s < 3 ? 0 : 0);

    W.rings.forEach((m, i) => { m.rotation.z += m.userData.sp * dt; m.material.opacity = .4 * (1 - smoothstep(2.4, 3.2, s)) + .05; });
    if (W.dust) { W.dust.rotation.y += dt * .012; W.dust.position.y = Math.sin(clock * .2) * .3; }

    renderer.toneMappingExposure = 1 + dive * 1.4;
    grade.uniforms.uT.value = clock;
    if (RIG.flash < .995) composer.render();                 // fully white-out → skip the GPU work
  }

  function startIntro() { if (!reduce) { RIG.intro = 0; RIG.introT0 = performance.now(); } }

  return { jobs, RIG, tick, resize, startIntro, warmup, debug: () => ({ scene, camera, renderer, scale }) };
}
