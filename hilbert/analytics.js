/* analytics.js — what the audience did, counted without cookies or personal data, through GoatCounter.
   One page view when the page loads (GoatCounter's own script), then one event each, once per visit:
   play, each chapter reached, the end. Set ENDPOINT to the site's GoatCounter count address; empty means off. */
(function () {
'use strict';
const ENDPOINT = window.PODS_ANALYTICS || '';
if (!ENDPOINT || !window.Show) return;
const S = window.Show, SHOW = location.pathname.replace(/^\/|\/(index\.html)?$/g, '') || 'home';
const sc = document.createElement('script'); sc.async = true; sc.src = '//gc.zgo.at/count.js'; sc.dataset.goatcounter = ENDPOINT; document.head.appendChild(sc);
const sent = new Set();
const count = name => {
  if (sent.has(name)) return; sent.add(name);
  const send = () => window.goatcounter && window.goatcounter.count ? window.goatcounter.count({ path: `${SHOW}/${name}`, title: `${SHOW}: ${name}`, event: true }) : setTimeout(send, 500);
  send();
};
let wasPlaying = false, last = 0;
S.onFrame(t => {
  if (S.playing && !wasPlaying) { count('play'); }
  wasPlaying = S.playing;
  if (S.playing) for (const c of S.TL.chapters) if (last < c.start && t >= c.start) count('chapter-' + c.id);
  if (t >= S.TL.duration - .1 && last < S.TL.duration - .1) count('end');
  last = t;
});
})();
