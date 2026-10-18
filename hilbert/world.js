/* world.js — the drawn world of The Infinite Hotel. One continuous place at night: a lobby under a neon sign, and
   to its right a row of numbered rooms that never ends, a car park in front of it that never ends either, and the
   guests, who are moved about by arithmetic. Painted on a canvas each frame as a function of time.

   The camera is { x, y, s }: the world point at the centre of the type frame, and the zoom. A world point (wx, wy)
   lands in the frame at ((wx - x) * s + 960, (wy - y) * s + 480).

   Rooms: room n has its door centred at DX(n) = D0 + (n - 1) * DW, for every n >= 1; doors are drawn for whatever
   is in view, so the row has no end. Buses park in rows below the walkway, row r at ROW_Y(r), for every r >= 0. */
(function () {
'use strict';
const S = window.Show, { clamp, lerp, E, at, prog, kf, mix, rnd } = S;
const SW = 1920, SH = 960, GY = 700;                  // the type frame, and the ground line inside it
let W = SW, H = SH, CX = SW / 2, CY = SH / 2, OX = 0;
const K = { ink: '#0B0D22', cream: '#F6F0E2', gold: '#FFD166', pink: '#FF4D7E', teal: '#3DE0D0', wall: '#3A2F6E', wallD: '#2A2152', roof: '#1C1740',
  door: '#151233', walk: '#57508A', road: '#1B1B33', line: '#8D88B8', lamp: '#FFDF8A', box: '#0D0B26' };
const GUEST = ['#FF9F5A', '#F2C94C', '#FF7A7A', '#E8A0FF', '#FFB86B', '#F78FB3', '#F6E58D', '#FF8C69'];      // the residents: warm
const BUSC = ['#3DE0D0', '#7CF29A', '#6FB7FF', '#C59BFF', '#FF8FD0', '#9BE8FF', '#B8F26F', '#FFA8A8'];       // bus 0 (the first), then the prime buses
const PR = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];                           // bus j (j >= 1) carries prime PR[j - 1]

const D0 = 2100, DW = 220, DX = n => D0 + (n - 1) * DW;
const ROOF = GY - 330, LOBBY_X0 = 1120, LOBBY_X1 = 1930;
const ROW0 = GY + 110, ROWH = 230, ROW_Y = r => ROW0 + r * ROWH, BUS_H = 150;

/* ---- camera: [from, until, where, easing]. Between rows the last "where" holds. ---- */
const hold = (x, y, s, from, dx = 5) => t => ({ x: x + Math.min(60, Math.max(0, t - at(from)) * dx), y, s });      // a held shot, never quite still
const OPENING = hold(960, 400, 1, 0, 4);
const MOVES = [
  ['wait+0.2', 'infinite+2.2', hold(3900, 300, .5, 'infinite+2.2')],                 // the pull-back: the row of rooms
  ['allfull-0.3', 'every', hold(3000, 420, .8, 'every')],                            // rooms 1 to 9, close
  ['busq', 'bus+1.4', hold(3400, 560, .6, 'bus+1.4')],                               // room for the bus
  ['worse', 'lot+1.2', hold(3830, 620, .5, 'lot+1.2', 2)],                           // rooms 1 to 16, and four rows of the car park
  ['beat', 'last+1', hold(3100, 440, .8, 'last+1')],                                 // back to the front of the hotel
  ['hilbert-0.3', 'show+1.5', hold(3000, 240, .42, 'show+1.5', 8)],                  // the long last look
].map(m => ({ t0: at(m[0]), t1: at(m[1]), to: m[2], e: m[3] || E.io }));
function camera(t) {
  let c = OPENING(t);
  for (let i = 0; i < MOVES.length; i++) {
    const m = MOVES[i]; if (t <= m.t0) break;
    const hd = i + 1 < MOVES.length ? Math.min(t, MOVES[i + 1].t0) : t;
    const to = typeof m.to === 'function' ? m.to(hd) : m.to, p = m.e(clamp((t - m.t0) / (m.t1 - m.t0)));
    c = { x: lerp(c.x, to.x, p), y: lerp(c.y, to.y, p), s: Math.exp(lerp(Math.log(c.s), Math.log(to.s), p)) };
  }
  return c;
}

/* ---- sky: deep night, then the first of the dawn in the last chapter ---- */
const dawn = t => kf(t, [[at('hilbert'), 0], [at('@end'), 1]], E.io);
function sky(t) { const d = dawn(t); return { d, top: mix('#070920', '#1B1F52', d), bot: mix('#2A1F5C', '#E8845E', d) }; }

if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
  r = Math.min(typeof r === 'number' ? r : (r && r[0]) || 0, Math.abs(w) / 2, Math.abs(h) / 2);
  this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
};

/* ---- small drawing helpers (world units) ---- */
let g;
const rect = (x, y, w, h, f) => { g.fillStyle = f; g.fillRect(x, y, w, h); };
const circ = (x, y, r, f) => { g.fillStyle = f; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const rrect = (x, y, w, h, r, f) => { g.fillStyle = f; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
const text = (s, x, y, font, f, align = 'center') => { g.font = font; g.fillStyle = f; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`; };
function neon(s, x, y, font, colour, on, align = 'center') {      // lettering that glows; "on" is 0 to 1
  text(s, x, y, font, rgba(colour, .16), align);
  if (on <= .02) return;
  g.save(); g.shadowColor = colour; g.shadowBlur = 34; text(s, x, y, font, rgba(colour, on), align); g.shadowBlur = 10; text(s, x, y, font, rgba('#FFFFFF', .5 * on), align); g.restore();
}
/* a neon tube's flicker: mostly on, with a stutter now and then. Repeatable: a function of t alone. */
const buzz = (t, salt) => { const r = rnd(Math.floor(t * 9), salt); return r > .95 ? .4 : r > .92 ? .75 : 1; };

/* ---- people. A guest is a small round person; they bob. ---- */
function person(x, y, colour, t, i, a = 1) {
  if (a <= .01) return;
  const bob = Math.sin(t * 2.1 + i * 1.9) * 3;
  g.globalAlpha = a;
  rrect(x - 30, y - 84 + bob, 60, 84 - bob, 24, colour);
  circ(x, y - 104 + bob, 25, colour);
  circ(x - 9, y - 108 + bob, 3.6, K.ink); circ(x + 9, y - 108 + bob, 3.6, K.ink);
  g.globalAlpha = 1;
}
function traveller(x, y, t, walking) {               // you: gold, with a suitcase
  const step = walking ? Math.abs(Math.sin(t * 9)) * 7 : 0;
  rrect(x + 34, y - 46, 40, 42, 6, '#B5651D'); rect(x + 46, y - 56, 16, 10, '#7A4310');
  person(x, y - step, K.gold, t, 99);
}

/* ---- where everyone is. Rooms are positions on a line; a guest between two rooms is on their way. ----
   p1: everybody one room up.   p2: everybody to double their number.   p4: everybody to 2 to the power of it. */
const P1 = t => prog(t, 'moves', 2.2, E.io), P2 = t => prog(t, 'dbl', 3.2, E.io), P4 = t => prog(t, 'two', 2.6, E.io);
const YOU_IN = () => at('free+1.6');
const pow2 = q => q > 20 ? 2e6 : Math.pow(2, q);
function guests(t, vx0, vx1) {
  const nMax = Math.ceil((vx1 - D0) / DW) + 2, p1 = P1(t), p2 = P2(t), p4 = P4(t), busIn = at('busin');
  const y = GY + 34;
  const put = (room, colour, i, a = 1, dy = 0) => { const x = DX(room); if (x > vx0 - 80 && x < vx1 + 80) person(x, y + dy, colour, t, i, a); };
  /* the residents (i = the room they started in) and you (i = 0, in room 1 once you have checked in) */
  for (let i = 0; i <= nMax; i++) {
    if (i === 0 && t < YOU_IN()) continue;
    const r1 = i === 0 ? 1 : i + p1;                  // after "one room up"
    const r2 = r1 * (1 + p2);                         // after doubling
    const r3 = p4 > 0 ? lerp(r2, pow2(Math.round(r2)), p4) : r2;
    put(r3, i === 0 ? K.gold : GUEST[i % GUEST.length], i);
  }
  /* the first bus: passenger k takes room 2k - 1, then moves on with everyone else */
  if (t >= busIn) for (let k = 1; 2 * k - 1 <= nMax; k++) {
    const q = 2 * k - 1, a = prog(t, busIn + Math.min(k, 12) * .09, .5, E.out), r3 = p4 > 0 ? lerp(q, pow2(q), p4) : q;
    put(r3, BUSC[0], 200 + k, a, (1 - a) * (ROW_Y(0) - GY));
  }
  /* the prime buses: bus j seat m takes room PR[j-1] to the power m */
  for (let j = 1; j <= PR.length; j++) {
    const p = PR[j - 1], t0 = j === 1 ? at('three') : j === 2 ? at('five') : at('clash-0.5') + (j - 3) * .14;
    if (t < t0) break;
    for (let m = 1, room = p; room <= nMax; m++, room *= p) {
      const a = prog(t, t0 + (m - 1) * .25, .7, E.out);
      put(room, BUSC[j % BUSC.length], 400 + j * 7 + m, a, (1 - a) * (ROW_Y(Math.min(j, 3)) - GY));
    }
  }
}

/* ---- the hotel ---- */
function lobby(t) {
  const sx = (LOBBY_X0 + LOBBY_X1) / 2, top = GY - 400;
  rect(LOBBY_X0, top, LOBBY_X1 - LOBBY_X0, 400, K.wallD); rect(LOBBY_X0 - 20, top - 20, LOBBY_X1 - LOBBY_X0 + 40, 26, K.roof);
  /* the sign on the roof */
  rect(sx - 330, 240, 14, 46, K.roof); rect(sx + 316, 240, 14, 46, K.roof);
  rrect(sx - 370, -20, 740, 270, 18, K.box); g.strokeStyle = '#2B2560'; g.lineWidth = 6; g.beginPath(); g.roundRect(sx - 370, -20, 740, 270, 18); g.stroke();
  neon("HILBERT'S", sx, 70, 'italic 500 116px Fraunces', K.teal, buzz(t, 3));
  const full = t < at('free') || t > at('enjoy+2.5') ? 1 : 0;      // the NO goes out while there is a room going
  neon('NO', sx - 252, 178, '700 92px "Space Grotesk"', K.pink, full * buzz(t, 5));
  neon('VACANCY', sx + 82, 178, '700 92px "Space Grotesk"', K.pink, buzz(t, 7) > .5 ? 1 : .85);
  /* two windows, the door and its awning */
  rect(sx - 300, GY - 290, 170, 180, mix('#F6C861', '#FFDF8A', .5 + .5 * Math.sin(t * 1.3))); rect(sx - 218, GY - 290, 6, 180, K.wallD); rect(sx - 300, GY - 203, 170, 6, K.wallD);
  rect(sx + 130, GY - 290, 170, 180, '#F6C861'); rect(sx + 212, GY - 290, 6, 180, K.wallD); rect(sx + 130, GY - 203, 170, 6, K.wallD);
  rect(sx - 70, GY - 230, 140, 230, '#F9E3A6'); rect(sx - 3, GY - 230, 6, 230, K.wallD);
  g.fillStyle = K.pink; g.beginPath(); g.moveTo(sx - 120, GY - 290); g.lineTo(sx + 120, GY - 290); g.lineTo(sx + 150, GY - 232); g.lineTo(sx - 150, GY - 232); g.closePath(); g.fill();
  text('RECEPTION', sx, GY - 260, '700 30px "Space Grotesk"', K.cream);
  circ(sx, GY - 120, 200, 'rgba(249,227,166,.07)');
}
function rooms(t, z, vx0, vx1) {
  const x0 = Math.max(LOBBY_X1, vx0);
  rect(x0, ROOF, vx1 - x0, 330, K.wall); rect(x0, ROOF - 24, vx1 - x0, 30, K.roof); rect(x0, ROOF + 6, vx1 - x0, 8, K.pink);
  const n0 = Math.max(1, Math.floor((vx0 - D0) / DW)), n1 = Math.ceil((vx1 - D0) / DW) + 1;
  const six = prog(t, 'six', .5, E.out) * (1 - prog(t, 'beat', .6));
  for (let n = n0; n <= n1; n++) {
    const x = DX(n), fl = .82 + .18 * Math.sin(t * 1.7 + n * 2.3), hot = n === 6 ? six : 0;
    circ(x, GY - 252, 64, rgba(K.lamp, .10 * fl));                       // each door has a lamp, and each lamp wavers
    rrect(x - 58, GY - 196, 116, 196, 8, K.door); circ(x + 36, GY - 96, 6, K.gold);
    rrect(x - 56, GY - 292, 112, 72, 10, hot ? mix(K.box, K.teal, hot) : K.box);
    if (z > .3) text(String(n), x, GY - 254, `700 ${n > 99 ? 44 : 58}px "Space Grotesk"`, hot ? mix(K.lamp, K.ink, hot) : K.lamp);
    if (hot) { g.strokeStyle = rgba(K.teal, hot * (.7 + .3 * Math.sin(t * 5))); g.lineWidth = 10; g.beginPath(); g.roundRect(x - 92, GY - 316, 184, 344, 22); g.stroke(); }
  }
  /* a second sign, far along the roof */
  rect(4470, ROOF - 60, 12, 40, K.roof); rect(5100, ROOF - 60, 12, 40, K.roof);
  neon('MORE ROOMS', 4790, ROOF - 110, '700 120px "Space Grotesk"', K.gold, buzz(t, 11));
  neon('→', 5270, ROOF - 112, '700 120px "Space Grotesk"', K.gold, Math.sin(t * 4) > -.3 ? 1 : .15);
}
function ground(t, z, vx0, vx1, vy1) {
  const vw = vx1 - vx0;
  rect(vx0, GY, vw, 60, K.walk); rect(vx0, GY + 56, vw, 8, '#2E2A58');
  rect(vx0, GY + 64, vw, Math.max(0, vy1 - GY - 64) + 2, K.road);
  if (z > .25) {                                      // the bays of a car park that goes on down, marked for as far as anyone looks
    g.strokeStyle = rgba(K.line, .28); g.lineWidth = 5; g.setLineDash([60, 44]);
    for (let r = 0; ROW_Y(r) - 40 < vy1; r++) { const y = ROW_Y(r) + BUS_H + 40; g.beginPath(); g.moveTo(Math.floor(vx0 / 104) * 104, y); g.lineTo(vx1, y); g.stroke(); }
    g.setLineDash([]);
  }
}
/* a bus, front at fx, as long as it needs to be: it runs off the right of anything */
function bus(fx, y, colour, label, vx1, t, row, emptied) {
  if (fx > vx1) return;
  const w = vx1 - fx + 40;
  rrect(fx, y, w, BUS_H, 26, colour); rect(fx + 60, y + BUS_H - 34, w, 10, 'rgba(0,0,0,.18)');
  rrect(fx + 18, y + 22, 64, 62, 10, K.box);                              // the windscreen
  circ(fx + 14, y + BUS_H - 36, 12, K.lamp); circ(fx - 6, y + BUS_H - 36, 40, rgba(K.lamp, .12));
  if (label) { rrect(fx + 100, y + 16, 150, 74, 10, K.box); text(label, fx + 175, y + 55, '700 54px "Space Grotesk"', K.lamp); }
  for (let x = fx + (label ? 290 : 120), i = 0; x < vx1; x += 124, i++) {      // windows, and somebody at every one of them
    rrect(x, y + 22, 92, 62, 10, K.box);
    const a = 1 - emptied;
    if (a > .02) { const bob = Math.sin(t * 2 + i * 1.3 + row) * 2; g.globalAlpha = a; circ(x + 46, y + 64 + bob, 20, mix(colour, '#FFFFFF', .55)); circ(x + 39, y + 60 + bob, 2.6, K.ink); circ(x + 53, y + 60 + bob, 2.6, K.ink); g.globalAlpha = 1; rect(x, y + 84, 92, 3, colour); }
  }
  for (let x = fx + 150; x < vx1; x += 520) { circ(x, y + BUS_H, 34, '#0A0A18'); circ(x, y + BUS_H, 14, '#55527A'); }
}
function buses(t, vx0, vx1, vy1) {
  const tb = at('bus');
  if (t > tb - .2) bus(lerp(vx1 + 300, 1960, prog(t, tb - .2, 2.2, E.out)), ROW_Y(0), BUSC[0], '', vx1, t, 0, prog(t, 'busin', 1.2));      // the first pulls in from the right
  const tl = at('lot');
  if (t > tl - .3) for (let r = 1; ROW_Y(r) < vy1 + 40; r++) {      // then all the others, one row after another, for ever
    const fx = lerp(vx1 + 300, 1960 + (r % 2) * 70, prog(t, tl - .3 + Math.min(r, 14) * .16, 1.9, E.out));
    const t0 = r === 1 ? at('three') : r === 2 ? at('five') : at('clash-0.5');
    bus(fx, ROW_Y(r), BUSC[r % BUSC.length], r <= PR.length ? String(PR[r - 1]) : '', vx1, t, r, prog(t, t0, 1.2));
  }
  if (t > at('last-0.4')) bus(lerp(vx1 + 300, 1960, prog(t, 'last-0.4', 2.2, E.out)), ROW_Y(0), K.pink, 'A B', vx1, t, 9, 0);      // the last bus parks over the first
}

/* ---- the sky's furniture, in screen space ---- */
function stars(s, t, hy) {
  const top = Math.max(120, hy - 40);
  for (let i = 0; i < 130; i++) {
    const tw = .35 + .65 * Math.abs(Math.sin(t * (.6 + rnd(i, 5)) + i)), a = (1 - s.d * .85) * tw * (rnd(i, 3) > .5 ? 1 : .55);
    circ(rnd(i, 1) * W, rnd(i, 2) * top, 1.2 + rnd(i, 4) * 1.9, rgba('#F6F0E2', a));
  }
}
function moon(z, hy) {
  const x = OX + 1640, y = Math.max(110, hy - 620 * clamp(z, .55, 1));
  circ(x, y, 150, 'rgba(246,240,226,.05)'); circ(x, y, 58, '#F3ECD2');
  circ(x - 20, y + 16, 9, 'rgba(170,160,130,.5)'); circ(x + 14, y - 22, 7, 'rgba(170,160,130,.5)'); circ(x + 22, y + 20, 5, 'rgba(170,160,130,.5)');
}
function clouds(c, s, t, hy) {                          // dark wisps that never stop; they keep to the right of the sky
  const span = W + 700;
  for (let i = 0; i < 7; i++) {
    const sc = .8 + rnd(i, 5) * .9, speed = 7 + rnd(i, 9) * 8;
    const x = ((rnd(i, 6) * span - c.x * .06 + t * speed) % span + span) % span - 350, y = hy - 300 - rnd(i, 7) * 330;
    const side = clamp((x - OX + 115 * sc - 1180) / 280); if (side <= 0) continue;
    g.globalAlpha = side * (.16 + rnd(i, 8) * .14);
    const col = mix('#8A84C4', '#FFB48A', s.d);
    rrect(x, y, 260 * sc, 30 * sc, 15 * sc, col); circ(x + 80 * sc, y, 36 * sc, col); circ(x + 150 * sc, y - 10 * sc, 46 * sc, col);
  }
  g.globalAlpha = 1;
}
function skyline(c, s, z, hy) {                        // far hills, slower than the hotel
  g.fillStyle = mix('#151238', '#3B2A5E', s.d); g.beginPath(); g.moveTo(0, hy + 4);
  for (let x = 0; x <= W + 24; x += 24) { const wx = (x - OX) / z + c.x * .3; g.lineTo(x, hy - (60 + 34 * Math.sin(wx / 420) + 18 * Math.sin(wx / 150 + 2)) * z); }
  g.lineTo(W, hy + 4); g.fill();
}

/* ---- the frame ---- */
function draw(ctx, t, k, viewW, viewH) {
  g = ctx;
  W = viewW || SW; H = viewH || SH; CX = W / 2; CY = H / 2; OX = (W - SW) / 2;
  const c = camera(t), s = sky(t), z = c.s;
  const hy = (GY - c.y) * z + CY;
  g.setTransform(k, 0, 0, k, 0, 0); g.globalAlpha = 1; g.setLineDash([]);
  if (hy > 0) {
    const grad = g.createLinearGradient(0, hy - 900, 0, hy); grad.addColorStop(0, s.top); grad.addColorStop(1, s.bot);
    rect(0, 0, W, Math.min(H, hy + 2), grad);
    stars(s, t, hy); moon(z, hy); clouds(c, s, t, hy); skyline(c, s, z, hy);
  }
  g.setTransform(k * z, 0, 0, k * z, k * (CX - c.x * z), k * (CY - c.y * z));
  const vx0 = c.x - CX / z - 4, vx1 = c.x + CX / z + 4, vy1 = c.y + CY / z + 4;
  ground(t, z, vx0, vx1, vy1);
  if (vx1 > LOBBY_X1) rooms(t, z, vx0, vx1);
  if (vx0 < LOBBY_X1 + 60) lobby(t);
  buses(t, vx0, vx1, vy1);
  guests(t, vx0, vx1);
  /* you: walk up to the hotel, wait by reception, then go to room 1 */
  const tIn = YOU_IN();
  if (t < tIn) {
    const x = kf(t, [[0, 250], [at('sign+0.6'), 1330, E.out], [at('wait+0.3'), 1330], [at('infinite+2'), 1960, E.io], [at('free'), 1960], [tIn, DX(1), E.io]]);
    traveller(x, GY + 34, t, t < at('sign+0.4') || (t > at('wait+0.3') && t < at('infinite+2')) || t > at('free'));
  }
  /* the one who is left over: a guest with nowhere to go, outside reception */
  const left = prog(t, 'noroom', .6, E.out);
  if (left > 0) { person(2210, GY + 34, K.pink, t, 77, left); text('?', 2210, GY - 150 + Math.sin(t * 3) * 6, '900 70px Fraunces', rgba(K.pink, left)); }
  g.setTransform(k, 0, 0, k, 0, 0);
  if (OX > 2) {                                        // on wide screens the picture runs past the type frame and falls off into shadow
    const l = g.createLinearGradient(0, 0, OX + 60, 0); l.addColorStop(0, 'rgba(5,5,16,.6)'); l.addColorStop(1, 'rgba(5,5,16,0)'); rect(0, 0, OX + 60, H, l);
    const r = g.createLinearGradient(W, 0, W - OX - 60, 0); r.addColorStop(0, 'rgba(5,5,16,.6)'); r.addColorStop(1, 'rgba(5,5,16,0)'); rect(W - OX - 60, 0, OX + 60, H, r);
  }
  return c;
}

function toScreen(c, x, y) { return [(x - c.x) * c.s + SW / 2, (y - c.y) * c.s + SH / 2]; }

window.World = { draw, camera, toScreen, sky, GY, DX };
})();
