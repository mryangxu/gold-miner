/* 无浏览器冒烟测试：桩件 + 自动瞄准机器人，用于校验关卡可玩性与平衡 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'www', 'game.js'), 'utf8');

function grad() { return { addColorStop() { } }; }
function makeCtx() {
  return new Proxy({
    createLinearGradient: grad, createRadialGradient: grad, measureText: () => ({ width: 40 })
  }, {
    get(t, k) { if (k in t) return t[k]; return function () { return grad(); }; },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function makeCanvas() {
  return {
    width: 720, height: 1280, style: {},
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 1280 })
  };
}

function boot(w, h) {
  const win = {
    innerWidth: w, innerHeight: h, devicePixelRatio: 3,
    addEventListener() { },
    requestAnimationFrame(f) { win.__raf = f; return 1; },
    localStorage: {
      _d: {},
      getItem(k) { return this._d[k] || null; },
      setItem(k, v) { this._d[k] = String(v); }
    }
  };
  const doc = {
    readyState: 'complete', hidden: false,
    getElementById: () => makeCanvas(),
    createElement: () => makeCanvas(),
    addEventListener() { }
  };
  win.document = doc; win.window = win;
  const sandbox = {
    window: win, document: doc, Math, Date, JSON, Object, Array, String, Number,
    Boolean, parseInt, parseFloat, isNaN, console, setTimeout, clearTimeout,
    requestAnimationFrame: win.requestAnimationFrame
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'game.js' });
  return win.__GOLD_MINER__;
}

const api = boot(390, 844);
const b = api.bounds();
console.log('逻辑尺寸:', JSON.stringify(b));

let problems = [];
for (let n = 1; n <= 200; n++) {
  const L = api.generateLevel(n);
  if (!L.items.length) problems.push(`第${n}关没有物品`);
  if (L.goal <= 0) problems.push(`第${n}关目标异常 ${L.goal}`);
  if (L.items.length < 10) problems.push(`第${n}关物品过少 ${L.items.length}`);
  for (const it of L.items) {
    if (it.x < 20 || it.x > 700) problems.push(`第${n}关 x 越界 ${it.x.toFixed(0)}`);
    if (it.y < b.ITEM_TOP - 90 || it.y > b.ITEM_BOTTOM) problems.push(`第${n}关 y 越界 ${it.y.toFixed(0)}`);
  }
}
for (let d = 0; d < 3; d++) {
  api.setDifficulty(d);
  for (let n = 1; n <= 200; n++) {
    const L = api.generateLevel(n);
    if (L.goal > 0 && L.time < 30) problems.push(`第${n}关 时间过短 ${L.time}`);
  }
}
api.setDifficulty(1);
console.log('关卡生成检查：问题数 =', problems.length);
if (problems.length) console.log(problems.slice(0, 6));

function playLevel(level) {
  api.setLevel(level);
  api.setState('playing');
  const G = api.G;
  const dt = 1 / 60;
  let guard = 0;
  const b = api.bounds();
  const PX = b.PIVOT_X, PY = b.PIVOT_Y;

  while (G.state === 'playing' && guard < 60 * 200) {
    guard++;
    const h = G.hook;
    if (h.state === 'swing') {
      let best = null, bestScore = -1e9;
      for (const it of G.items) {
        if (it.dead) continue;
        const a = Math.atan2(it.y - PY, it.x - PX);
        let diff = Math.abs(a - h.angle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        const d = Math.hypot(it.x - PX, it.y - PY);
        const perp = Math.sin(diff) * d;
        if (perp > it.radius * 0.65) continue;
        const val = it.type === 'bag' ? 200 : (it.type === 'tnt' ? 0 : it.value);
        if (val < 50) continue; // 熟练玩家不会去钩石头/骨头
        const score = val / (it.weight + 0.8) - perp * 0.5;
        if (score > bestScore) { bestScore = score; best = it; }
      }
      if (best) api.shoot();
    }
    api.update(dt);
  }
  return { level: level, win: G.state === 'complete' || G.state === 'finished', earned: G.earnings, goal: G.goal, time: G.timeLeft, theme: G.theme, items: G.items.length };
}

for (let d = 0; d < 3; d++) {
  api.setDifficulty(d);
  let wins = 0;
  const rows = [];
  for (let n = 1; n <= 200; n++) {
    const r = playLevel(n);
    rows.push(r);
    if (r.win) wins++;
  }
  const name = api.getDifficulty().name;
  console.log(`${name}档  机器人通关率: ${wins}/200 = ${(wins / 2).toFixed(0)}%`);
  const seg = [[1, 10], [11, 30], [31, 60], [61, 100], [101, 150], [151, 200]];
  console.log('  ' + seg.map(([a, b]) => {
    const part = rows.filter(r => r.level >= a && r.level <= b);
    const w = part.filter(r => r.win).length;
    return `${a}-${b}关 ${(w / part.length * 100).toFixed(0)}%`;
  }).join('  '));
}
api.setDifficulty(1);

api.startNewGame();
['menu', 'intro', 'playing', 'complete', 'shop', 'failed', 'paused', 'finished'].forEach(s => {
  api.setState(s);
  api.render();
});
console.log('全部界面渲染通过');
console.log('OK');
