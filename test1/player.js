/* player.js — the shell every presentation shares: the picture fitted to any window, the console (transport,
   captions, chapters), the start, end and credits screens, keys and touch. Kit code: a show does not edit this.
   A show supplies window.World (world.js), its own frame callbacks and Show.config (scenes.js), and then
   calls Show.start().

   Show.config = {
     fonts:    ['900 80px Besley', ...]   faces the layout is measured in; the film waits for them (engine.js)
     posterAt: 'title+2.5'                the frame held behind the start button before the first play
     poster:   { x, y, floor, keepClear } start button: its corner in the 1920×960 frame, the lowest it may reach,
                                          and [x1, y1, x2, y2] boxes of the title frame it must not cover
     ground:   700                        the horizon in frame units; on an upright phone the start card sits below it
     endAt:    'yours+2'                  when the end card comes up
     readout:  { label: 'year', keys: [['cue', 1945], ...] }   the rolling four-digit counter in the console (optional)
     over:     (ctx, t, view) => {}       drawn on the canvas over the world each frame: scrims, a fade from black
   } */
(function () {
'use strict';
const S = window.Show, { TL, C, $, $$, clamp, lerp, E, at, prog, kf } = S;

/* ---------- fit: the picture fills the window; the type sits in a 1920×960 safe frame at its centre ----------
   Nothing is letterboxed and nothing is turned. A taller window shows more sky and more ground, a wider one more of
   the world either side. When the window is too small for the designed console to be read or touched (a phone, a
   small tablet), the console is laid out again in real pixels and the start and end screens stop shrinking. */
const fitEl = $('#fit'), frame = $('#frame'), cv = $('#world'), ctx = cv.getContext('2d'), stage = $('#stage'), con = $('#console'), conBg = $('#console-bg'), grain = $('#grain'), over = $('#overlays'), poster = $('#poster'), endEl = $('#endcard'), B = document.body.classList;
let cam = { x: 0, y: 0, s: 1 }, VW = 1920, VH = 960, compact = false, layoutGen = 0;      // layoutGen: text fitted to a box is fitted again after the layout changes
const LABELS = { '#t-cc': ['Captions', 'CC'], '#t-present': ['Presenter', 'Present'], '#t-full': ['Full screen', 'Full'] };
const view = { canvas: cv, ctx, get cam() { return cam; }, get VW() { return VW; }, get VH() { return VH; }, get ox() { return (VW - 1920) / 2; }, get oy() { return (VH - 960) / 2; }, get k() { return cv.width / VW; } };
S.view = view;      // for scenes.js: the camera of the frame just drawn, and the canvas in frame units (the 1920×960 type frame starts at ox, oy)
/* The start button belongs where the show's config puts it (under the title, as a rule), above config.poster.floor
   and clear of every box in config.poster.keepClear: the parts of the title frame it must not cover. Where the
   picture is too small for that it takes the next arrangement that fits: closed up a little; on an upright phone, a
   card below the horizon (config.ground); the button alone (its line of small print moves to the caption strip),
   then with a one-word label; and last, a card kept on screen. */
function placePoster(w, ah, s, left, top, k) {
  const P = Object.assign({ x: 126, y: 452, floor: 642, keepClear: [] }, S.config.poster), G = S.config.ground == null ? 700 : S.config.ground;
  const x0 = left + P.x * s, y0 = top + P.y * s, ground = top + G * s, btn = poster.firstElementChild, narrow = B.contains('narrow');
  const setK = v => v == null ? poster.style.removeProperty('--k') : poster.style.setProperty('--k', v.toFixed(3));
  const clear = () => { const bot = y0 + poster.offsetHeight, right = x0 + poster.offsetWidth;
    return bot <= top + P.floor * s + .5 && !P.keepClear.some(([x1, y1, x2, y2]) => right > left + x1 * s && x0 < left + x2 * s && bot > top + y1 * s && y0 < top + y2 * s); };
  const closeUp = () => { for (let kk = k - .01; kk >= .385; kk -= .01) { setK(kk); if (clear()) return true; } return false; };
  const card = mustFit => {
    setK(null); B.add('postcard'); poster.style.left = '0px';
    for (let kk = k; kk > .3 && btn.offsetWidth > poster.clientWidth - 30; kk -= .01) setK(kk);      // a very narrow phone
    const pw = poster.offsetWidth, ph = poster.offsetHeight, y1 = ground + 14, room = ah - 10 - y1;
    if (mustFit && room < ph) { B.remove('postcard'); return false; }
    poster.style.left = Math.max(8, Math.min(x0, w - pw - 12)) + 'px';
    poster.style.top = Math.max(8, room >= ph ? y1 + (room - ph) * .36 : ah - ph - 8) + 'px'; return true;
  };
  const home = () => { setK(null); poster.style.left = x0 + 'px'; poster.style.top = y0 + 'px'; };
  B.remove('postcard', 'postbare', 'postshort'); home();
  if (!narrow && (clear() || closeUp())) return;
  if (narrow && card(true)) return;
  B.add('postbare'); home(); if (clear() || closeUp()) return;
  B.add('postshort'); home(); if (clear() || closeUp()) return;
  B.remove('postbare', 'postshort'); card(false);
}
/* The end card: as designed if it fits; if not, a little smaller, then without the portrait (wide and short) or
   closed up (narrow and short). After that it scrolls. */
function fitEnd(k) {
  B.remove('end-tight', 'end-short'); endEl.style.removeProperty('--e');
  const spills = () => endEl.scrollHeight > endEl.clientHeight + 1 || endEl.scrollWidth > endEl.clientWidth + 1;
  if (!spills()) return;
  if (B.contains('narrow')) { B.add('end-tight'); return; }
  for (let e = .96; e > .79; e -= .04) { endEl.style.setProperty('--e', (k * e).toFixed(4)); if (!spills()) return; }
  endEl.style.removeProperty('--e'); B.add('end-short');
}
function fit() {
  const w = fitEl.clientWidth, h = fitEl.clientHeight; if (!w || !h) return;
  frame.style.width = w + 'px'; frame.style.height = h + 'px';
  const s0 = Math.min(w / 1920, h / 1080); compact = s0 < .5;
  // the small-screen console is drawn in real pixels on a phone and a little larger on a tablet; upright, it stacks
  const upright = h > w, c = compact ? Math.max(1, Math.min(1.4, upright ? w / 560 : Math.min(w / 800, h / 420))) : 1, lw = w / c, stack = compact && (upright || lw < 620);
  B.toggle('compact', compact); B.toggle('stack', stack); B.toggle('narrow', compact && w < 620);
  const snug = compact && !stack && lw < 812;      // a smaller phone on its side: the captions need the room more than the clock does
  B.toggle('c-tight', compact && lw < 345); B.toggle('c-snug', snug); B.toggle('c-notime', snug || (compact && lw < 300));
  B.toggle('touch', !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
  for (const id in LABELS) $(id).textContent = LABELS[id][compact ? 1 : 0];
  let s = s0, ch = 120 * s0;
  if (compact) { con.style.width = lw + 'px'; con.style.transform = c > 1 ? `scale(${c})` : 'none'; ch = con.offsetHeight * c; s = Math.max(.05, Math.min(w / 1920, (h - ch) / 960)); } else con.style.width = '';
  const ah = h - ch, left = (w - 1920 * s) / 2, top = (ah - 960 * s) / 2, k = Math.max(s, .46);
  B.toggle('short', compact && !stack && ah < 420);
  stage.style.transform = `translate(${left}px,${top}px) scale(${s})`;
  con.style.top = compact ? ah + 'px' : '0';
  if (!compact) { con.style.transform = `translate(${left}px,${ah}px) scale(${s})`; conBg.style.top = Math.floor(ah) + 'px'; conBg.style.height = Math.ceil(ch + 1) + 'px'; }
  frame.style.setProperty('--ah', ah + 'px'); frame.style.setProperty('--c', c.toFixed(4)); over.style.height = ah + 'px'; over.style.setProperty('--k', k.toFixed(4));
  placePoster(w, ah, s, left, top, k); fitEnd(k);
  VW = w / s; VH = ah / s;
  const q = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4.4e6 / (w * ah)));      // sharp, but never more pixels than a laptop can repaint at speed
  cv.style.width = w + 'px'; cv.style.height = ah + 'px';
  const cw = Math.round(w * q), chh = Math.round(ah * q); if (cv.width !== cw || cv.height !== chh) { cv.width = cw; cv.height = chh; }
  grain.style.height = ah + 'px';
  layoutGen++; S.touch();
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => { fit(); setTimeout(fit, 120); setTimeout(fit, 450); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
if (window.ResizeObserver) new ResizeObserver(fit).observe(fitEl);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);      // the start and end screens are measured, so measure again in the real faces
(function watchDensity() { if (!window.matchMedia) return; const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); const on = () => { fit(); watchDensity(); }; if (mq.addEventListener) mq.addEventListener('change', on, { once: true }); })();
fit();

/* ---------- the picture: the show's world, then whatever the show lays over it ---------- */
S.onFrame(t => { cam = window.World.draw(ctx, t, cv.width / VW, VW, VH) || cam; if (S.config.over) S.config.over(ctx, t, view); });


/* ---------- the readout in the console: a four-digit counter that rolls like an odometer (a year, as a rule) ---------- */
const cols = $$('.odo-digits span').map(sp => { const b = document.createElement('b'); b.textContent = '0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n0'; sp.appendChild(b); return b; });
let readKeys = null;
S.onFrame(t => {
  if (!readKeys) return;
  const v = kf(t, readKeys, E.io);
  for (let i = 0; i < 4; i++) {
    const place = 3 - i, base = Math.floor(v / Math.pow(10, place)) % 10;
    const unit = Math.pow(10, place), roll = place === 0 ? v % 1 : Math.max(0, v % unit - (unit - 1));   // a wheel only turns while every wheel to its right passes 9
    cols[i].style.transform = `translate3d(0,${-(base + roll) * 52}px,0)`;
  }
});

/* ---------- captions ---------- */
const chunks = [];
for (const line of TL.lines) {
  let cur = [], len = 0;
  line.words.forEach((w, i) => {
    cur.push(w); len += w.d.length + 1;
    const hard = /[.?!]$/.test(w.d), soft = /[,:;—]$/.test(w.d), last = i === line.words.length - 1;
    if (last || (hard && len > 22) || (soft && len > 44) || len > 66) { chunks.push({ spk: line.spk, words: cur, s: cur[0].s, e: cur[cur.length - 1].e }); cur = []; len = 0; }
  });
}
const cap = $('#cap'), SPEAKERS = Object.keys(TL.voices || {}); let capIdx = -2, capSpans = [], capGen = -1;      // the first speaker's captions are plain, every other speaker's are tinted
S.onFrame(t => {
  let idx = -1; for (let i = 0; i < chunks.length; i++) { if (chunks[i].s - .1 <= t) idx = i; else break; }
  if (idx >= 0 && t > chunks[idx].e + 1.3) idx = -1;
  if (!S.started && S.STATIC_T == null) idx = -1;      // the title frame is borrowed from later in the film: no caption until it plays
  if (idx !== capIdx || capGen !== layoutGen) {
    capIdx = idx; capGen = layoutGen; cap.textContent = ''; capSpans = [];
    if (idx >= 0) {
      const d = document.createElement('div'); chunks[idx].words.forEach(w => { const sp = document.createElement('span'); sp.textContent = w.d + ' '; d.appendChild(sp); capSpans.push([sp, w.s]); }); cap.appendChild(d); cap.className = SPEAKERS.indexOf(chunks[idx].spk) > 0 ? 'm' : '';
      cap.style.fontSize = ''; const base = parseFloat(getComputedStyle(cap).fontSize), room = cap.clientHeight - 2;      // a caption never outgrows its two lines
      for (const f of [.88, .78, .68]) { if (d.offsetHeight <= room) break; cap.style.fontSize = (base * f) + 'px'; }
    }
  }
  for (const [sp, s] of capSpans) sp.classList.toggle('said', t >= s - .04);
});

/* ---------- transport: bar, chapters, time, end card ---------- */
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const bar = $('#bar'), fill = $('#bar-fill'), ticks = $('#bar-ticks'), tip = $('#bar-tip'), chapN = $('#chap-n'), chapT = $('#chap-t'), timeEl = $('#time'), list = $('#chaplist');
TL.chapters.forEach((c, i) => {
  if (i) { const tk = document.createElement('i'); tk.style.left = (c.start - .7) / TL.duration * 100 + '%'; ticks.appendChild(tk); }
  const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<i>${i + 1}</i>${c.title}<em>${fmt(Math.max(0, c.start - .7))}</em>`;
  b.addEventListener('click', () => { goChapter(i); list.hidden = true; }); list.appendChild(b);
});
const chapterAt = t => { let i = 0; TL.chapters.forEach((c, j) => { if (t >= c.start - .75) i = j; }); return i; };
function goChapter(i) { i = clamp(i, 0, TL.chapters.length - 1); S.seek(i === 0 ? 0 : TL.chapters[i].start - .7); if (!S.started) S.play(); }
let lastT = 0, lastChap = -1, chapGen = -1, presenter = false, endT = TL.duration - 2;
const textFits = n => {      // measured to a fraction of a pixel: scrollWidth rounds, and a title 0.4px too wide is cut with an ellipsis
  const r = document.createRange(); r.selectNodeContents(n); const box = n.getBoundingClientRect();
  if (getComputedStyle(n).whiteSpace === 'nowrap') return r.getBoundingClientRect().width <= box.width + .05;
  const rects = [...r.getClientRects()]; return new Set(rects.map(q => Math.round(q.top))).size <= 2 && rects.every(q => q.right <= box.right + .05);      // where it may wrap: two lines at most
};
const STOPS = TL.chapters.slice(1).map(c => c.start - .75);
let saidSilent = false;
S.onFrame(t => {
  if (S.started && S.silent && !saidSilent) { saidSilent = true; toast(TL.draft ? 'Draft timing: no sound yet' : 'No sound: the narration file is missing', 3200); }
  if (!S.started && S.STATIC_T == null) t = 0;       // the poster frame is borrowed from later in the film; the transport still reads 0:00
  fill.style.width = (t / TL.duration * 100) + '%'; timeEl.textContent = fmt(t) + ' / ' + fmt(TL.duration);
  const i = chapterAt(t);
  if (i !== lastChap || chapGen !== layoutGen) { lastChap = i; chapGen = layoutGen; chapN.textContent = `${i + 1} of ${TL.chapters.length}`; chapT.textContent = TL.chapters[i].title;
    chapT.style.fontSize = ''; const cbase = parseFloat(getComputedStyle(chapT).fontSize); for (const f of [.88, .78, .68]) { if (textFits(chapT)) break; chapT.style.fontSize = (cbase * f) + 'px'; } $$('button', list).forEach((b, j) => b.classList.toggle('cur', j === i)); }
  document.body.classList.toggle('show-end', t >= endT);
  if (presenter && S.playing) for (const st of STOPS) if (lastT < st && t >= st) { S.pause(); S.seek(st + .02); toast(`Next: ${TL.chapters[chapterAt(st + .1)].title}. Space to go on.`, 4000); }
  lastT = t;
});
const barT = e => { const r = bar.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) * TL.duration; };
let dragging = false;
bar.addEventListener('pointerdown', e => { dragging = true; bar.setPointerCapture(e.pointerId); S.seek(barT(e)); });
bar.addEventListener('pointermove', e => { const t = barT(e); if (dragging) S.seek(t); tip.style.display = 'block'; tip.style.left = (t / TL.duration * 100) + '%'; tip.textContent = fmt(t) + '  ' + TL.chapters[chapterAt(t)].title; });
bar.addEventListener('pointerup', () => { dragging = false; });
bar.addEventListener('pointerleave', () => { if (!dragging) tip.style.display = 'none'; });
bar.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { S.seek(S.t + 5); e.stopPropagation(); } if (e.key === 'ArrowLeft') { S.seek(S.t - 5); e.stopPropagation(); } });

const toastEl = $('#toast'); let toastTimer = 0;
function toast(msg, ms = 2200) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms); }
const toggle = () => { S.playing ? S.pause() : S.play(); };
$('#btn-play').addEventListener('click', toggle);
$('#poster-play').addEventListener('click', e => { e.stopPropagation(); S.play(); });
$('#again').addEventListener('click', () => { S.seek(0); S.play(); });
$('#chap').addEventListener('click', e => { e.stopPropagation(); list.hidden = !list.hidden; });
const tapPicture = () => { if (!list.hidden) { list.hidden = true; return; } toggle(); };      // before the first play, a tap on the picture starts it, as it would a video
$('#hud').addEventListener('click', tapPicture); cv.addEventListener('click', tapPicture);      // anywhere on the picture, including the sky and rock around the frame
$('#open-credits').addEventListener('click', () => { $('#credits').hidden = false; });
$('#close-credits').addEventListener('click', () => { $('#credits').hidden = true; });

const tCC = $('#t-cc'), tMusic = $('#t-music'), tPres = $('#t-present'), tSpeed = $('#t-speed'), tFull = $('#t-full');
function setCC(on) { document.body.classList.toggle('no-cc', !on); tCC.classList.toggle('on', on); }
function setMusic(on) { S.setVol('music', on ? 1 : 0); S.setVol('sfx', on ? 1 : 0); tMusic.classList.toggle('on', on); toast(on ? 'Music and effects on' : 'Music and effects off'); }
function setPresenter(on) { presenter = on; S.setVol('voice', on ? 0 : 1); tPres.classList.toggle('on', on); if (on) setCC(true); toast(on ? 'Presenter mode: narration off, pauses after each chapter' : 'Presenter mode off', 3200); }
const SPEEDS = [1, 1.25, 1.5, .75];
function cycleSpeed() { const r = SPEEDS[(SPEEDS.indexOf(S.rate) + 1) % SPEEDS.length]; S.setRate(r); tSpeed.textContent = r + '×'; tSpeed.classList.toggle('on', r !== 1); }
function fullscreen() { const el = $('#fit'), go = el.requestFullscreen || el.webkitRequestFullscreen; if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else if (go) go.call(el); }
tCC.addEventListener('click', () => setCC(document.body.classList.contains('no-cc')));
tMusic.addEventListener('click', () => setMusic(!tMusic.classList.contains('on')));
tPres.addEventListener('click', () => setPresenter(!presenter));
tSpeed.addEventListener('click', cycleSpeed); tFull.addEventListener('click', fullscreen);
if (!(fitEl.requestFullscreen || fitEl.webkitRequestFullscreen)) tFull.style.display = 'none';      // iPhones cannot put a page full screen; do not offer it
document.addEventListener('fullscreenchange', () => { tFull.classList.toggle('on', !!document.fullscreenElement); fit(); });

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase(), i = chapterAt(S.t);
  if (key === ' ' || key === 'k') { if (key === ' ' && e.target.tagName === 'BUTTON') return; e.preventDefault(); toggle(); }
  else if (key === 'arrowright') S.seek(S.t + 5);
  else if (key === 'arrowleft') S.seek(S.t - 5);
  else if (key === 'arrowdown' || key === 'pagedown' || key === ']' || key === 'n') { e.preventDefault(); goChapter(i + 1); }
  else if (key === 'arrowup' || key === 'pageup' || key === '[') { e.preventDefault(); goChapter(S.t - (i ? TL.chapters[i].start - .7 : 0) > 2.5 ? i : i - 1); }
  else if (key >= '1' && key <= '9') goChapter(parseInt(key, 10) - 1);
  else if (key === 'home' || key === '0') S.seek(0);
  else if (key === 'c') setCC(document.body.classList.contains('no-cc'));
  else if (key === 'b') setMusic(!tMusic.classList.contains('on'));
  else if (key === 'p') setPresenter(!presenter);
  else if (key === 's') cycleSpeed();
  else if (key === 'f') fullscreen();
  else if (key === 'escape') { list.hidden = true; $('#credits').hidden = true; }
});
let idleTimer = 0;
const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => document.body.classList.add('idle'), 2600); };
document.addEventListener('click', e => { const b = e.detail > 0 && e.target.closest('button'); if (b) b.blur(); });   // after a mouse click, Space goes back to play and pause
document.addEventListener('pointermove', wake); document.addEventListener('pointerdown', wake); document.addEventListener('keydown', wake); wake();


/* ---------- start: called by the show once its config and frame callbacks are in place ---------- */
S.start = function () {
  const cfg = S.config;
  endT = cfg.endAt != null ? at(cfg.endAt) : TL.duration - 2;
  if (cfg.readout) { readKeys = cfg.readout.keys.map(([a, v]) => [at(a), v]); $('#odo small').textContent = cfg.readout.label || ''; } else B.add('no-readout');
  if (!$('#endcard figure')) B.add('no-figure');
  S.posterT = cfg.posterAt != null ? at(cfg.posterAt) : null;
  const small = $('#poster p'); if (small) cap.dataset.idle = small.textContent;      // shown in the caption strip when the start button stands alone
  if (S.silent || TL.draft) B.add('silent');
  fit(); S.boot();
  if (new URLSearchParams(location.search).has('grid')) {      // ?grid=1: the 1920×960 type frame, ruled every 100 units, for placing type and the start button
    let lines = '', labels = '';
    for (let x = 0; x <= 1920; x += 100) { lines += `<line x1="${x}" y1="0" x2="${x}" y2="960"/>`; labels += `<text x="${x + 5}" y="16">${x}</text>`; }
    for (let y = 100; y <= 960; y += 100) { lines += `<line x1="0" y1="${y}" x2="1920" y2="${y}"/>`; labels += `<text x="5" y="${y - 5}">${y}</text>`; }
    $('#stage').insertAdjacentHTML('beforeend', `<svg viewBox="0 0 1920 960" style="position:absolute;left:0;top:0;width:1920px;height:960px;pointer-events:none"><g stroke="rgba(255,0,90,.6)" stroke-width="1.5">${lines}</g><g font-family="sans-serif" font-size="15" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${labels}</g></svg>`);
  }
  if (S.unknown.length && S.STATIC_T == null) {                // a draft that still names cues the script does not have
    const b = document.createElement('div'); b.id = 'draft-note';
    b.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;max-width:min(560px,92vw);background:#7A1F12;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:6px';
    b.textContent = `Draft: ${S.unknown.length} name(s) used here are not in the script (${S.unknown.slice(0, 6).map(u => u[0]).join(', ')}${S.unknown.length > 6 ? ', …' : ''}). Those moments play at mid-film until fixed. List them: node tests/cues.js <show>`;
    document.body.appendChild(b);
  }
};
})();
