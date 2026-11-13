/* 输入回归：模拟 iOS TouchEvent（事件对象上没有 clientX，只有 changedTouches）
   确保菜单按钮/难度芯片在真机 WebView 里能点得动 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'www', 'game.js'), 'utf8');

function grad() { return { addColorStop() { } }; }
function makeCtx() {
  return new Proxy({ createLinearGradient: grad, createRadialGradient: grad, measureText: () => ({ width: 40 }) },
    { get(t, k) { if (k in t) return t[k]; return function () { return grad(); }; }, set(t, k, v) { t[k] = v; return true; } });
}
function makeCanvas() {
  return {
    width: 720, height: 1280, style: {},
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 1280 })
  };
}

function boot(opts) {
  const listeners = {};
  const win = {
    innerWidth: 720, innerHeight: 1280, devicePixelRatio: 2,
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener() { },
    requestAnimationFrame(f) { win.__raf = f; return 1; },
    performance: { now: () => Date.now() },
    localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } }
  };
  if (opts.pointer) win.PointerEvent = function PointerEvent() { };
  const doc = {
    readyState: 'complete', hidden: false,
    getElementById: () => makeCanvas(), createElement: () => makeCanvas(),
    addEventListener() { }
  };
  win.document = doc; win.window = win;
  const sandbox = {
    window: win, document: doc, Math, Date, JSON, Object, Array, String, Number,
    Boolean, parseInt, parseFloat, isNaN, isFinite, console, setTimeout, clearTimeout,
    requestAnimationFrame: win.requestAnimationFrame
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'game.js' });

  function fire(type, x, y) {
    const ev = {
      type, cancelable: true,
      preventDefault() { ev.defaultPrevented = true; },
      changedTouches: [{ clientX: x, clientY: y }],
      touches: [{ clientX: x, clientY: y }]
      // 注意：故意不提供 clientX —— 和 iOS 上的 TouchEvent 一致
    };
    if (opts.pointer && type.indexOf('pointer') === 0) {
      ev.clientX = x; ev.clientY = y; // PointerEvent 是 MouseEvent 子类，有坐标
      delete ev.changedTouches; delete ev.touches;
    }
    (listeners[type] || []).forEach(f => f(ev));
    return ev;
  }
  return { api: win.__GOLD_MINER__, fire };
}

let failed = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failed++;
}

/* ---------- 1. 纯触摸（无 PointerEvent 环境，走 touchstart） ---------- */
(function () {
  const { api, fire } = boot({ pointer: false });
  api.setState('menu');
  api.render();

  const areas = api.getHitAreas();
  const chips = areas.filter(a => a.h === 58);
  const startBtn = areas.find(a => a.w === 420);
  check('菜单上能找到 3 个难度芯片', chips.length === 3);
  check('菜单上能找到开始按钮', !!startBtn);

  // 点第三个芯片（硬核）
  const c2 = chips[2];
  fire('touchstart', c2.x + c2.w / 2, c2.y + c2.h / 2);
  check('触摸点中「硬核」芯片后难度切换', api.getDifficulty().index === 2);

  api.render();
  const chips2 = api.getHitAreas().filter(a => a.h === 58);
  fire('touchstart', chips2[0].x + 10, chips2[0].y + 10);
  check('触摸点中「轻松」芯片后难度切换', api.getDifficulty().index === 0);

  api.render();
  const btn = api.getHitAreas().find(a => a.w === 420);
  fire('touchstart', btn.x + btn.w / 2, btn.y + btn.h / 2);
  check('触摸「开始游戏」进入 intro', api.G.state === 'intro');

  const ev = fire('touchstart', 10, 10);
  check('touchstart 已 preventDefault（防止页面缩放/滚动）', ev.defaultPrevented === true);
})();

/* ---------- 2. PointerEvent 环境（走 pointerdown） ---------- */
(function () {
  const { api, fire } = boot({ pointer: true });
  api.setState('menu');
  api.render();

  const chips = api.getHitAreas().filter(a => a.h === 58);
  const c1 = chips[1];
  fire('pointerdown', c1.x + c1.w / 2, c1.y + c1.h / 2);
  check('pointerdown 点中「标准」芯片后难度切换', api.getDifficulty().index === 1);

  api.render();
  const btn = api.getHitAreas().find(a => a.w === 420);
  fire('pointerdown', btn.x + 20, btn.y + 20);
  check('pointerdown 点中开始按钮进入 intro', api.G.state === 'intro');
})();

/* ---------- 3. 游戏内点屏幕放钩 ---------- */
(function () {
  const { api, fire } = boot({ pointer: false });
  api.startNewGame();
  api.setState('playing');
  api.update(1 / 60);
  check('开局钩子在摆动', api.G.hook.state === 'swing');
  fire('touchstart', 360, 900);
  check('游戏内触摸触发放钩', api.G.hook.state === 'shoot');
})();

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
