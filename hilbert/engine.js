/* engine.js — one clock, and everything on screen is a function of it.
   The narration track is the master clock; the timeline (timeline.js) says when every word is spoken.
   Nothing here uses timers, CSS transitions or random numbers, so any moment can be seeked to exactly.

   Kit code: the same in every presentation. A show changes world.js, scenes.js, show.css and index.html.
   With no narration file (a draft timeline, or a fresh clone) it runs silently on the wall clock. */
(function () {
'use strict';
const TL = window.TL, C = TL.cues;
const qs = new URLSearchParams(location.search);
let STATIC_T = null;                                                // ?t=42.5 or ?t=cue+0.6 renders that frame, no audio (set below, once at() exists)
let silent = qs.has('silent') || !!TL.draft;                        // ?silent=1, a draft timeline, or no narration file: the wall clock stands in for the voice
                                                                    // (a draft timeline never plays audio: any files lying about were rendered to other timings)

/* A show that cannot start says why, on the page: a wrong cue name used to leave a blank screen and a test that timed out. */
function fail(msg) {
  document.body.dataset.error = (document.body.dataset.error ? document.body.dataset.error + ' | ' : '') + msg;
  let n = document.getElementById('boot-error');
  if (!n) { n = document.createElement('pre'); n.id = 'boot-error'; n.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:99;margin:0;padding:14px 18px;background:#7A1F12;color:#fff;font:600 15px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap'; n.textContent = 'This show cannot start:'; document.body.appendChild(n); }
  n.textContent += '\n' + msg;
}
window.addEventListener('error', e => { if (!document.body.classList.contains('ready')) fail(e.message + (e.filename ? '   (' + e.filename.split('/').pop().split('?')[0] + ':' + e.lineno + ')' : '')); });
/* On a draft timeline (or with ?check=1) a time that names a cue or chapter the script does not have is noted, not
   fatal: it resolves to mid-film, so a half-converted show still loads and can be looked at. tests/cues.js lists
   them. On a real timeline it is an error. */
const lenient = !!TL.draft || qs.has('check'), unknown = new Map();
let asking = '';                                                    // which element is asking, for the message
function miss(kind, spec) {
  if (!lenient) throw new Error(`no ${kind}: ${spec}${asking ? '   (' + asking + ')' : ''}`);
  const name = (kind === 'chapter' ? '@' : '') + String(spec).replace(/^@/, '').replace(/([+-]\d*\.?\d+)$/, '').replace(/\.end$/, '');
  const u = unknown.get(name) || { where: asking || 'world.js or scenes.js', n: 0 }; u.n++; unknown.set(name, u);
  return TL.duration * .5;
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  lin: p => p,
  out: p => 1 - Math.pow(1 - p, 3),
  in: p => p * p * p,
  io: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  expo: p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p),
  back: p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  spring: p => p >= 1 ? 1 : 1 - Math.exp(-6.5 * p) * Math.cos(10 * p),
};
const chapter = id => TL.chapters.find(c => c.id === id);

/* "cue", "cue+0.4", "@farm" (chapter start), "@farm.end", "@end", or seconds */
function at(spec) {
  if (typeof spec === 'number') return spec;
  const m = /^(@?[a-z0-9_.]+?)([+-]\d*\.?\d+)?$/i.exec(String(spec).trim());
  if (!m) throw new Error('bad time: ' + spec);
  let base;
  if (m[1] === '@end') base = TL.duration;
  else if (m[1][0] === '@') {
    const [id, edge] = m[1].slice(1).split('.');
    const ch = chapter(id); if (!ch) return miss('chapter', String(spec));
    base = edge === 'end' ? ch.end : ch.start;
  } else if (m[1] in C) base = C[m[1]];
  else if (!isNaN(parseFloat(m[1]))) base = parseFloat(m[1]);
  else return miss('cue', String(spec));
  return base + (m[2] ? parseFloat(m[2]) : 0);
}
if (qs.has('t')) { const v = qs.get('t').trim().replace(/ /g, '+'); STATIC_T = isNaN(+v) ? at(v) : +v; }      // a + in an address arrives as a space
/* eased 0..1 progress of something that starts at `start` and takes `dur` seconds */
const prog = (t, start, dur = .6, e = E.out) => e(clamp((t - at(start)) / dur));
const between = (t, a, b) => t >= at(a) && t < at(b);
/* keyframes: [[time, value], ...]; numbers or equal-length arrays; holds before the first and after the last */
function kf(t, keys, e = E.io) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i], p = (keys[i][2] || e)(clamp((t - t0) / (t1 - t0)));
      return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], p)) : lerp(v0, v1, p);
    }
  }
  return keys[keys.length - 1][1];
}
const hex = h => h[0] === '#' ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] : h.match(/[\d.]+/g).slice(0, 3).map(Number);
const mix = (a, b, p) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], p))).join(',')})`; };
/* a repeatable pseudo-random number for index i */
const rnd = (i, salt = 0) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------- HUD elements: data-in / data-out / data-fx ---------- */
const FX_IN = {
  fade: (s, p) => { s.opacity = p; },
  rise: (s, p) => { s.opacity = p; s.transform = `translate3d(0,${(1 - p) * 34}px,0)`; },
  slam: (s, p) => { s.opacity = Math.min(1, p * 2.5); s.transform = `scale(${lerp(1.3, 1, p)})`; s.filter = p < 1 ? `blur(${(1 - p) * 14}px)` : ''; },
  pop: (s, p) => { s.opacity = Math.min(1, p * 3); s.transform = `scale(${lerp(.55, 1, p)})`; },
  stamp: (s, p) => { s.opacity = Math.min(1, p * 4); s.transform = `rotate(var(--rot,-7deg)) scale(${p < .7 ? lerp(2.4, .92, p / .7) : lerp(.92, 1, (p - .7) / .3)})`; },
  wipe: (s, p) => { s.opacity = 1; s.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`; },
  card: (s, p) => { s.opacity = Math.min(1, p * 3); s.transform = `translate3d(${(1 - p) * 760}px,${(1 - p) * 60}px,0) rotate(calc(var(--rot,2deg) + ${(1 - p) * 9}deg))`; },
  plate: (s, p) => { s.opacity = Math.min(1, p * 6); s.transform = `translate3d(0,${(1 - p) * 1080}px,0) rotate(${(1 - p) * -3}deg)`; },
  drop: (s, p) => { s.opacity = Math.min(1, p * 3); s.transform = `translate3d(0,${(1 - p) * -70}px,0)`; },
};
const FX_EASE = { fade: E.out, rise: E.out, slam: E.expo, pop: E.back, stamp: E.lin, wipe: E.io, card: E.out, plate: E.out, drop: E.spring };
const FX_DUR = { fade: .4, rise: .42, slam: .5, pop: .42, stamp: .3, wipe: .9, card: .75, plate: .85, drop: .7 };
const FX_OUT = {
  fade: (s, q) => { s.opacity = String(parseFloat(s.opacity || 1) * (1 - q)); },
  chip: (s, q) => { s.opacity = String(1 - q); s.transform = `translate3d(${q * 520}px,${q * -260}px,0) scale(${lerp(1, .22, q)})`; s.transformOrigin = 'top right'; },
  down: (s, q) => { s.transform = `translate3d(0,${q * 1080}px,0) rotate(${q * 3}deg)`; },
  right: (s, q) => { s.opacity = String(1 - q); s.transform = `translate3d(${q * 700}px,0,0) rotate(var(--rot,2deg))`; },
  up: (s, q) => { s.opacity = String(1 - q); s.transform = `translate3d(0,${q * -40}px,0)`; },
};
const els = [];
function register(node, defIn, defOut) {
  const d = node.dataset, fx = d.fx || 'rise', what = `on "${(node.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) || node.id || node.className)}"`;
  if (!FX_IN[fx]) throw new Error(`no such data-fx: ${fx}   (${what})`);
  if (d.outfx && !FX_OUT[d.outfx]) throw new Error(`no such data-outfx: ${d.outfx}   (${what})`);
  asking = 'data-in ' + what; const tin = d.in ? at(d.in) : defIn;
  asking = 'data-out ' + what; const tout = d.out ? at(d.out) : defOut; asking = '';
  const item = { node, tin, tout, fx, outfx: d.outfx || 'fade', din: parseFloat(d.dur) || FX_DUR[fx], dout: parseFloat(d.outdur) || (d.outfx ? .5 : .28), shown: null, parts: null };
  if ('split' in d) {                                 // word-by-word entrance
    const stagger = parseFloat(d.stagger) || .055;
    const walk = n => {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(w => {
            if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
            const sp = document.createElement('span'); sp.className = 'w'; sp.textContent = w; frag.appendChild(sp);
          });
          n.replaceChild(frag, c);
        } else if (c.nodeType === 1 && !c.classList.contains('keep')) walk(c);
      }
    };
    walk(node);
    item.parts = $$('.w', node).map((n, i) => ({ n, t: tin + i * stagger }));
  }
  els.push(item);
}
function renderEls(t) {
  for (const el of els) {
    const s = el.node.style;
    const live = t >= el.tin && t < el.tout + el.dout;
    if (!live) { if (el.shown !== false) { s.visibility = 'hidden'; el.shown = false; } continue; }
    if (el.shown !== true) { s.visibility = 'visible'; el.shown = true; }
    s.filter = ''; s.clipPath = ''; s.transform = ''; s.transformOrigin = '';
    if (el.parts) {
      s.opacity = 1;
      for (const w of el.parts) { const p = E.out(clamp((t - w.t) / .36)); w.n.style.opacity = p; w.n.style.transform = p < 1 ? `translate3d(0,${(1 - p) * 26}px,0)` : ''; }
    } else FX_IN[el.fx](s, FX_EASE[el.fx](clamp((t - el.tin) / el.din)));
    if (el.fx === 'card' || el.fx === 'plate') s.transform += ` translate3d(0,${(Math.sin(t * .9 + el.tin) * 3.2).toFixed(2)}px,0) rotate(${(Math.sin(t * .7 + el.tin * 2) * .2).toFixed(3)}deg)`;   // paper never lies quite still
    if (t > el.tout) FX_OUT[el.outfx](s, E.in(clamp((t - el.tout) / el.dout)));
  }
  for (const n of onNodes) n.el.classList.toggle('on', t >= n.t);
}
const onNodes = [];

/* ---------- layout safety net ----------
   The type is placed by hand in a 1920×960 frame. A browser that sets a line a little wider, or a font that fails
   to load, could push one block into another. So before the film starts, every block is measured at rest on this
   device; any two that are on screen together and touch are found; and the one that is overflowing is shrunk
   until they clear. Blocks are also kept inside the frame. When the fonts load as designed there is nothing to do. */
const FRAME = { w: 1920, h: 960, right: 1904, bottom: 956 };
const isFixed = n => n.matches('.paper,.chip,.row,[data-fixed]');
const blocks = () => els.filter(e => !e.node.parentElement.closest('.h') && !('free' in e.node.dataset));
function measure(pad, strict) {
  document.body.classList.add('measuring');
  const us = blocks(), origin = $('#stage').getBoundingClientRect();
  const rects = us.map(u => { const r = u.node.getBoundingClientRect(); return { l: r.left - origin.left, t: r.top - origin.top, r: r.right - origin.left, b: r.bottom - origin.top, w: r.width, h: r.height }; });
  document.body.classList.remove('measuring');
  const out = [];
  us.forEach((a, i) => {
    const A = rects[i]; if (!A.w || !A.h) return;
    if (!isFixed(a.node) && (A.r > FRAME.right || A.b > FRAME.bottom)) out.push({ a, A, edge: A.r > FRAME.right ? 'right' : 'bottom', over: Math.max(A.r - FRAME.right, A.b - FRAME.bottom) });
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j], B = rects[j]; if (!B.w || !B.h) continue;
      if (strict ? Math.min(a.tout + a.dout, b.tout + b.dout) - Math.max(a.tin, b.tin) < .04       // strict: not even while one fades as the other arrives
                 : Math.min(a.tout, b.tout) - Math.max(a.tin + a.din, b.tin + b.din) < .5) continue;      // never properly on screen together
      const ba = a.node.closest('.blk'); if (ba && ba === b.node.closest('.blk')) continue;      // lines of one block are in flow
      const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l) + pad, oy = Math.min(A.b, B.b) - Math.max(A.t, B.t) + pad;
      if (ox > 0 && oy > 0) out.push({ a, b, A, B, ox, oy });
    }
  });
  return out;
}
const label = e => (e.node.textContent.trim().replace(/\s+/g, ' ').slice(0, 38) || e.node.id || e.node.className) + ' @' + e.tin.toFixed(1);
function audit(pad = 0, strict = false) { return measure(pad, strict).map(c => c.edge ? `${label(c.a)} runs past the ${c.edge} edge by ${Math.round(c.over)}` : `${label(c.a)}  ×  ${label(c.b)}  (${Math.round(c.ox)}×${Math.round(c.oy)})`); }
function fitLayout() {
  const skip = new Set(), log = [];
  for (let guard = 0; guard < 400; guard++) {
    const c = measure(6).find(x => !skip.has(x.a.node) || (x.b && !skip.has(x.b.node))); if (!c) break;      // blocks keep at least 6px apart
    let pick, ox = 'l', oy = 't';
    if (c.edge) { pick = c.a; if (c.edge === 'bottom' && c.A.t > FRAME.h / 2) oy = 'b'; }
    else {
      const side = c.ox < c.oy;                        // side by side, or one above the other?
      const first = side ? (c.A.l <= c.B.l ? c.a : c.b) : (c.A.t <= c.B.t ? c.a : c.b), second = first === c.a ? c.b : c.a;
      pick = isFixed(first.node) || skip.has(first.node) ? second : first;
      if (isFixed(pick.node) || skip.has(pick.node)) { skip.add(c.a.node); skip.add(c.b.node); continue; }
      if (pick === second) { if (side) ox = 'r'; else oy = 'b'; }      // shrink away from the neighbour that cannot move
    }
    const next = (parseFloat(pick.node.dataset.fit) || 1) * .965;
    if (next < .6) { skip.add(pick.node); continue; }
    pick.node.dataset.fit = next.toFixed(4);
    if (window.CSS && CSS.supports && CSS.supports('scale', '1')) pick.node.style.scale = next.toFixed(4); else pick.node.style.zoom = next.toFixed(4);
    pick.node.classList.remove('fit-lt', 'fit-rt', 'fit-lb', 'fit-rb'); pick.node.classList.add('fit-' + ox + oy);
    if (!log.includes(pick)) log.push(pick);
  }
  window.Show.fitReport = { adjusted: log.map(e => label(e) + ' → ' + Math.round(e.node.dataset.fit * 100) + '%'), left: audit(0) };
  return window.Show.fitReport;
}

/* ---------- frame callbacks ---------- */
const frames = [];
const onFrame = fn => frames.push(fn);

/* ---------- audio transport ---------- */
const A = {};
let playing = false, tNow = STATIC_T ?? 0, anchor = null, rate = 1, dirty = true, started = false;
let ctx = null; const G = {}; const vol = { voice: 1, music: 1, sfx: 1 };
function graph() {
  if (ctx || !(window.AudioContext || window.webkitAudioContext)) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .002; lim.release.value = .15;
    lim.connect(ctx.destination);
    for (const k in A) { const src = ctx.createMediaElementSource(A[k]); G[k] = ctx.createGain(); G[k].gain.value = vol[k]; src.connect(G[k]).connect(lim); }
  } catch (e) { ctx = null; }
}
function setVol(k, v) { vol[k] = v; if (ctx && G[k]) G[k].gain.setTargetAtTime(v, ctx.currentTime, .06); else if (A[k]) { A[k].muted = v === 0; try { A[k].volume = v; } catch (e) {} } dirty = true; }
function play() {
  if (STATIC_T != null) return;
  if (!silent) { graph(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
  if (tNow >= TL.duration - .05) seek(0);
  for (const k in A) { A[k].playbackRate = rate; if (Math.abs(A[k].currentTime - tNow) > .05) A[k].currentTime = tNow; const p = A[k].play(); if (p && p.catch) p.catch(() => {}); }
  playing = true; started = true; anchor = null; document.body.classList.add('playing'); document.body.classList.remove('idle-start', 'ended');
}
function pause() { for (const k in A) A[k].pause(); playing = false; document.body.classList.remove('playing'); dirty = true; }
function seek(t) { tNow = clamp(t, 0, TL.duration); for (const k in A) { try { A[k].currentTime = tNow; } catch (e) {} } anchor = null; dirty = true; document.body.classList.toggle('ended', false); }
function setRate(r) { rate = r; for (const k in A) A[k].playbackRate = r; anchor = null; }
let lastSync = 0;
function clock() {
  if (!playing) return tNow;
  if (silent) {                                       // no voice to follow: count seconds ourselves
    const p = performance.now(); if (!anchor) anchor = { t: tNow, p };
    tNow = Math.min(TL.duration, anchor.t + (p - anchor.p) / 1000 * rate);
    if (tNow >= TL.duration - .02) { pause(); tNow = TL.duration; document.body.classList.add('ended'); }
    return tNow;
  }
  const a = A.voice.currentTime, p = performance.now();
  if (!anchor || Math.abs(anchor.t + (p - anchor.p) / 1000 * rate - a) > .09) anchor = { t: a, p };
  tNow = Math.min(TL.duration, anchor.t + (p - anchor.p) / 1000 * rate);
  if (p - lastSync > 700) {                          // keep the other stems on the narration's clock
    lastSync = p;
    for (const k of ['music', 'sfx']) if (A[k] && !A[k].paused && Math.abs(A[k].currentTime - a) > .12) A[k].currentTime = a;
  }
  if (A.voice.ended || tNow >= TL.duration - .02) { pause(); tNow = TL.duration; document.body.classList.add('ended'); }
  return tNow;
}
function loop() {
  const now = clock(), t = (!started && STATIC_T == null && window.Show.posterT != null) ? window.Show.posterT : now;   // before the first play, hold the title frame
  requestAnimationFrame(loop);                          // ask for the next frame first, so one bad frame can never stop the film
  if (playing || dirty) { dirty = false; try { renderEls(t); for (const f of frames) f(t); } catch (e) { if (!loop.warned) { loop.warned = true; console.error(e); } } }
}

/* ---------- boot ---------- */
function boot() {
  for (const k of ['voice', 'music', 'sfx']) { const a = $('#a-' + k); if (a && !silent) A[k] = a; }
  const drop = k => { const was = playing; delete A[k]; if (k === 'voice') { for (const j in A) { A[j].pause(); delete A[j]; } silent = true; anchor = null; document.body.classList.add('silent'); if (was) play(); } };
  for (const k in A) { A[k].addEventListener('error', () => drop(k)); if (A[k].error) drop(k); }      // a stem that is not there is left out; without the voice the film runs silent
  if (!A.voice) { silent = true; for (const j in A) delete A[j]; }
  if (silent) document.body.classList.add('silent');
  if (STATIC_T != null) { for (const k in A) delete A[k]; document.body.classList.remove('idle-start'); if (qs.has('clean')) document.body.classList.add('clean'); }
  // every [data-in] inside a chapter block defaults to that chapter's span
  $$('[data-ch]').forEach(block => {
    const i = TL.chapters.findIndex(c => c.id === block.dataset.ch), ch = TL.chapters[i], next = TL.chapters[i + 1];
    if (!ch) { asking = `data-ch="${block.dataset.ch}"`; miss('chapter', '@' + block.dataset.ch); asking = ''; }      // its elements then default to the whole film
    const defIn = ch ? ch.start - .2 : 0, defOut = !ch ? TL.duration + 99 : next ? next.start - .55 : TL.duration + 99;
    $$('.h', block).forEach(n => register(n, defIn, defOut));
  });
  $$('.h').forEach(n => { if (!els.some(e => e.node === n)) register(n, 0, TL.duration + 99); });
  $$('[data-on]').forEach(n => { asking = `data-on on "${n.textContent.trim().slice(0, 30)}"`; onNodes.push({ el: n, t: at(n.dataset.on) }); asking = ''; });
  window.addEventListener('resize', () => { dirty = true; });
  const fonts = (window.Show.config && window.Show.config.fonts) || [];      // the faces the layout is measured in; the film waits for them
  const ready = document.fonts ? Promise.all(fonts.map(f => document.fonts.load(f).catch(() => {}))).then(() => document.fonts.ready) : Promise.resolve();
  let begun = false; const begin = () => { fitLayout(); if (begun) { dirty = true; return; } begun = true; document.body.classList.add('ready'); dirty = true; requestAnimationFrame(loop); };
  Promise.race([ready, new Promise(r => setTimeout(r, 8000))]).then(begin);
  ready.then(begin);                                   // if the fonts arrive after the wait, measure again with the real ones
}

window.Show = { TL, C, $, $$, clamp, lerp, E, at, prog, between, kf, mix, hex, rnd, onFrame, play, pause, seek, setRate, setVol, vol,
  get t() { return tNow; }, get playing() { return playing; }, get started() { return started; }, get rate() { return rate; },
  get silent() { return silent; }, get unknown() { return Array.from(unknown, ([name, u]) => [name, u.where, u.n]); }, STATIC_T, boot, audit, fitLayout, touch() { dirty = true; }, config: {} };
})();
