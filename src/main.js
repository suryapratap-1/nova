import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createWorld, clamp } from './world.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const SHOT = new URLSearchParams(location.search).get('shot');
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(hover: none), (pointer: coarse)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

let world = null, lenis = null, anchors = [];
const camEls = $$('[data-cam]');

/* ============================================================ text splitting */
function splitText() {
  $$('[data-chars] .line').forEach(line => {
    const t = line.textContent.trim(); line.textContent = '';
    for (const ch of t) { const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch === ' ' ? ' ' : ch; line.appendChild(s); }
  });
  $$('[data-words]').forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', el.textContent.trim());
    el.innerHTML = words.map(w => `<span class="sw" aria-hidden="true">${w}</span>`).join(' ');
  });
}

/* ============================================================ grain (generated once, moved with transform) */
function makeGrain() {
  const c = document.createElement('canvas'), n = 180; c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

/* ============================================================ scroll → camera progress */
function measure() {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  anchors = camEls.map((el, i) => {
    if (i === 0) return 0;
    if (i === camEls.length - 1) return max;
    const box = el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;
    const r = box.getBoundingClientRect();
    return clamp(r.top + scrollY + r.height / 2 - innerHeight / 2, 0, max);
  });
  for (let i = 1; i < anchors.length; i++) anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1);
}
function progressFor(y) {
  for (let i = 0; i < anchors.length - 1; i++)
    if (y <= anchors[i + 1]) return i + Math.max(0, y - anchors[i]) / (anchors[i + 1] - anchors[i]);
  return anchors.length - 1;
}

/* ============================================================ scroll choreography */
function setupScroll() {
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    // hero drifts up and fades as you leave it
    gsap.to('.hero-in', { yPercent: -18, opacity: 0, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 20%', scrub: true } });
    gsap.to('.scroll-hint', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: '20% top', scrub: true } });

    // statement: pinned, words light up one by one
    gsap.timeline({ scrollTrigger: { trigger: '.statement', start: 'top top', end: '+=140%', pin: true, scrub: .6 } })
      .to('.sw', { opacity: 1, stagger: .1, ease: 'none', duration: .4 })
      .to({}, { duration: .6 });

    // capabilities: pinned horizontal track
    const track = $('.caps-track');
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    gsap.to(track, { x: () => -dist(), ease: 'none',
      scrollTrigger: { trigger: '.caps', start: 'top top', end: () => '+=' + (dist() + innerHeight * .5), pin: true, scrub: .6, invalidateOnRefresh: true } });

    // cards rise in as they enter
    gsap.from('.card', { y: 80, opacity: 0, stagger: .08, duration: 1.2, ease: 'expo.out',
      scrollTrigger: { trigger: '.caps', start: 'top 70%' } });

    // stats rise
    gsap.from('.stat', { y: 40, opacity: 0, stagger: .08, duration: 1.1, ease: 'expo.out',
      scrollTrigger: { trigger: '.stats', start: 'top 85%' } });
  });

  // counters
  $$('[data-count]').forEach(el => {
    const to = +el.dataset.count, o = { v: 0 };
    ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true,
      onEnter: () => REDUCE ? (el.textContent = to) : gsap.to(o, { v: to, duration: 2.2, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); } }) });
  });

  // white-out into the CTA
  const flash = $('#flash'), ctaIn = $('.cta-in'), vig = $('#vignette');
  ScrollTrigger.create({ trigger: '.cta', start: 'top bottom', end: 'bottom bottom', scrub: true,
    onUpdate: self => {
      const f = smoothstep(.45, .92, self.progress);
      flash.style.opacity = f; vig.style.opacity = 1 - f; if (world) world.RIG.flash = f;
      ctaIn.style.opacity = smoothstep(.8, 1, self.progress);
    } });

  // line reveals
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
    { rootMargin: '0px 0px -15% 0px' });
  $$('.reveal').forEach(el => io.observe(el));

  // nav state
  const links = $$('[data-nav]');
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: () => {
    const p = Math.round(progressFor(scrollY));
    links.forEach(a => a.classList.toggle('on', +a.dataset.nav === p));
  } });

  ScrollTrigger.addEventListener('refresh', () => { lenis?.resize(); measure(); });
  ScrollTrigger.refresh();
}

/* ============================================================ interaction */
function setupInteraction() {
  // anchor links through Lenis
  $$('[data-link]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (!id.startsWith('#')) return;
    e.preventDefault();
    const target = id === '#top' ? 0 : $(id);
    lenis ? lenis.scrollTo(target, { duration: 1.8 }) : (target === 0 ? scrollTo(0, 0) : target.scrollIntoView());
  }));

  if (!FINE) return;

  // cursor: instant dot + trailing ring
  const dot = $('.cur-dot'), ring = $('.cur-ring');
  const dx = gsap.quickTo(dot, 'x', { duration: .08 }), dy = gsap.quickTo(dot, 'y', { duration: .08 });
  const rx = gsap.quickTo(ring, 'x', { duration: .5, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: .5, ease: 'power3' });
  addEventListener('pointermove', e => {
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    if (world) { world.RIG.tpx = (e.clientX / innerWidth) * 2 - 1; world.RIG.tpy = -((e.clientY / innerHeight) * 2 - 1); }
  }, { passive: true });
  $$('a, button, .card').forEach(el => {
    el.addEventListener('pointerenter', () => ring.classList.add('big'));
    el.addEventListener('pointerleave', () => ring.classList.remove('big'));
  });

  if (REDUCE) return;

  // glass cards tilt toward the cursor
  $$('.card').forEach(card => {
    gsap.set(card, { transformPerspective: 900 });
    const glare = $('.glare', card);
    const tx = gsap.quickTo(card, 'rotationY', { duration: .7, ease: 'power3' }), ty = gsap.quickTo(card, 'rotationX', { duration: .7, ease: 'power3' });
    const gx = gsap.quickTo(glare, 'x', { duration: .4, ease: 'power3' }), gy = gsap.quickTo(glare, 'y', { duration: .4, ease: 'power3' });
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      tx((x - .5) * 14); ty(-(y - .5) * 14); gx(x * r.width); gy(y * r.height);
    });
    card.addEventListener('pointerleave', () => { tx(0); ty(0); });
  });

  // magnetic CTA
  const zone = $('.mag-zone'), btn = $('.magnetic'), label = $('.magnetic span');
  const bx = gsap.quickTo(btn, 'x', { duration: 1, ease: 'elastic.out(1, .45)' }), by = gsap.quickTo(btn, 'y', { duration: 1, ease: 'elastic.out(1, .45)' });
  const lx = gsap.quickTo(label, 'x', { duration: 1, ease: 'elastic.out(1, .45)' }), ly = gsap.quickTo(label, 'y', { duration: 1, ease: 'elastic.out(1, .45)' });
  zone.addEventListener('pointermove', e => {
    const r = btn.getBoundingClientRect(), mx = e.clientX - (r.left + r.width / 2), my = e.clientY - (r.top + r.height / 2);
    bx(mx * .4); by(my * .4); lx(mx * .18); ly(my * .18);
  });
  zone.addEventListener('pointerleave', () => { bx(0); by(0); lx(0); ly(0); });
}

/* ============================================================ marquee (velocity-reactive, transform only) */
function setupMarquee() {
  const rows = $$('.mq-in').map((el, i) => ({ el, x: 0, dir: i % 2 ? 1 : -1, w: 0 }));
  const measureRows = () => rows.forEach(r => { r.w = r.el.scrollWidth / 2; });
  measureRows(); addEventListener('resize', measureRows);
  return dt => {
    if (REDUCE) return;
    const v = lenis ? Math.abs(lenis.velocity) : 0;
    rows.forEach(r => {
      r.x += r.dir * (55 + Math.min(v, 60) * 14) * dt;
      if (r.x <= -r.w) r.x += r.w; if (r.x > 0) r.x -= r.w;
      r.el.style.transform = `translate3d(${r.x}px,0,0)`;
    });
  };
}

/* ============================================================ preloader
   One continuous counter: it follows real progress, never moves faster than an eased
   minimum pace, and creeps gently while a job is still running instead of freezing. */
const PRE = { target: 0, shown: 0 };
function runCounter() {
  const pct = $('#pre-pct'), fill = $('#pre-fill'), t0 = performance.now();
  let last = -1, prev = t0;
  return new Promise(done => {
    const step = () => {
      const now = performance.now();                                   // own clock: rAF stamps can predate t0
      const dt = clamp((now - prev) / 1000, 0, .05); prev = now;
      const k = clamp((now - t0) / 1900, 0, 1);
      const paced = 100 * (1 - Math.pow(1 - k, 3));                       // easeOutCubic over ~1.9s
      const real = PRE.target * 100;
      const goal = Math.min(paced, real >= 100 ? 100 : Math.max(real, Math.min(94, PRE.shown + dt * 6)));
      PRE.shown += (goal - PRE.shown) * (1 - Math.exp(-9 * dt));
      if (real >= 100 && paced >= 100 && PRE.shown > 99.6) PRE.shown = 100;
      const v = Math.round(PRE.shown);
      if (v !== last) { pct.textContent = String(v).padStart(3, '0'); last = v; }
      fill.style.transform = `scaleX(${PRE.shown / 100})`;
      if (PRE.shown >= 100) return done();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function intro() {
  const tl = gsap.timeline();
  tl.to('#pre', { yPercent: -100, duration: 1.15, ease: 'expo.inOut' })
    .add(() => { world?.startIntro(); }, '<.15')
    .from('.hero .ch', { yPercent: 70, opacity: 0, filter: 'blur(14px)', duration: 1.4, ease: 'expo.out', stagger: .035, clearProps: 'filter' }, '-=.55')
    .from(['.hero .label', '.hero .lead', '.hero-ctas', '.scroll-hint'], { y: 26, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .08 }, '-=1.1')
    .from('.nav', { y: -24, opacity: 0, duration: 1, ease: 'expo.out' }, '<')
    .add(() => { $('#pre').style.display = 'none'; }, 1.2);
  setTimeout(unlock, 900);
}
function unlock() { document.body.classList.remove('is-locked'); lenis?.start(); }

function fallback(err) {
  console.warn('[nova] WebGL unavailable, static mode:', err);
  document.documentElement.classList.add('no-webgl');
  world = null;
}

/* ============================================================ boot */
async function boot() {
  splitText(); makeGrain();

  if (!REDUCE) {
    lenis = new Lenis({ lerp: .085, smoothWheel: true, wheelMultiplier: .9 });
    lenis.stop();
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
  }
  gsap.ticker.lagSmoothing(0);

  const jobs = [['Loading type', () => document.fonts.ready]];
  try { world = createWorld($('#gl'), { coarse: COARSE, reduce: REDUCE }); jobs.push(...world.jobs); } catch (e) { fallback(e); }

  const counter = SHOT === null && !REDUCE ? runCounter() : Promise.resolve();
  for (let i = 0; i < jobs.length; i++) {
    $('#pre-job').textContent = jobs[i][0];
    await new Promise(r => requestAnimationFrame(() => r()));   // let the counter paint between jobs
    try { await jobs[i][1](); } catch (e) { fallback(e); break; }
    PRE.target = (i + 1) / jobs.length;
  }
  PRE.target = 1;
  await counter;
  $('#pre-job').textContent = 'Ready';
  try { world?.warmup(); } catch (e) { fallback(e); }

  setupScroll();
  setupInteraction();
  const marquee = setupMarquee();

  addEventListener('resize', () => { world?.resize(); }, { passive: true });
  gsap.ticker.add((time, deltaMs) => {
    const dt = deltaMs / 1000;
    marquee(Math.min(dt, .05));
    if (!world || document.hidden) return;
    world.RIG.prog = progressFor(scrollY);
    world.tick(dt);
  });

  if (SHOT !== null) {                                     // ?shot=N — deterministic review state
    $('#pre').style.display = 'none'; unlock();
    const n = clamp(parseInt(SHOT, 10) || 0, 0, camEls.length - 1);
    measure();
    lenis ? lenis.scrollTo(anchors[n], { immediate: true, force: true }) : scrollTo(0, anchors[n]);
    if (world) { world.RIG.prog = world.RIG.smooth = progressFor(anchors[n]); }
    $$('.reveal').forEach(e => e.classList.add('in'));
    ScrollTrigger.update();
  } else if (REDUCE) {
    $('#pre').style.display = 'none'; unlock();
  } else {
    intro();
  }
  window.__nova = { world, lenis, anchors: () => anchors };
}

boot();
