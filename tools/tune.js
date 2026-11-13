/* 难度调参器：指定难度档位后跑自动机器人，输出胜率分布
   用法: node tools/tune.js '{"diff":1,"runs":5}' */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const P = Object.assign({ diff: 1, runs: 5 }, JSON.parse(process.argv[2] || '{}'));
const code = fs.readFileSync(path.join(__dirname, '..', 'www', 'game.js'), 'utf8');

function grad() { return { addColorStop() { } }; }
function makeCtx() {
  return new Proxy({ createLinearGradient: grad, createRadialGradient: grad, measureText: () => ({ width: 40 }) },
    { get(t, k) { if (k in t) return t[k]; return function () { return grad(); }; }, set(t, k, v) { t[k] = v; return true; } });
}
function makeCanvas() {
  return { width: 720, height: 1280, style: {}, getContext: () => makeCtx(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 1280 }) };
}
function boot(w, h) {
  const win = {
    innerWidth: w, innerHeight: h, devicePixelRatio: 3, addEventListener() { },
    requestAnimationFrame(f) { win.__raf = f; return 1; },
    localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } }
  };
  const doc = { readyState: 'complete', hidden: false, getElementById: () => makeCanvas(), createElement: () => makeCanvas(), addEventListener() { } };
  win.document = doc; win.window = win;
  const sandbox = { window: win, document: doc, Math, Date, JSON, Object, Array, String, Number, Boolean, parseInt, parseFloat, isNaN, console, setTimeout, clearTimeout, requestAnimationFrame: win.requestAnimationFrame };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'game.js' });
  return win.__GOLD_MINER__;
}

let api = boot(390, 844);
let b0 = api.bounds();

function playLevel(level) {
  api.setLevel(level);
  api.setState('playing');
  const G = api.G;
  const PX = b0.PIVOT_X, PY = b0.PIVOT_Y;
  let guard = 0;
  while (G.state === 'playing' && guard < 60 * 220) {
    guard++;
    const h = G.hook;
    if (h.state === 'swing') {
      let best = null, bestScore = -1e9;
      for (const it of G.items) {
        if (it.dead) continue;
        const a = Math.atan2(it.y - PY, it.x - PX);
        let diffA = Math.abs(a - h.angle);
        if (diffA > Math.PI) diffA = Math.PI * 2 - diffA;
        const d = Math.hypot(it.x - PX, it.y - PY);
        const perp = Math.sin(diffA) * d;
        if (perp > it.radius * 0.65) continue;
        const val = it.type === 'bag' ? 200 : (it.type === 'tnt' ? 0 : it.value);
        if (val < 50) continue;
        const score = val / (it.weight + 0.8) - perp * 0.5;
        if (score > bestScore) { bestScore = score; best = it; }
      }
      if (best) api.shoot();
    }
    api.update(1 / 60);
  }
  return { win: G.state === 'complete' || G.state === 'finished', earned: G.earnings, goal: G.goal, left: G.items.length, t: G.timeLeft };
}

const buckets = [[1, 10], [11, 30], [31, 60], [61, 100], [101, 150], [151, 200]];
const stats = buckets.map(() => ({ win: 0, n: 0, earned: 0, goal: 0 }));
let wins = 0, total = 0;
for (let run = 0; run < P.runs; run++) {
  if (run > 0) { api = boot(390, 844); b0 = api.bounds(); }
  api.setDifficulty(P.diff);
  for (let n = 1; n <= 200; n++) {
    const r = playLevel(n);
    total++;
    if (r.win) wins++;
    const bi = buckets.findIndex(([a, b]) => n >= a && n <= b);
    stats[bi].n++;
    if (r.win) stats[bi].win++;
    stats[bi].earned += r.earned;
    stats[bi].goal += r.goal;
  }
}
console.log(`${api.getDifficulty().name}档  总胜率 ${wins}/${total} = ${(wins / total * 100).toFixed(0)}%`);
stats.forEach((s, i) => {
  console.log(`  第${buckets[i][0]}-${buckets[i][1]}关: ${(s.win / s.n * 100).toFixed(0)}%  收入 ${Math.round(s.earned / s.n)} / 目标 ${Math.round(s.goal / s.n)}`);
});
