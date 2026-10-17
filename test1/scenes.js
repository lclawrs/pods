/* scenes.js — the settings of The Infinite Hotel, and the scrims drawn over the world. Everything else on screen is
   either the world (world.js) or a plain entrance (index.html). Everything is a function of t. */
(function () {
'use strict';
const S = window.Show, { E, prog } = S;

S.config = {
  fonts: ['italic 500 40px "Fraunces"', '700 40px "Fraunces"', '900 40px "Fraunces"', '500 40px "Space Grotesk"', '600 40px "Space Grotesk"', '700 40px "Space Grotesk"'],
  // the frame behind the start button: the title over the row of rooms
  posterAt: 'title+2.2',
  // the start button sits under the title, above the roof (the roof line is at 500 in that frame), clear of the roof sign
  poster: { x: 130, y: 318, floor: 492, keepClear: [[1150, 380, 1760, 500]] },
  ground: 680,
  endAt: 'unless+3.6',
  over(ctx, t, view) {
    const { VW, VH } = view; ctx.setTransform(view.k, 0, 0, view.k, 0, 0); ctx.globalAlpha = 1;
    const dim = prog(t, 'list-0.3', .8) * (1 - prog(t, 'hilbert-0.5', .8)) * .5;      // the hotel sits back while the list is read
    if (dim > .003) { ctx.fillStyle = `rgba(6,7,20,${dim.toFixed(3)})`; ctx.fillRect(0, 0, VW, VH); }
    const black = 1 - prog(t, .1, 1.4, E.io);          // the film opens out of black
    if (black > .003) { ctx.fillStyle = `rgba(6,7,20,${black.toFixed(3)})`; ctx.fillRect(0, 0, VW, VH); }
  },
};

S.start();
})();
