/* =========================================================
   黄金矿工 Gold Miner
   纯 Canvas 2D，无外部资源，可离线运行
   ========================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     0. 基础常量
     --------------------------------------------------------- */
  var W = 720, H = 1280;                 // 逻辑分辨率（H 随设备屏幕比例动态计算）
  var GROUND_TOP = 300;                  // 地表 y（随屏幕高度动态计算）
  var ITEM_TOP = 382;                    // 埋藏物最浅 y（动态）
  var ITEM_BOTTOM = 1142;                // 埋藏物最深 y（动态）
  var BTN_Y = 1176;                      // 底部按钮 y（动态）
  var PIVOT_X = 360, PIVOT_Y = 236;      // 吊绳支点
  var REST_LEN = 36;                     // 绳静止长度
  var MAX_LEN = 1150;                    // 最大长度（动态）
  var bgSeed = 99;
  var MIN_ANGLE = 0.30, MAX_ANGLE = Math.PI - 0.30;
  var TOTAL_LEVELS = 200;
  var SAVE_KEY = 'goldminer.save.v2';
  var DIFF_KEY = 'goldminer.diff.v1';
  var FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,-apple-system,sans-serif';

  /* ---------------------------------------------------------
     1. 工具函数
     --------------------------------------------------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function fmt(n) {
    var s = String(Math.round(n));
    var out = '';
    var c = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s.charAt(i) + out;
      c++;
      if (c % 3 === 0 && i > 0) out = ',' + out;
    }
    return out;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rr(g, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r);
    g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h);
    g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r);
    g.arcTo(x, y, x + r, y, r);
    g.closePath();
  }
  function blobPath(g, pts) {
    var n = pts.length;
    var mx = (pts[n - 1].x + pts[0].x) / 2;
    var my = (pts[n - 1].y + pts[0].y) / 2;
    g.beginPath();
    g.moveTo(mx, my);
    for (var i = 0; i < n; i++) {
      var p0 = pts[i], p1 = pts[(i + 1) % n];
      g.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
    }
    g.closePath();
  }

  /* ---------------------------------------------------------
     2. 画布 / 视图
     --------------------------------------------------------- */
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var view = { scale: 1, ox: 0, oy: 0, cw: W, ch: H, dpr: 1 };

  function resize() {
    var cw = window.innerWidth || W;
    var ch = window.innerHeight || H;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';

    // 逻辑高度跟随设备宽高比：底部矿区深度保持恒定，多余空间留给天空
    H = clamp(Math.round(W * (ch / Math.max(1, cw))), 1280, 1450);
    GROUND_TOP = H - 980;
    PIVOT_Y = GROUND_TOP - 74;
    ITEM_TOP = GROUND_TOP + 82;
    ITEM_BOTTOM = H - 142;
    BTN_Y = H - 104;
    MAX_LEN = H - 130;

    var scale = Math.min(cw / W, ch / H);
    view.scale = scale;
    view.ox = (cw - W * scale) / 2;
    view.oy = (ch - H * scale) / 2;
    view.cw = cw; view.ch = ch; view.dpr = dpr;

    if (typeof G !== 'undefined' && G && G.started) {
      G.bg = buildBackground(bgSeed);
    }
  }

  function toLogical(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.ox) / view.scale,
      y: (clientY - r.top - view.oy) / view.scale
    };
  }

  /* ---------------------------------------------------------
     3. 音效（WebAudio 合成，无音频文件）
     --------------------------------------------------------- */
  var AC = null;
  var muted = false;

  function audioInit() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) {
        try { AC = new C(); } catch (e) { AC = null; }
      }
    }
    if (AC && AC.state === 'suspended') {
      try { AC.resume(); } catch (e) { }
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!AC || muted) return;
    try {
      var t0 = AC.currentTime + (delay || 0);
      var osc = AC.createOscillator();
      var gain = AC.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(AC.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch (e) { }
  }

  function noiseBurst(dur, vol, freq) {
    if (!AC || muted) return;
    try {
      var len = Math.floor(AC.sampleRate * dur);
      var buf = AC.createBuffer(1, len, AC.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      }
      var src = AC.createBufferSource();
      src.buffer = buf;
      var f = AC.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq || 900, AC.currentTime);
      var gain = AC.createGain();
      gain.gain.value = vol || 0.25;
      src.connect(f); f.connect(gain); gain.connect(AC.destination);
      src.start();
    } catch (e) { }
  }

  var sfx = {
    shoot: function () { tone(680, 0.10, 'square', 0.10, 220); },
    grap: function () { tone(300, 0.08, 'triangle', 0.09, 180); },
    coin: function (amount) {
      var base = 560 + Math.min(6, Math.floor(amount / 60)) * 70;
      tone(base, 0.09, 'sine', 0.12);
      tone(base * 1.5, 0.14, 'sine', 0.09, null, 0.07);
    },
    big: function () {
      [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.16, 'sine', 0.11, null, i * 0.07); });
    },
    tnt: function () { noiseBurst(0.5, 0.35, 700); tone(90, 0.3, 'sawtooth', 0.14, 40); },
    win: function () {
      [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.10, null, i * 0.09); });
    },
    fail: function () {
      [440, 370, 294, 220].forEach(function (f, i) { tone(f, 0.26, 'sawtooth', 0.09, null, i * 0.12); });
    },
    buy: function () { tone(880, 0.07, 'square', 0.08); tone(1180, 0.10, 'square', 0.07, null, 0.06); },
    tick: function () { tone(1200, 0.06, 'square', 0.05); },
    ready: function () { tone(420, 0.1, 'triangle', 0.08); tone(560, 0.12, 'triangle', 0.08, null, 0.09); }
  };

  /* ---------------------------------------------------------
     4. 存档
     --------------------------------------------------------- */
  // 难度档位：在基准曲线之上再做乘算
  var DIFFS = [
    { key: 'easy', name: '轻松', k0: 0.60, kk: 0.0008, kcap: 0.80, time: 1.14, swing: 0.94, desc: '轻松：目标更低，时间更宽裕' },
    { key: 'normal', name: '标准', k0: 0.74, kk: 0.0009, kcap: 0.96, time: 1.00, swing: 1.00, desc: '标准：目标与时间随关卡逐步收紧' },
    { key: 'hard', name: '硬核', k0: 0.82, kk: 0.0006, kcap: 0.94, time: 0.86, swing: 1.08, desc: '硬核：目标更高、时间更紧、摆钩更快' }
  ];
  var DIFF_INDEX = 1;

  function diff() { return DIFFS[DIFF_INDEX]; }

  function setDifficulty(i) {
    DIFF_INDEX = Math.max(0, Math.min(DIFFS.length - 1, i | 0));
    save.diff = diff().key;
    try { window.localStorage.setItem(DIFF_KEY, save.diff); } catch (e) { }
    sfx.buy();
  }

  function loadDifficulty() {
    try {
      var key = window.localStorage.getItem(DIFF_KEY);
      for (var i = 0; i < DIFFS.length; i++) {
        if (DIFFS[i].key === key) { DIFF_INDEX = i; save.diff = key; return; }
      }
    } catch (e) { }
  }

  var save = { level: 1, best: 1, wallet: 0, dynamite: 1, hasSave: false, diff: 'normal' };

  function loadSave() {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      save.level = Math.max(1, Math.min(TOTAL_LEVELS, o.level || 1));
      save.best = Math.max(1, o.best || 1);
      save.wallet = o.wallet || 0;
      save.dynamite = o.dynamite || 0;
      save.hasSave = true;
    } catch (e) { }
  }

  function persist() {
    try {
      save.level = G.level;
      save.best = Math.max(save.best, G.level);
      save.wallet = G.wallet;
      save.dynamite = G.dynamite;
      save.hasSave = true;
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        level: save.level, best: save.best, wallet: save.wallet, dynamite: save.dynamite
      }));
    } catch (e) { }
  }

  /* ---------------------------------------------------------
     5. 游戏状态
     --------------------------------------------------------- */
  var G = {
    state: 'menu',
    t: 0,
    level: 1,
    wallet: 0,
    dynamite: 1,
    earnings: 0,
    goal: 0,
    timeLimit: 60,
    timeLeft: 60,
    items: [],
    particles: [],
    floats: [],
    hook: null,
    shake: 0,
    strength: 0,
    buffs: { gloves: false, luck: false, clock: false },
    theme: '普通矿层',
    lastTick: -1,
    bg: null,
    completeInfo: null,
    started: false
  };

  var hitAreas = [];

  /* ---------------------------------------------------------
     6. 埋藏物定义
     --------------------------------------------------------- */
  var DEFS = {
    goldS: { radius: 28, weight: 1.1, value: 60, type: 'goldS' },
    goldM: { radius: 42, weight: 2.2, value: 130, type: 'goldM' },
    goldL: { radius: 58, weight: 3.6, value: 320, type: 'goldL' },
    rockS: { radius: 36, weight: 2.9, value: 12, type: 'rockS' },
    rockL: { radius: 62, weight: 5.4, value: 24, type: 'rockL' },
    diamond: { radius: 28, weight: 1.0, value: 650, type: 'diamond' },
    bone: { radius: 34, weight: 1.3, value: 6, type: 'bone' },
    bag: { radius: 36, weight: 1.8, value: 0, type: 'bag' },
    tnt: { radius: 30, weight: 1.0, value: 0, type: 'tnt' },
    mole: { radius: 32, weight: 1.0, value: 45, type: 'mole' },
    potion: { radius: 28, weight: 1.0, value: 0, type: 'potion' }
  };

  /* ---------------- 精灵绘制（程序化美术） ---------------- */

  function drawGold(g, r, rng) {
    var n = 11;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var rad = r * (0.78 + rng() * 0.26);
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad * 0.94 });
    }
    var grad = g.createRadialGradient(-r * 0.34, -r * 0.4, r * 0.08, 0, 0, r * 1.16);
    grad.addColorStop(0, '#fffbe0');
    grad.addColorStop(0.3, '#ffdd63');
    grad.addColorStop(0.62, '#e8a91c');
    grad.addColorStop(1, '#7d4f04');
    blobPath(g, pts);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(90,56,4,0.85)';
    g.lineWidth = Math.max(1.6, r * 0.075);
    g.stroke();

    // 暗部斑块
    g.save();
    blobPath(g, pts);
    g.clip();
    g.fillStyle = 'rgba(120,72,8,0.22)';
    for (var k = 0; k < 3; k++) {
      var bx = (rng() - 0.5) * r * 1.2;
      var by = (rng() - 0.1) * r * 0.9;
      var br = r * (0.18 + rng() * 0.22);
      g.beginPath(); g.ellipse(bx, by, br, br * 0.7, rng() * 3, 0, Math.PI * 2); g.fill();
    }
    // 高光
    g.fillStyle = 'rgba(255,255,240,0.85)';
    g.beginPath(); g.ellipse(-r * 0.34, -r * 0.38, r * 0.2, r * 0.13, -0.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.ellipse(-r * 0.05, -r * 0.55, r * 0.09, r * 0.06, -0.4, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function drawRock(g, r, rng) {
    var n = 9;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + rng() * 0.2;
      var rad = r * (0.84 + rng() * 0.16);
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad * 0.92 });
    }
    var grad = g.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, 0, 0, r * 1.2);
    grad.addColorStop(0, '#c3cad1');
    grad.addColorStop(0.35, '#8b939b');
    grad.addColorStop(0.72, '#565e66');
    grad.addColorStop(1, '#2a2f35');
    blobPath(g, pts);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(18,22,26,0.8)';
    g.lineWidth = Math.max(1.6, r * 0.06);
    g.stroke();

    g.save();
    blobPath(g, pts);
    g.clip();
    // 裂纹
    g.strokeStyle = 'rgba(30,36,42,0.55)';
    g.lineWidth = Math.max(1.2, r * 0.045);
    for (var c = 0; c < 3; c++) {
      g.beginPath();
      var sx = (rng() - 0.5) * r, sy = (rng() - 0.5) * r;
      g.moveTo(sx, sy);
      g.lineTo(sx + (rng() - 0.5) * r * 0.9, sy + (rng() - 0.5) * r * 0.9);
      g.stroke();
    }
    // 顶部受光
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.beginPath(); g.ellipse(-r * 0.28, -r * 0.42, r * 0.42, r * 0.22, -0.5, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function drawDiamond(g, r, rng) {
    var topY = -r * 0.62, midY = -r * 0.06, botY = r * 0.92;
    var pts = [
      { x: -r * 0.48, y: topY },
      { x: r * 0.48, y: topY },
      { x: r * 0.82, y: midY },
      { x: 0, y: botY },
      { x: -r * 0.82, y: midY }
    ];
    // 光晕
    var glow = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5);
    glow.addColorStop(0, 'rgba(150,240,255,0.35)');
    glow.addColorStop(1, 'rgba(150,240,255,0)');
    g.fillStyle = glow;
    g.beginPath(); g.arc(0, 0, r * 1.5, 0, Math.PI * 2); g.fill();

    // 主体
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < 5; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    var grad = g.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, '#eafcff');
    grad.addColorStop(0.4, '#8fe6ff');
    grad.addColorStop(0.75, '#3fb8e0');
    grad.addColorStop(1, '#1f6f96');
    g.fillStyle = grad;
    g.fill();

    // 切面
    g.save();
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.moveTo(-r * 0.48, topY); g.lineTo(0, midY); g.lineTo(-r * 0.82, midY); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath(); g.moveTo(r * 0.48, topY); g.lineTo(r * 0.82, midY); g.lineTo(0, midY); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,60,90,0.22)';
    g.beginPath(); g.moveTo(0, midY); g.lineTo(0, botY); g.lineTo(-r * 0.82, midY); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath(); g.moveTo(0, midY); g.lineTo(r * 0.82, midY); g.lineTo(0, botY); g.closePath(); g.fill();
    g.restore();

    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = Math.max(1.4, r * 0.05);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < 5; j++) g.lineTo(pts[j].x, pts[j].y);
    g.closePath();
    g.stroke();

    // 闪光十字
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(-r * 0.34, -r * 0.3); g.lineTo(-r * 0.2, -r * 0.3); g.lineTo(-r * 0.2, -r * 0.44);
    g.lineTo(-r * 0.06, -r * 0.3); g.lineTo(-r * 0.2, -r * 0.16); g.lineTo(-r * 0.2, -r * 0.3);
    g.closePath(); g.fill();
  }

  function drawBone(g, r, rng) {
    g.rotate(-0.45);
    var w = r * 1.5, h = r * 0.34;
    var grad = g.createLinearGradient(0, -h, 0, h);
    grad.addColorStop(0, '#fffdf3');
    grad.addColorStop(0.5, '#e8dfc8');
    grad.addColorStop(1, '#b8ab8d');
    g.fillStyle = grad;
    g.strokeStyle = 'rgba(90,78,54,0.85)';
    g.lineWidth = Math.max(1.4, r * 0.05);
    // 骨干
    rr(g, -w / 2, -h / 2, w, h, h / 2);
    g.fill(); g.stroke();
    // 两端圆头
    var kr = h * 0.78;
    var ends = [[-w / 2, -h * 0.42], [-w / 2, h * 0.42], [w / 2, -h * 0.42], [w / 2, h * 0.42]];
    for (var i = 0; i < ends.length; i++) {
      g.beginPath();
      g.arc(ends[i][0], ends[i][1], kr, 0, Math.PI * 2);
      g.fillStyle = grad; g.fill(); g.stroke();
    }
    g.fillStyle = 'rgba(120,105,76,0.25)';
    g.beginPath(); g.ellipse(0, h * 0.05, w * 0.3, h * 0.14, 0, 0, Math.PI * 2); g.fill();
  }

  function drawBag(g, r, rng) {
    // 袋身
    var pts = [];
    for (var i = 0; i < 14; i++) {
      var a = (i / 14) * Math.PI * 2;
      var rad = r * (0.86 + rng() * 0.12);
      pts.push({ x: Math.cos(a) * rad * 1.02, y: Math.sin(a) * rad + r * 0.12 });
    }
    var grad = g.createRadialGradient(-r * 0.3, -r * 0.2, r * 0.1, 0, r * 0.2, r * 1.2);
    grad.addColorStop(0, '#c8935a');
    grad.addColorStop(0.5, '#9a6836');
    grad.addColorStop(1, '#5c3a17');
    blobPath(g, pts);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(52,30,8,0.85)';
    g.lineWidth = Math.max(1.5, r * 0.06);
    g.stroke();
    // 袋口
    g.fillStyle = '#6d451f';
    rr(g, -r * 0.34, -r * 0.86, r * 0.68, r * 0.36, r * 0.12);
    g.fill();
    g.stroke();
    // 扎绳
    g.strokeStyle = '#f0dca4';
    g.lineWidth = Math.max(2, r * 0.1);
    g.beginPath();
    g.moveTo(-r * 0.42, -r * 0.52);
    g.lineTo(r * 0.42, -r * 0.52);
    g.stroke();
    // $ 号
    g.fillStyle = '#ffe27a';
    g.font = 'bold ' + Math.round(r * 0.86) + 'px ' + FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('$', 0, r * 0.18);
  }

  function drawTNT(g, r, rng) {
    g.rotate(-0.18);
    for (var i = 0; i < 3; i++) {
      var x = (i - 1) * r * 0.42;
      var grad = g.createLinearGradient(x - r * 0.2, 0, x + r * 0.2, 0);
      grad.addColorStop(0, '#a81f1f');
      grad.addColorStop(0.45, '#e83b2f');
      grad.addColorStop(1, '#8c1414');
      g.fillStyle = grad;
      g.strokeStyle = 'rgba(60,8,8,0.9)';
      g.lineWidth = 2;
      rr(g, x - r * 0.17, -r * 0.62, r * 0.34, r * 1.24, r * 0.1);
      g.fill(); g.stroke();
    }
    // 扎带
    g.fillStyle = '#3a2a1a';
    rr(g, -r * 0.68, -r * 0.16, r * 1.36, r * 0.24, r * 0.06);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold ' + Math.round(r * 0.26) + 'px ' + FONT;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('TNT', 0, -r * 0.03);
    // 引线
    g.strokeStyle = '#e8dcc0';
    g.lineWidth = Math.max(1.8, r * 0.075);
    g.beginPath();
    g.moveTo(r * 0.1, -r * 0.62);
    g.quadraticCurveTo(r * 0.5, -r * 0.95, r * 0.28, -r * 1.12);
    g.stroke();
    // 火花
    var sg = g.createRadialGradient(r * 0.28, -r * 1.14, 0, r * 0.28, -r * 1.14, r * 0.34);
    sg.addColorStop(0, 'rgba(255,255,220,1)');
    sg.addColorStop(0.4, 'rgba(255,180,40,0.9)');
    sg.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = sg;
    g.beginPath(); g.arc(r * 0.28, -r * 1.14, r * 0.34, 0, Math.PI * 2); g.fill();
  }

  function drawMole(g, r, rng) {
    // 身体
    var grad = g.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.1, 0, 0, r * 1.1);
    grad.addColorStop(0, '#8d6a52');
    grad.addColorStop(0.6, '#5f4432');
    grad.addColorStop(1, '#3a271b');
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(0, r * 0.08, r * 0.92, r * 0.86, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(30,18,10,0.85)';
    g.lineWidth = Math.max(1.6, r * 0.06);
    g.stroke();
    // 肚皮
    g.fillStyle = 'rgba(226,197,168,0.55)';
    g.beginPath(); g.ellipse(0, r * 0.36, r * 0.52, r * 0.42, 0, 0, Math.PI * 2); g.fill();
    // 耳朵
    g.fillStyle = '#4a3324';
    g.beginPath(); g.arc(-r * 0.58, -r * 0.55, r * 0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(r * 0.58, -r * 0.55, r * 0.2, 0, Math.PI * 2); g.fill();
    // 眼
    g.fillStyle = '#14100c';
    g.beginPath(); g.arc(-r * 0.28, -r * 0.18, r * 0.13, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(r * 0.28, -r * 0.18, r * 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(-r * 0.24, -r * 0.23, r * 0.045, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(r * 0.32, -r * 0.23, r * 0.045, 0, Math.PI * 2); g.fill();
    // 鼻
    g.fillStyle = '#e88a95';
    g.beginPath(); g.ellipse(0, r * 0.06, r * 0.14, r * 0.11, 0, 0, Math.PI * 2); g.fill();
    // 爪
    g.strokeStyle = '#f0e2cc';
    g.lineWidth = Math.max(1.6, r * 0.06);
    for (var i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(i * r * 0.22, r * 0.82);
      g.lineTo(i * r * 0.22, r * 1.02);
      g.stroke();
    }
  }

  function drawPotion(g, r, rng) {
    // 瓶身
    var grad = g.createLinearGradient(-r * 0.6, 0, r * 0.6, 0);
    grad.addColorStop(0, 'rgba(190,240,255,0.55)');
    grad.addColorStop(0.4, 'rgba(240,252,255,0.75)');
    grad.addColorStop(1, 'rgba(140,200,230,0.5)');
    g.fillStyle = grad;
    g.strokeStyle = 'rgba(200,240,255,0.9)';
    g.lineWidth = Math.max(1.4, r * 0.055);
    g.beginPath();
    g.moveTo(-r * 0.26, -r * 0.55);
    g.lineTo(-r * 0.26, -r * 0.1);
    g.quadraticCurveTo(-r * 0.78, r * 0.2, -r * 0.6, r * 0.7);
    g.quadraticCurveTo(-r * 0.2, r * 1.0, r * 0.6, r * 0.7);
    g.quadraticCurveTo(r * 0.78, r * 0.2, r * 0.26, -r * 0.1);
    g.lineTo(r * 0.26, -r * 0.55);
    g.closePath();
    g.fill(); g.stroke();
    // 药液
    g.save();
    g.clip();
    var lg = g.createLinearGradient(0, r * 0.05, 0, r * 0.95);
    lg.addColorStop(0, '#8ff0c0');
    lg.addColorStop(1, '#1e9a63');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(-r, r * 0.18);
    g.quadraticCurveTo(0, r * 0.0, r, r * 0.22);
    g.lineTo(r, r);
    g.lineTo(-r, r);
    g.closePath();
    g.fill();
    g.restore();
    // 软木塞
    g.fillStyle = '#b98a52';
    g.strokeStyle = 'rgba(90,60,25,0.9)';
    g.lineWidth = 2;
    rr(g, -r * 0.22, -r * 0.82, r * 0.44, r * 0.3, r * 0.07);
    g.fill(); g.stroke();
    // 高光
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.ellipse(-r * 0.34, r * 0.42, r * 0.09, r * 0.2, 0.3, 0, Math.PI * 2); g.fill();
  }

  var DRAW = {
    goldS: drawGold, goldM: drawGold, goldL: drawGold,
    rockS: drawRock, rockL: drawRock,
    diamond: drawDiamond, bone: drawBone, bag: drawBag,
    tnt: drawTNT, mole: drawMole, potion: drawPotion
  };

  function makeSprite(type, radius, seed) {
    var pad = 22;
    var s = (radius + pad) * 2;
    var SS = 2;
    var c = document.createElement('canvas');
    c.width = Math.ceil(s * SS);
    c.height = Math.ceil(s * SS);
    var g = c.getContext('2d');
    g.scale(SS, SS);
    g.translate(s / 2, s / 2);
    var rng = mulberry32(seed);
    DRAW[type](g, radius, rng);
    return { canvas: c, size: s };
  }

  /* ---------------------------------------------------------
     7. 关卡生成（200 关，确定性生成）
     --------------------------------------------------------- */
  var THEMES = [
    { name: '普通矿层', m: {} },
    { name: '黄金矿脉', m: { goldS: 1.7, goldM: 1.6, goldL: 1.4, rockS: 0.8 } },
    { name: '钻石洞窟', m: { diamond: 3.4, goldS: 0.8, rockS: 1.5, rockL: 1.2 } },
    { name: '岩石断层', m: { rockS: 2.3, rockL: 1.9, goldL: 1.2, diamond: 0.6 } },
    { name: '爆破区', m: { tnt: 3.2, goldM: 1.3, rockS: 1.2 } },
    { name: '地鼠巢穴', m: { mole: 3.2, goldS: 1.2 } },
    { name: '宝藏深处', m: { bag: 3.2, bone: 1.6, goldM: 1.2 } },
    { name: '深井', m: { rockL: 1.6, diamond: 1.7, goldL: 1.3 } }
  ];

  // 单次抓取耗时：抛绳 + 收绳（按重量）+ 摆钩等待
  function grabCost(it) {
    var d = dist(it.x, it.y, PIVOT_X, PIVOT_Y);
    var pull = Math.max(118, 900 / (it.weight + 0.5));
    return d / 1180 + d / pull + 0.55;
  }

  // 按「价值/耗时」贪心估算限时内能挖到的总价值（关卡目标的基准）
  function estIncome(items, time) {
    var cand = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type === 'tnt' || it.type === 'mole') continue;
      var val = it.type === 'bag' ? 190 : it.value;
      if (val < 30) continue;
      var cost = grabCost(it);
      cand.push({ v: val, c: cost, e: val / cost });
    }
    cand.sort(function (a, b) { return b.e - a.e; });
    var used = 0, sum = 0;
    for (var j = 0; j < cand.length; j++) {
      if (used + cand[j].c > time * 0.9) continue;
      used += cand[j].c;
      sum += cand[j].v;
    }
    return sum;
  }

  function generateLevel(n) {
    var rng = mulberry32(((n * 2654435761) >>> 0) ^ 0x9e3779b9);
    var ti = 0;
    if (n >= 3) ti = Math.floor(rng() * THEMES.length);
    var theme = THEMES[ti];

    var base = {
      goldS: 4.2,
      goldM: 3.0,
      goldL: 1.4 + n * 0.012,
      rockS: 1.3 + n * 0.05,
      rockL: 0.45 + n * 0.033,
      diamond: 0.7,
      bag: 0.65 + n * 0.012,
      bone: 0.8,
      tnt: n >= 4 ? 0.5 + n * 0.014 : 0,
      mole: n >= 7 ? 0.65 : 0,
      potion: n >= 9 ? 0.3 : 0
    };
    base.rockS = Math.min(base.rockS, 5.2);
    base.rockL = Math.min(base.rockL, 3.8);

    var keys = [];
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) keys.push(k);

    var weights = {};
    var total = 0;
    for (var i = 0; i < keys.length; i++) {
      var kk = keys[i];
      var mul = theme.m[kk];
      var wv = base[kk] * (mul === undefined ? 1 : mul);
      weights[kk] = wv;
      total += wv;
    }

    var count = Math.min(32, 13 + Math.floor(n * 0.62));
    var items = [];

    function pickType() {
      var r = rng() * total;
      for (var j = 0; j < keys.length; j++) {
        r -= weights[keys[j]];
        if (r <= 0) return keys[j];
      }
      return keys[keys.length - 1];
    }

    var tries = 0;
    while (items.length < count && tries < count * 60) {
      tries++;
      var type = pickType();
      var def = DEFS[type];
      var pos = placeSpot(rng, def.radius, items);
      if (!pos) continue;
      items.push(makeItem(type, pos.x, pos.y, rng));
    }

    // 保底：至少一颗钻石、一定有大金块
    var hasDiamond = false, hasLarge = false;
    for (var d = 0; d < items.length; d++) {
      if (items[d].type === 'diamond') hasDiamond = true;
      if (items[d].type === 'goldL') hasLarge = true;
    }
    if (!hasDiamond || !hasLarge) {
      for (var f = 0; f < 40; f++) {
        var want = !hasDiamond ? 'diamond' : 'goldL';
        var dpos = placeSpot(rng, DEFS[want].radius, items);
        if (dpos) {
          items.push(makeItem(want, dpos.x, dpos.y, rng));
          if (want === 'diamond') hasDiamond = true; else hasLarge = true;
          if (hasDiamond && hasLarge) break;
        }
      }
    }

    // 计算总价值
    var totalValue = 0;
    for (var v = 0; v < items.length; v++) {
      var it = items[v];
      totalValue += it.value > 0 ? it.value : 150;
    }

    var D = diff();
    var time = Math.round(clamp((66 - Math.floor(n / 9)) * D.time, 38, 84));
    var est = estIncome(items, time);
    var k = clamp(D.k0 + n * D.kk, D.k0, D.kcap);
    var goal = Math.max(320, Math.round(Math.min(est * k, totalValue * 0.92) / 10) * 10);

    return { items: items, goal: goal, time: time, theme: theme.name };
  }

  function placeSpot(rng, radius, items) {
    for (var t = 0; t < 60; t++) {
      var x = 62 + rng() * (W - 124);
      var y = ITEM_TOP + rng() * (ITEM_BOTTOM - ITEM_TOP);
      if (y > ITEM_BOTTOM - radius) y = ITEM_BOTTOM - radius;
      if (y < ITEM_TOP + radius * 0.2) y = ITEM_TOP + radius * 0.2;
      var ok = true;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var need = (radius + it.radius) * 0.86 + 4;
        if (dist(x, y, it.x, it.y) < need) { ok = false; break; }
      }
      if (ok) return { x: x, y: y };
    }
    return null;
  }

  function makeItem(type, x, y, rng) {
    var def = DEFS[type];
    var seed = Math.floor(rng() * 1000000) + 1;
    var it = {
      type: type,
      x: x, y: y,
      radius: def.radius,
      weight: def.weight,
      value: def.value,
      dead: false,
      seed: seed,
      rot: (rng() - 0.5) * 0.5,
      vx: 0,
      sprite: null
    };
    if (type === 'mole') {
      it.vx = (rng() > 0.5 ? 1 : -1) * (34 + rng() * 40);
      it.wobble = rng() * 6.28;
    }
    it.sprite = makeSprite(type, def.radius, seed);
    return it;
  }

  /* ---------------------------------------------------------
     8. 背景（每关缓存一张）
     --------------------------------------------------------- */
  function buildBackground(seed) {
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var g = c.getContext('2d');
    var rng = mulberry32(seed);

    // 天空（黄昏）
    var sky = g.createLinearGradient(0, 0, 0, GROUND_TOP);
    sky.addColorStop(0, '#131a2e');
    sky.addColorStop(0.42, '#3b3a56');
    sky.addColorStop(0.75, '#8a5f4a');
    sky.addColorStop(1, '#c98a55');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, GROUND_TOP + 4);

    // 星星
    for (var s = 0; s < 70; s++) {
      var sx = rng() * W, sy = rng() * GROUND_TOP * 0.62;
      var a = 0.15 + rng() * 0.7;
      g.fillStyle = 'rgba(255,250,230,' + a.toFixed(2) + ')';
      g.beginPath(); g.arc(sx, sy, rng() * 1.6 + 0.4, 0, Math.PI * 2); g.fill();
    }
    // 月亮
    var mg = g.createRadialGradient(W - 118, 196, 6, W - 118, 196, 78);
    mg.addColorStop(0, 'rgba(255,246,214,0.75)');
    mg.addColorStop(0.25, 'rgba(255,240,190,0.28)');
    mg.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = mg;
    g.beginPath(); g.arc(W - 118, 196, 78, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,250,226,0.85)';
    g.beginPath(); g.arc(W - 118, 196, 22, 0, Math.PI * 2); g.fill();

    // 暮色云层
    for (var cl = 0; cl < 9; cl++) {
      var cy2 = GROUND_TOP - 330 + rng() * 250;
      var cxw = 130 + rng() * 190;
      var chh = 12 + rng() * 16;
      var pal = ['rgba(255,186,140,', 'rgba(255,214,170,', 'rgba(210,160,160,'][Math.floor(rng() * 3)];
      var ga = (0.05 + rng() * 0.09).toFixed(3);
      var cg = g.createRadialGradient(W * rng(), cy2, 2, W * rng(), cy2, cxw);
      var cx0 = 60 + rng() * (W - 120);
      cg = g.createRadialGradient(cx0, cy2, 4, cx0, cy2, cxw);
      cg.addColorStop(0, pal + ga + ')');
      cg.addColorStop(1, pal + '0)');
      g.fillStyle = cg;
      g.beginPath();
      g.ellipse(cx0, cy2, cxw, chh, 0, 0, Math.PI * 2);
      g.fill();
    }

    // 远山
    function hills(baseY, amp, color) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, baseY);
      for (var x = 0; x <= W; x += 24) {
        var yy = baseY - Math.sin(x * 0.006 + seed * 0.01) * amp - Math.sin(x * 0.017) * amp * 0.5;
        g.lineTo(x, yy);
      }
      g.lineTo(W, GROUND_TOP); g.lineTo(0, GROUND_TOP);
      g.closePath();
      g.fill();
    }
    hills(GROUND_TOP - 26, 34, 'rgba(28,32,48,0.55)');
    hills(GROUND_TOP - 6, 20, 'rgba(18,20,32,0.8)');

    // 地表草地
    g.fillStyle = '#4b6b32';
    g.fillRect(0, GROUND_TOP - 8, W, 16);
    g.fillStyle = '#5d8340';
    g.beginPath();
    g.moveTo(0, GROUND_TOP - 6);
    for (var gx = 0; gx <= W; gx += 12) {
      g.lineTo(gx, GROUND_TOP - 6 - (Math.sin(gx * 0.11) * 4 + rng() * 5));
    }
    g.lineTo(W, GROUND_TOP + 6); g.lineTo(0, GROUND_TOP + 6);
    g.closePath();
    g.fill();

    // 泥土
    var dirt = g.createLinearGradient(0, GROUND_TOP, 0, H);
    dirt.addColorStop(0, '#8a5c34');
    dirt.addColorStop(0.16, '#71482a');
    dirt.addColorStop(0.55, '#4d2f1c');
    dirt.addColorStop(1, '#241408');
    g.fillStyle = dirt;
    g.fillRect(0, GROUND_TOP, W, H - GROUND_TOP);

    // 地层条纹
    for (var layer = 0; layer < 9; layer++) {
      var ly = GROUND_TOP + 40 + layer * ((H - GROUND_TOP) / 9) + rng() * 20;
      g.strokeStyle = 'rgba(0,0,0,' + (0.05 + rng() * 0.06).toFixed(2) + ')';
      g.lineWidth = 6 + rng() * 12;
      g.beginPath();
      g.moveTo(0, ly);
      for (var lx = 0; lx <= W; lx += 40) {
        g.lineTo(lx, ly + Math.sin(lx * 0.012 + layer) * 14);
      }
      g.stroke();
    }

    // 小石子
    for (var p = 0; p < 520; p++) {
      var px = rng() * W;
      var py = GROUND_TOP + 12 + rng() * (H - GROUND_TOP - 12);
      var pr = 1 + rng() * 3.4;
      var shade = 0.06 + rng() * 0.22;
      g.fillStyle = rng() > 0.5
        ? 'rgba(255,230,190,' + (shade * 0.55).toFixed(2) + ')'
        : 'rgba(0,0,0,' + shade.toFixed(2) + ')';
      g.beginPath();
      g.ellipse(px, py, pr, pr * 0.78, rng() * 3, 0, Math.PI * 2);
      g.fill();
    }

    // 树根（浅层、稀疏）
    for (var rt = 0; rt < 4; rt++) {
      var rx = 90 + rng() * (W - 180);
      g.strokeStyle = 'rgba(46,28,14,0.26)';
      g.lineWidth = 2 + rng() * 2.5;
      g.beginPath();
      g.moveTo(rx, GROUND_TOP - 2);
      var cy = GROUND_TOP;
      for (var seg = 0; seg < 3; seg++) {
        cy += 34 + rng() * 38;
        g.quadraticCurveTo(rx + (rng() - 0.5) * 60, cy - 26, rx + (rng() - 0.5) * 80, cy);
      }
      g.stroke();
    }

    // 顶部暗角
    var vig = g.createLinearGradient(0, GROUND_TOP, 0, GROUND_TOP + 70);
    vig.addColorStop(0, 'rgba(0,0,0,0.42)');
    vig.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vig;
    g.fillRect(0, GROUND_TOP, W, 70);

    return c;
  }

  /* ---------------------------------------------------------
     9. 核心逻辑
     --------------------------------------------------------- */
  function beginLevel() {
    var L = generateLevel(G.level);
    G.items = L.items;
    G.goal = L.goal;
    G.timeLimit = L.time + (G.buffs.clock ? 12 : 0);
    G.timeLeft = G.timeLimit;
    G.earnings = 0;
    G.theme = L.theme;
    G.hook = {
      state: 'swing',
      angle: MIN_ANGLE + 0.18,
      dir: 1,
      len: REST_LEN,
      swingSpeed: (0.95 + Math.min(0.92, G.level * 0.012)) * diff().swing,
      outSpeed: 0,
      pullSpeed: 0,
      item: null
    };
    G.particles = [];
    G.floats = [];
    G.shake = 0;
    G.strength = G.buffs.gloves ? 9999 : 0;
    G.lastTick = -1;
    bgSeed = G.level * 7919 + 13;
    G.bg = buildBackground(bgSeed);
    G.started = true;
    G.state = 'intro';
  }

  function startNewGame() {
    G.level = 1;
    G.wallet = 0;
    G.dynamite = 1;
    G.buffs = { gloves: false, luck: false, clock: false };
    beginLevel();
  }

  function continueGame() {
    G.level = save.level;
    G.wallet = save.wallet;
    G.dynamite = save.dynamite;
    G.buffs = { gloves: false, luck: false, clock: false };
    beginLevel();
  }

  function hookTip() {
    var h = G.hook;
    return {
      x: PIVOT_X + Math.cos(h.angle) * h.len,
      y: PIVOT_Y + Math.sin(h.angle) * h.len
    };
  }

  function pullSpeedFor(item) {
    var base = 900 / (item.weight + 0.5);
    if (base < 118) base = 118;
    if (G.strength > 0) base *= 1.9;
    return base;
  }

  function maxLenForAngle(a) {
    var dx = Math.cos(a), dy = Math.sin(a);
    var t = 4000;
    if (dx > 0.0001) t = Math.min(t, (W - 14 - PIVOT_X) / dx);
    if (dx < -0.0001) t = Math.min(t, (14 - PIVOT_X) / dx);
    if (dy > 0.0001) t = Math.min(t, (H - 26 - PIVOT_Y) / dy);
    return Math.max(120, t);
  }

  function shoot() {
    var h = G.hook;
    if (!h || h.state !== 'swing') return;
    h.state = 'shoot';
    h.outSpeed = 1180;
    h.maxLen = maxLenForAngle(h.angle);
    sfx.shoot();
  }

  function updateHook(dt) {
    var h = G.hook;
    if (!h) return;

    if (h.state === 'swing') {
      h.angle += h.dir * h.swingSpeed * dt;
      if (h.angle >= MAX_ANGLE) { h.angle = MAX_ANGLE; h.dir = -1; }
      if (h.angle <= MIN_ANGLE) { h.angle = MIN_ANGLE; h.dir = 1; }
    } else if (h.state === 'shoot') {
      h.len += h.outSpeed * dt;
      var tip = hookTip();
      var hit = findHit(tip.x, tip.y);
      if (hit) {
        attachItem(hit);
      } else if (h.len >= (h.maxLen || MAX_LEN)) {
        h.len = h.maxLen || MAX_LEN;
        h.state = 'pull';
        h.item = null;
        h.pullSpeed = 1900;
      }
    } else if (h.state === 'pull') {
      h.len -= h.pullSpeed * dt;
      if (h.len <= REST_LEN) {
        h.len = REST_LEN;
        if (h.item) collectItem(h.item);
        h.item = null;
        h.state = 'swing';
        checkClear();
      }
    }

    if (h.item && !h.item.dead) {
      var t2 = hookTip();
      h.item.x = t2.x + Math.cos(h.angle) * h.item.radius * 0.42;
      h.item.y = t2.y + Math.sin(h.angle) * h.item.radius * 0.42;
    }
  }

  function findHit(tx, ty) {
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (it.dead) continue;
      var rad = it.radius * 0.9;
      if (dist(tx, ty, it.x, it.y) < rad + 8) return it;
    }
    return null;
  }

  function attachItem(item) {
    var h = G.hook;
    if (item.type === 'tnt') {
      item.dead = true;
      removeItem(item);
      explodeAt(item.x, item.y);
      h.state = 'pull';
      h.item = null;
      h.pullSpeed = 1900;
      return;
    }
    if (item.type === 'potion') {
      item.dead = true;
      removeItem(item);
      G.strength = Math.max(G.strength, 9);
      addFloat(item.x, item.y, '力量提升!', '#9ef7c8');
      sfx.big();
      h.state = 'pull';
      h.item = null;
      h.pullSpeed = 1900;
      return;
    }
    h.item = item;
    h.state = 'pull';
    h.pullSpeed = pullSpeedFor(item);
    sfx.grap();
  }

  function removeItem(item) {
    var idx = G.items.indexOf(item);
    if (idx >= 0) G.items.splice(idx, 1);
  }

  function collectItem(item) {
    if (item.dead) return;
    item.dead = true;
    removeItem(item);

    if (item.type === 'bag') {
      openBag(item);
      return;
    }
    var label = null;
    if (item.type === 'diamond') label = '钻石!';
    if (item.type === 'bone') label = '骨头...';
    award(item.value, item.x, item.y, label);
    if (item.type === 'rockS' || item.type === 'rockL') {
      for (var i = 0; i < 8; i++) spawnParticle(item.x, item.y, 'rock');
    }
    if (item.type === 'mole') {
      addFloat(item.x, item.y - 44, '抓住地鼠!', '#ffd0a0');
    }
    if (item.type === 'diamond') {
      sfx.big();
      for (var k = 0; k < 16; k++) spawnParticle(item.x, item.y, 'spark');
    }
  }

  function openBag(item) {
    var r = Math.random();
    if (r < 0.40) {
      var v = 40 + Math.floor(Math.random() * 24) * 10;
      addFloat(item.x, item.y - 30, '一袋金币', '#ffe06a');
      award(v, item.x, item.y, null);
    } else if (r < 0.58) {
      addFloat(item.x, item.y - 30, '钻石!', '#aef2ff');
      award(650, item.x, item.y, null);
      sfx.big();
      for (var i = 0; i < 18; i++) spawnParticle(item.x, item.y, 'spark');
    } else if (r < 0.70) {
      G.dynamite++;
      addFloat(item.x, item.y - 30, '炸药 +1', '#ff9a6a');
      sfx.buy();
    } else if (r < 0.82) {
      G.strength = Math.max(G.strength, 8);
      addFloat(item.x, item.y - 30, '力量提升!', '#9ef7c8');
      sfx.ready();
    } else if (r < 0.93) {
      addFloat(item.x, item.y - 30, '是炸弹!', '#ff7a5a');
      explodeAt(item.x, item.y);
    } else {
      addFloat(item.x, item.y - 30, '大金块!', '#ffe06a');
      award(1000, item.x, item.y, null);
      sfx.big();
    }
  }

  function award(v, x, y, label) {
    if (v <= 0) return;
    var mult = G.buffs.luck ? 1.25 : 1;
    var amount = Math.round(v * mult);
    G.earnings += amount;
    G.wallet += amount;
    addFloat(x, y - 34, '+$' + fmt(amount), '#ffe066');
    if (label) addFloat(x, y - 66, label, '#ffffff');
    for (var i = 0; i < 7; i++) spawnParticle(x, y, 'spark');
    sfx.coin(amount);
  }

  function explodeAt(x, y) {
    G.shake = 18;
    sfx.tnt();
    for (var i = 0; i < 34; i++) spawnParticle(x, y, 'fire');
    var keep = [];
    for (var j = 0; j < G.items.length; j++) {
      var it = G.items[j];
      if (it.dead) continue;
      if (dist(it.x, it.y, x, y) < 190 + it.radius * 0.5) {
        it.dead = true;
        for (var k = 0; k < 5; k++) spawnParticle(it.x, it.y, 'rock');
      } else {
        keep.push(it);
      }
    }
    G.items = keep;
  }

  function useDynamite() {
    if (G.state !== 'playing') return;
    var h = G.hook;
    if (!h) return;
    if (G.dynamite <= 0) {
      addFloat(PIVOT_X, 340, '没有炸药了', '#ff8f6a');
      return;
    }
    if (h.state === 'pull' && h.item && !h.item.dead) {
      if (h.item.weight < 2.0) {
        addFloat(h.item.x, h.item.y - 40, '这个不用炸', '#ffd0a0');
        return;
      }
      var it = h.item;
      G.dynamite--;
      h.item = null;
      it.dead = true;
      removeItem(it);
      explodeAt(it.x, it.y);
      h.pullSpeed = 1900;
      checkClear();
    }
  }

  function checkClear() {
    if (G.state !== 'playing') return;
    if (G.items.length === 0) {
      if (G.earnings >= G.goal) finishLevel(true);
      else finishLevel(false);
    }
  }

  function finishLevel(win) {
    var h = G.hook;
    if (h) { h.state = 'swing'; h.item = null; h.len = REST_LEN; }
    if (win) {
      var bonus = Math.max(0, Math.ceil(G.timeLeft)) * 3;
      G.wallet += bonus;
      G.completeInfo = { bonus: bonus, earned: G.earnings };
      G.state = 'complete';
      sfx.win();
      if (G.level >= TOTAL_LEVELS) G.state = 'finished';
      persist();
    } else {
      G.state = 'failed';
      sfx.fail();
      persist();
    }
  }

  function updateItems(dt) {
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (it.type === 'mole' && G.hook && G.hook.item !== it) {
        it.x += it.vx * dt;
        if (it.x < 70) { it.x = 70; it.vx = Math.abs(it.vx); }
        if (it.x > W - 70) { it.x = W - 70; it.vx = -Math.abs(it.vx); }
        it.wobble += dt * 6;
      }
    }
  }

  function spawnParticle(x, y, kind) {
    if (G.particles.length > 320) return;
    var a = Math.random() * Math.PI * 2;
    var sp = 0;
    var p = { x: x, y: y, kind: kind, life: 1, max: 1, size: 3, vx: 0, vy: 0, color: '#fff' };
    if (kind === 'spark') {
      sp = 60 + Math.random() * 180;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 60;
      p.size = 2 + Math.random() * 3;
      p.life = 0.55 + Math.random() * 0.4;
      p.color = Math.random() > 0.4 ? '#ffe66a' : '#fffbe0';
    } else if (kind === 'rock') {
      sp = 40 + Math.random() * 130;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 90;
      p.size = 3 + Math.random() * 5;
      p.life = 0.6 + Math.random() * 0.4;
      p.color = Math.random() > 0.5 ? '#8b939b' : '#5b636b';
    } else {
      sp = 80 + Math.random() * 300;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.size = 5 + Math.random() * 10;
      p.life = 0.35 + Math.random() * 0.35;
      p.color = Math.random() > 0.5 ? '#ffca4a' : (Math.random() > 0.5 ? '#ff7a20' : '#ffe9a0');
    }
    p.max = p.life;
    G.particles.push(p);
  }

  function addFloat(x, y, text, color) {
    G.floats.push({ x: x, y: y, text: text, life: 1.25, max: 1.25, color: color || '#fff' });
  }

  function updateParticles(dt) {
    var i;
    for (i = G.particles.length - 1; i >= 0; i--) {
      var p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === 'fire' ? 120 : 620) * dt;
      p.vx *= (1 - 1.6 * dt);
    }
    for (i = G.floats.length - 1; i >= 0; i--) {
      var f = G.floats[i];
      f.life -= dt;
      f.y -= 60 * dt;
      if (f.life <= 0) G.floats.splice(i, 1);
    }
  }

  function update(dt) {
    G.t += dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 60);

    if (G.state === 'playing') {
      if (G.strength > 0 && G.strength < 1000) G.strength -= dt;
      G.timeLeft -= dt;
      if (G.timeLeft <= 5.999 && G.timeLeft > 0) {
        var sec = Math.ceil(G.timeLeft);
        if (sec !== G.lastTick) { G.lastTick = sec; sfx.tick(); }
      }
      if (G.timeLeft <= 0) {
        G.timeLeft = 0;
        finishLevel(G.earnings >= G.goal);
      }
      updateHook(dt);
      updateItems(dt);
      if (G.items.length === 0) checkClear();
    }
    updateParticles(dt);
  }

  /* ---------------------------------------------------------
     10. 绘制：矿工 / 绳子 / 钩子
     --------------------------------------------------------- */
  function drawMiner() {
    var h = G.hook;
    var shooting = h && (h.state === 'shoot' || h.state === 'pull');
    var bob = Math.sin(G.t * 2.2) * 1.6;
    var lean = 0;
    if (h) lean = clamp((Math.cos(h.angle)) * 0.06, -0.06, 0.06);

    ctx.save();
    ctx.translate(PIVOT_X, GROUND_TOP + 8);
    ctx.rotate(lean);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 62, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    var yb = -6 + bob;

    // 腿
    ctx.fillStyle = '#2b3a55';
    rr(ctx, -26, yb - 42, 20, 44, 9); ctx.fill();
    rr(ctx, 6, yb - 42, 20, 44, 9); ctx.fill();
    // 靴子
    ctx.fillStyle = '#3a2517';
    rr(ctx, -30, yb - 10, 26, 14, 6); ctx.fill();
    rr(ctx, 4, yb - 10, 26, 14, 6); ctx.fill();

    // 身体（工装裤 + 衬衫）
    ctx.fillStyle = '#c0392b';
    rr(ctx, -34, yb - 96, 68, 58, 16); ctx.fill();
    // 背带裤
    ctx.fillStyle = '#2f5d8a';
    rr(ctx, -34, yb - 62, 68, 30, 10); ctx.fill();
    ctx.fillStyle = '#2f5d8a';
    rr(ctx, -28, yb - 96, 14, 40, 6); ctx.fill();
    rr(ctx, 14, yb - 96, 14, 40, 6); ctx.fill();
    // 纽扣
    ctx.fillStyle = '#f2c85b';
    ctx.beginPath(); ctx.arc(-21, yb - 66, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(21, yb - 66, 3.4, 0, Math.PI * 2); ctx.fill();

    // 手臂（握住绞盘）
    var handX = 2, handY = yb - 78;
    if (shooting) { handX = -2; handY = yb - 84; }
    ctx.strokeStyle = '#b8342a';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(24, yb - 94);
    ctx.quadraticCurveTo(18, yb - 96, handX + 6, handY);
    ctx.stroke();
    // 手
    ctx.fillStyle = '#e8b98f';
    ctx.beginPath(); ctx.arc(handX + 2, handY, 9, 0, Math.PI * 2); ctx.fill();

    // 头
    var hy = yb - 128;
    ctx.fillStyle = '#e8b98f';
    ctx.beginPath(); ctx.arc(0, hy, 30, 0, Math.PI * 2); ctx.fill();
    // 胡子
    ctx.fillStyle = '#6b4a2f';
    ctx.beginPath();
    ctx.ellipse(0, hy + 16, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#241a12';
    ctx.beginPath(); ctx.arc(-11, hy - 2, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(11, hy - 2, 3.6, 0, Math.PI * 2); ctx.fill();
    // 腮红
    ctx.fillStyle = 'rgba(214,120,100,0.35)';
    ctx.beginPath(); ctx.ellipse(-19, hy + 8, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(19, hy + 8, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 安全帽
    ctx.fillStyle = '#f5c518';
    ctx.beginPath();
    ctx.arc(0, hy - 8, 32, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9a800';
    rr(ctx, -36, hy - 12, 72, 10, 5); ctx.fill();
    // 帽灯
    var lg = ctx.createRadialGradient(0, hy - 34, 2, 0, hy - 34, 16);
    lg.addColorStop(0, 'rgba(255,255,220,1)');
    lg.addColorStop(1, 'rgba(255,240,150,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(0, hy - 34, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8c0';
    ctx.beginPath(); ctx.arc(0, hy - 32, 6, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // 绞盘
    ctx.save();
    ctx.translate(PIVOT_X, PIVOT_Y);
    var rot = G.hook ? (G.hook.len - REST_LEN) * 0.02 : 0;
    ctx.rotate(rot);
    ctx.fillStyle = '#5d6672';
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8d97a3';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#39424c';
    ctx.lineWidth = 3;
    for (var s = 0; s < 4; s++) {
      var a = (s / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
      ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
      ctx.stroke();
    }
    ctx.fillStyle = '#c9d2dc';
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawRope() {
    var h = G.hook;
    if (!h) return;
    var tip = hookTip();

    // 影子
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(PIVOT_X + 3, PIVOT_Y + 4);
    ctx.lineTo(tip.x + 3, tip.y + 4);
    ctx.stroke();

    // 绳
    var grd = ctx.createLinearGradient(PIVOT_X, PIVOT_Y, tip.x, tip.y);
    grd.addColorStop(0, '#f7e7bd');
    grd.addColorStop(0.5, '#d8bd84');
    grd.addColorStop(1, '#b2945c');
    ctx.strokeStyle = grd;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(PIVOT_X, PIVOT_Y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();

    // 绳纹
    var dx = tip.x - PIVOT_X, dy = tip.y - PIVOT_Y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > 4) {
      var ux = dx / len, uy = dy / len;
      ctx.strokeStyle = 'rgba(120,95,55,0.45)';
      ctx.lineWidth = 6;
      var step = 20;
      for (var d = 12; d < len - 6; d += step) {
        var px = PIVOT_X + ux * d, py = PIVOT_Y + uy * d;
        ctx.beginPath();
        ctx.moveTo(px - uy * 3.4, py + ux * 3.4);
        ctx.lineTo(px + uy * 3.4, py - ux * 3.4);
        ctx.stroke();
      }
    }

    drawHook(tip.x, tip.y, h.angle);
  }

  function drawHook(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle - Math.PI / 2);
    var mg = ctx.createLinearGradient(-14, 0, 14, 0);
    mg.addColorStop(0, '#8e99a5');
    mg.addColorStop(0.4, '#e6edf5');
    mg.addColorStop(0.7, '#9aa6b3');
    mg.addColorStop(1, '#5d6670');
    ctx.strokeStyle = mg;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    // 主体
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 6);
    ctx.stroke();
    // 左右爪
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(-16, 12, -14, 26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(16, 12, 14, 26);
    ctx.stroke();
    // 关节
    ctx.fillStyle = '#cbd5e0';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawItems() {
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (it.dead) continue;
      var sp = it.sprite;
      var wob = 0;
      if (it.type === 'mole') wob = Math.sin(it.wobble) * 0.06;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot + wob);
      ctx.drawImage(sp.canvas, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      var a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'fire') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.8), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    for (var i = 0; i < G.floats.length; i++) {
      var f = G.floats[i];
      var a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'bold 30px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------
     11. UI 组件
     --------------------------------------------------------- */
  function text(str, x, y, size, color, align, weight, shadow) {
    ctx.font = (weight || 'bold') + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(str, x + 2, y + 2);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function pill(x, y, w, h, fill, stroke, rad) {
    rr(ctx, x, y, w, h, rad === undefined ? 18 : rad);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function button(x, y, w, h, label, action, opt) {
    opt = opt || {};
    var pressed = false;
    var base = opt.color || '#f0b429';
    var dark = opt.dark || '#a8741a';
    var rad = opt.rad === undefined ? 18 : opt.rad;

    // 底部厚度
    rr(ctx, x, y + 5, w, h, rad);
    ctx.fillStyle = opt.shadow || 'rgba(0,0,0,0.45)';
    ctx.fill();

    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, base);
    g.addColorStop(1, dark);
    rr(ctx, x, y, w, h, rad);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    var fs = opt.fontSize || Math.min(30, h * 0.42);
    text(label, x + w / 2, y + h / 2 + 1, fs, opt.textColor || '#3a2405', 'center', 'bold', false);
    if (opt.sub) {
      text(opt.sub, x + w / 2, y + h / 2 + fs * 0.72, fs * 0.5, 'rgba(60,36,5,0.75)', 'center', 'bold');
    }

    if (!opt.disabled) {
      hitAreas.push({ x: x, y: y, w: w, h: h, action: action });
    } else {
      ctx.save();
      ctx.globalAlpha = 0;
      ctx.restore();
    }
    if (opt.disabled) {
      rr(ctx, x, y, w, h, rad);
      ctx.fillStyle = 'rgba(20,16,10,0.55)';
      ctx.fill();
    }
  }

  function iconBg(x, y, w, h, action, active) {
    pill(x, y, w, h, active ? 'rgba(240,180,41,0.28)' : 'rgba(16,12,8,0.62)', 'rgba(255,214,110,0.35)', 20);
    if (action) hitAreas.push({ x: x, y: y, w: w, h: h, action: action });
  }

  /* ---------------------------------------------------------
     12. HUD
     --------------------------------------------------------- */
  function drawHUD() {
    // 关卡
    pill(20, 20, 152, 62, 'rgba(14,10,6,0.72)', 'rgba(255,208,84,0.4)', 20);
    text('第 ' + G.level + ' 关', 96, 44, 24, '#ffd95e', 'center');
    text('共 ' + TOTAL_LEVELS + ' 关', 96, 68, 13, 'rgba(255,255,255,0.45)', 'center');

    // 计时
    var tcol = G.timeLeft <= 10 ? '#ff6b5a' : '#ffffff';
    pill(262, 20, 150, 62, 'rgba(14,10,6,0.72)', G.timeLeft <= 10 ? 'rgba(255,90,70,0.7)' : 'rgba(255,255,255,0.18)', 20);
    // 沙漏
    ctx.save();
    ctx.translate(292, 51);
    ctx.strokeStyle = tcol;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-7, -11); ctx.lineTo(7, -11);
    ctx.lineTo(-7, 11); ctx.lineTo(7, 11);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = tcol;
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(-5, -9); ctx.lineTo(5, -9); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
    var tsec = Math.ceil(G.timeLeft);
    var pulse = 1;
    if (G.timeLeft <= 10) pulse = 1 + Math.sin(G.t * 12) * 0.06;
    ctx.save();
    ctx.translate(340, 51);
    ctx.scale(pulse, pulse);
    text(String(tsec), 0, 0, 28, tcol, 'center');
    ctx.restore();

    // 金钱 / 目标
    pill(428, 20, 272, 62, 'rgba(14,10,6,0.72)', 'rgba(255,208,84,0.4)', 20);
    text('$' + fmt(G.earnings), 444, 42, 24, '#ffe066', 'left');
    text('目标 $' + fmt(G.goal), 444, 66, 13, 'rgba(255,255,255,0.5)', 'left');
    // 达标标记
    if (G.earnings >= G.goal) {
      text('✓', 682, 42, 26, '#6ef08a', 'right');
    }

    // 进度条
    var bw = 680;
    pill(20, 92, bw, 12, 'rgba(0,0,0,0.55)', 'rgba(255,255,255,0.12)', 6);
    var pr = clamp(G.earnings / Math.max(1, G.goal), 0, 1);
    if (pr > 0.005) {
      var pg = ctx.createLinearGradient(20, 0, 20 + bw, 0);
      pg.addColorStop(0, '#ffcf3f');
      pg.addColorStop(1, pr >= 1 ? '#6ef08a' : '#ff9a2e');
      rr(ctx, 20, 92, Math.max(12, bw * pr), 12, 6);
      ctx.fillStyle = pg;
      ctx.fill();
    }

    // 底部按钮
    var by = BTN_Y;
    // 炸药
    iconBg(24, by, 150, 86, useDynamite, G.dynamite > 0);
    ctx.save();
    ctx.translate(74, by + 46);
    ctx.scale(0.72, 0.72);
    drawTNT(ctx, 30, mulberry32(7));
    ctx.restore();
    text('x' + G.dynamite, 120, by + 46, 26,
      G.dynamite > 0 ? '#ffd95e' : 'rgba(255,255,255,0.25)', 'left');

    // 力量
    var strengthActive = G.strength > 0;
    iconBg(182, by, 150, 86, null, strengthActive);
    ctx.save();
    ctx.translate(232, by + 44);
    ctx.scale(0.74, 0.74);
    drawPotion(ctx, 28, mulberry32(3));
    ctx.restore();
    var sTxt = (strengthActive && G.strength < 1000) ? (Math.ceil(G.strength) + 's')
      : (G.buffs.gloves ? '手套' : '—');
    var sCol = (strengthActive || G.buffs.gloves) ? '#9ef7c8' : 'rgba(255,255,255,0.3)';
    text(sTxt, 272, by + 46, 24, sCol, 'left');

    // 音效
    iconBg(512, by, 86, 86, function () { muted = !muted; }, false);
    drawSpeaker(555, by + 43, !muted);

    // 暂停
    iconBg(610, by, 86, 86, function () { if (G.state === 'playing') G.state = 'paused'; }, false);
    ctx.fillStyle = '#ffd95e';
    rr(ctx, 638, by + 30, 9, 28, 4); ctx.fill();
    rr(ctx, 659, by + 30, 9, 28, 4); ctx.fill();
  }

  function drawSpeaker(cx, cy, on) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = on ? '#ffd95e' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(-13, -6);
    ctx.lineTo(-5, -6);
    ctx.lineTo(4, -14);
    ctx.lineTo(4, 14);
    ctx.lineTo(-5, 6);
    ctx.lineTo(-13, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = on ? 'rgba(255,217,94,0.9)' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2.6;
    if (on) {
      ctx.beginPath(); ctx.arc(6, 0, 9, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(6, 0, 15, -0.9, 0.9); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(10, -9); ctx.lineTo(22, 9);
      ctx.moveTo(22, -9); ctx.lineTo(10, 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------
     13. 覆盖层
     --------------------------------------------------------- */
  function overlay(alpha) {
    ctx.fillStyle = 'rgba(6,4,2,' + (alpha === undefined ? 0.78 : alpha) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  function panel(y, h) {
    var x = 50, w = W - 100;
    rr(ctx, x, y, w, h, 34);
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#3a2a18');
    g.addColorStop(1, '#221609');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,208,96,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    return { x: x, y: y, w: w, h: h };
  }

  /* ---------------- 主菜单背景 ---------------- */
  var menuDecor = null;

  function initMenuDecor() {
    menuDecor = [];
    var rng = mulberry32(20261113);
    var types = ['goldM', 'goldS', 'goldL', 'diamond', 'goldS', 'goldM', 'bone'];
    for (var i = 0; i < 7; i++) {
      var it = makeItem(types[i], 0, 0, rng);
      menuDecor.push({
        sprite: it.sprite,
        fx: 0.08 + rng() * 0.84,
        fy: rng(),
        rot: (rng() - 0.5) * 0.9,
        ph: rng() * 6.28,
        sc: 0.7 + rng() * 0.55
      });
    }
  }

  function drawMenuBg() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1220');
    g.addColorStop(0.34, '#20222f');
    g.addColorStop(0.62, '#3a2a1c');
    g.addColorStop(1, '#150e08');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 星点
    var rng = mulberry32(7788);
    for (var i = 0; i < 90; i++) {
      var sx = rng() * W, sy = rng() * H * 0.6;
      ctx.fillStyle = 'rgba(255,248,220,' + (0.06 + rng() * 0.35).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, 0.6 + rng() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 底部金色光晕
    var glow = ctx.createRadialGradient(W / 2, H * 0.96, 20, W / 2, H * 0.96, W * 0.9);
    glow.addColorStop(0, 'rgba(255,176,48,0.24)');
    glow.addColorStop(0.5, 'rgba(200,120,20,0.08)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, H * 0.45, W, H * 0.55);

    if (!menuDecor) initMenuDecor();
    for (var k = 0; k < menuDecor.length; k++) {
      var d = menuDecor[k];
      var x = d.fx * W;
      var y = H * 0.74 + d.fy * H * 0.19 + Math.sin(G.t * 0.7 + d.ph) * 8;
      var sz = d.sprite.size * d.sc;
      ctx.save();
      var dg = ctx.createRadialGradient(x, y, sz * 0.15, x, y, sz * 0.75);
      dg.addColorStop(0, 'rgba(255,196,70,0.16)');
      dg.addColorStop(1, 'rgba(255,196,70,0)');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(x, y, sz * 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.62;
      ctx.translate(x, y);
      ctx.rotate(d.rot + Math.sin(G.t * 0.5 + d.ph) * 0.05);
      ctx.drawImage(d.sprite.canvas, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }

    // 暗角
    var vig = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.18, W / 2, H * 0.5, H * 0.86);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  function drawMenu() {
    overlay(0.28);

    // 标题
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var my = clamp((H - 1280) * 0.42, 0, 140);
    var ty = 250 + my + Math.sin(G.t * 1.6) * 6;
    ctx.font = 'bold 84px ' + FONT;
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#3a2100';
    ctx.strokeText('黄金矿工', W / 2, ty);
    var tg = ctx.createLinearGradient(0, ty - 50, 0, ty + 50);
    tg.addColorStop(0, '#fff3b0');
    tg.addColorStop(0.45, '#ffcf3f');
    tg.addColorStop(1, '#d98708');
    ctx.fillStyle = tg;
    ctx.fillText('黄金矿工', W / 2, ty);

    ctx.font = 'bold 22px ' + FONT;
    ctx.fillStyle = 'rgba(255,232,170,0.55)';
    ctx.fillText('G O L D   M I N E R', W / 2, ty + 66);
    ctx.restore();

    var by = 620;

    // 难度选择（标题正下方）
    var cy = ty + 138;
    text('难 度', W / 2, cy - 26, 17, 'rgba(255,255,255,0.42)', 'center');
    (function () {
      var cw = 132, chh = 58, gap = 12;
      var rowW = cw * 3 + gap * 2;
      var x0 = (W - rowW) / 2;
      for (var i = 0; i < DIFFS.length; i++) {
        (function (idx) {
          var x = x0 + idx * (cw + gap);
          var on = idx === DIFF_INDEX;
          rr(ctx, x, cy, cw, chh, 15);
          ctx.fillStyle = on ? 'rgba(255,199,68,0.94)' : 'rgba(16,12,8,0.5)';
          ctx.fill();
          ctx.strokeStyle = on ? 'rgba(255,240,190,0.9)' : 'rgba(255,255,255,0.16)';
          ctx.lineWidth = on ? 2.5 : 1.5;
          ctx.stroke();
          text(DIFFS[idx].name, x + cw / 2, cy + chh / 2 + 1, 25,
            on ? '#3a2405' : 'rgba(255,255,255,0.6)', 'center', 'bold');
          hitAreas.push({ x: x, y: cy, w: cw, h: chh, action: function () { setDifficulty(idx); } });
        })(i);
      }
    })();

    if (save.hasSave) {
      button(150, by, 420, 96, '继续第 ' + save.level + ' 关', function () {
        audioInit(); continueGame();
      }, { sub: '金币 $' + fmt(save.wallet) });
      button(150, by + 122, 420, 86, '重新开始', function () {
        audioInit(); startNewGame();
      }, { color: '#7d8b99', dark: '#4d5866', textColor: '#f2f6fa', fontSize: 28 });
    } else {
      button(150, by + 40, 420, 104, '开 始 游 戏', function () {
        audioInit(); startNewGame();
      }, { fontSize: 36 });
    }

    text('共 ' + TOTAL_LEVELS + ' 个关卡', W / 2, by + 268, 20, 'rgba(255,255,255,0.5)', 'center');
    text('点击屏幕放下钩子，抓取黄金与钻石', W / 2, by + 306, 18, 'rgba(255,255,255,0.38)', 'center');
    text('石头又重又不值钱，别浪费绳子和时间', W / 2, by + 338, 18, 'rgba(255,255,255,0.38)', 'center');
    text(diff().desc, W / 2, by + 378, 18, 'rgba(255,214,120,0.66)', 'center');

    if (save.best > 1) {
      text('最高纪录：第 ' + save.best + ' 关', W / 2, by + 420, 18, 'rgba(255,215,110,0.7)', 'center');
    }

    // 版本号：方便确认装的是不是最新构建
    text('v1.1', 26, H - 30, 14, 'rgba(255,255,255,0.22)', 'left');
  }

  function drawIntro() {
    overlay(0.72);
    var p = panel(Math.round((H - 620) / 2), 620);
    text('第 ' + G.level + ' 关', W / 2, p.y + 76, 52, '#ffd95e', 'center');

    // 主题标签
    var tw = 210;
    pill(W / 2 - tw / 2, p.y + 120, tw, 44, 'rgba(255,208,84,0.16)', 'rgba(255,208,84,0.5)', 22);
    text(G.theme, W / 2, p.y + 142, 22, '#ffe9a8', 'center');
    text(diff().name + '难度', W / 2, p.y + 190, 17, 'rgba(255,255,255,0.4)', 'center');

    // 目标 / 时间
    var rowY = p.y + 226;
    text('目标', W / 2 - 130, rowY, 20, 'rgba(255,255,255,0.55)', 'center');
    text('$' + fmt(G.goal), W / 2 - 130, rowY + 44, 40, '#ffe066', 'center');

    text('限时', W / 2 + 130, rowY, 20, 'rgba(255,255,255,0.55)', 'center');
    text(G.timeLimit + 's', W / 2 + 130, rowY + 44, 40, '#ffffff', 'center');

    // 加成
    var buffs = [];
    if (G.buffs.gloves) buffs.push('强力手套');
    if (G.buffs.luck) buffs.push('幸运星');
    if (G.buffs.clock) buffs.push('怀表 +12s');
    if (buffs.length) {
      text('加成：' + buffs.join(' · '), W / 2, p.y + 372, 20, '#9ef7c8', 'center');
    }

    text('提示：石头很重，钻石值 650', W / 2, p.y + 430, 17, 'rgba(255,255,255,0.42)', 'center');

    button(150, p.y + 470, 420, 92, '开 始 挖 掘', function () {
      G.state = 'playing';
      G.playStart = G.t;
      sfx.ready();
    }, { fontSize: 32 });
  }

  function drawComplete() {
    overlay(0.75);
    var p = panel(Math.round((H - 660) / 2), 660);
    text('通 关 !', W / 2, p.y + 92, 56, '#6ef08a', 'center');

    var info = G.completeInfo || { bonus: 0, earned: 0 };
    text('本关收入', W / 2 - 130, p.y + 190, 20, 'rgba(255,255,255,0.5)', 'center');
    text('$' + fmt(info.earned), W / 2 - 130, p.y + 228, 34, '#ffe066', 'center');

    text('时间奖励', W / 2 + 130, p.y + 190, 20, 'rgba(255,255,255,0.5)', 'center');
    text('+$' + fmt(info.bonus), W / 2 + 130, p.y + 228, 34, '#9ef7c8', 'center');

    pill(90, p.y + 268, W - 180, 4, 'rgba(255,255,255,0.14)', null, 2);

    text('钱包', W / 2 - 80, p.y + 326, 22, 'rgba(255,255,255,0.6)', 'center');
    text('$' + fmt(G.wallet), W / 2 + 80, p.y + 326, 30, '#ffe066', 'center');

    button(150, p.y + 420, 420, 96, '进 入 商 店', function () {
      G.state = 'shop';
      sfx.buy();
    }, { fontSize: 30 });

    text('下一关：第 ' + (G.level + 1) + ' 关', W / 2, p.y + 570, 20, 'rgba(255,255,255,0.42)', 'center');
  }

  var SHOP = [
    { id: 'dyn', name: '炸药', desc: '立即炸掉钩住的石块', price: 130, max: 5 },
    { id: 'glove', name: '强力手套', desc: '下一关收绳速度 +90%', price: 200 },
    { id: 'luck', name: '幸运星', desc: '下一关收益 +25%', price: 240 },
    { id: 'clock', name: '怀表', desc: '下一关时间 +12 秒', price: 160 }
  ];

  function buy(id) {
    if (id === 'dyn') {
      if (G.wallet < 130 || G.dynamite >= 5) return;
      G.wallet -= 130; G.dynamite++;
    } else if (id === 'glove') {
      if (G.wallet < 200 || G.buffs.gloves) return;
      G.wallet -= 200; G.buffs.gloves = true;
    } else if (id === 'luck') {
      if (G.wallet < 240 || G.buffs.luck) return;
      G.wallet -= 240; G.buffs.luck = true;
    } else if (id === 'clock') {
      if (G.wallet < 160 || G.buffs.clock) return;
      G.wallet -= 160; G.buffs.clock = true;
    }
    sfx.buy();
    persist();
  }

  function drawShop() {
    overlay(0.86);
    var p = panel(Math.round((H - 820) / 2), 820);
    text('矿 山 商 店', W / 2, p.y + 66, 40, '#ffd95e', 'center');
    text('选购道具，为下一关做准备', W / 2, p.y + 106, 17, 'rgba(255,255,255,0.45)', 'center');

    pill(200, p.y + 130, 320, 46, 'rgba(0,0,0,0.4)', 'rgba(255,208,84,0.35)', 23);
    text('钱包  $' + fmt(G.wallet), W / 2, p.y + 154, 22, '#ffe066', 'center');

    for (var i = 0; i < SHOP.length; i++) {
      var s = SHOP[i];
      var ry = p.y + 200 + i * 126;
      pill(80, ry, 560, 112, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.12)', 22);

      // 图标
      ctx.save();
      ctx.translate(140, ry + 56);
      ctx.scale(0.72, 0.72);
      if (s.id === 'dyn') drawTNT(ctx, 30, mulberry32(11));
      else if (s.id === 'glove') drawGlove(ctx);
      else if (s.id === 'luck') drawStar(ctx);
      else drawWatch(ctx);
      ctx.restore();

      text(s.name, 196, ry + 40, 24, '#ffe9a8', 'left');
      text(s.desc, 196, ry + 74, 15, 'rgba(255,255,255,0.45)', 'left');

      var owned = (s.id === 'glove' && G.buffs.gloves) || (s.id === 'luck' && G.buffs.luck) || (s.id === 'clock' && G.buffs.clock);
      var full = s.id === 'dyn' && G.dynamite >= 5;
      var canBuy = !owned && !full && G.wallet >= s.price;

      if (owned) {
        pill(470, ry + 26, 148, 60, 'rgba(110,240,138,0.16)', 'rgba(110,240,138,0.5)', 16);
        text('已购买', 544, ry + 56, 20, '#6ef08a', 'center');
      } else if (full) {
        pill(470, ry + 26, 148, 60, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.2)', 16);
        text('已满', 544, ry + 56, 20, 'rgba(255,255,255,0.4)', 'center');
      } else {
        (function (sid) {
          button(470, ry + 26, 148, 60, '$' + s.price, function () { buy(sid); }, {
            color: canBuy ? '#f0b429' : '#6b6257',
            dark: canBuy ? '#a8741a' : '#4a443c',
            textColor: canBuy ? '#3a2405' : 'rgba(255,255,255,0.45)',
            fontSize: 24,
            rad: 16,
            disabled: !canBuy
          });
        })(s.id);
      }
    }

    var ny = p.y + 200 + SHOP.length * 126 + 14;
    button(140, ny, 440, 96, '下 一 关', function () {
      G.level++;
      G.buffs = { gloves: false, luck: false, clock: false };
      beginLevel();
      persist();
    }, { fontSize: 32 });
  }

  function drawGlove(g) {
    var grad = g.createLinearGradient(-30, 0, 30, 0);
    grad.addColorStop(0, '#e8a33a');
    grad.addColorStop(1, '#b9741c');
    g.fillStyle = grad;
    g.strokeStyle = 'rgba(90,50,10,0.9)';
    g.lineWidth = 2.5;
    rr(g, -26, -30, 52, 44, 12); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(-12, -24, 8, 14, 0.2, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(2, -27, 8, 15, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(15, -22, 7.5, 13, -0.2, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#8d5a14';
    rr(g, -24, 12, 48, 16, 6); g.fill();
  }

  function drawStar(g) {
    g.save();
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      var rad = i % 2 === 0 ? 34 : 15;
      var x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    var grad = g.createRadialGradient(0, 0, 4, 0, 0, 34);
    grad.addColorStop(0, '#fff8c0');
    grad.addColorStop(0.5, '#ffd83f');
    grad.addColorStop(1, '#e09a0a');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(120,74,4,0.85)';
    g.lineWidth = 2.4;
    g.stroke();
    g.restore();
  }

  function drawWatch(g) {
    g.fillStyle = '#d9b25c';
    g.beginPath(); g.arc(0, 2, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(90,60,10,0.9)';
    g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fdf6e0';
    g.beginPath(); g.arc(0, 2, 23, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2a10';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(0, -12); g.stroke();
    g.beginPath(); g.moveTo(0, 2); g.lineTo(12, 8); g.stroke();
    g.fillStyle = '#d9b25c';
    rr(g, -8, -38, 16, 10, 3); g.fill();
  }

  function drawFailed() {
    overlay(0.8);
    var p = panel(Math.round((H - 560) / 2), 560);
    text('时 间 到', W / 2, p.y + 96, 52, '#ff7a5a', 'center');

    var miss = Math.max(0, G.goal - G.earnings);
    text('本关收入', W / 2, p.y + 190, 20, 'rgba(255,255,255,0.5)', 'center');
    text('$' + fmt(G.earnings), W / 2, p.y + 226, 36, '#ffe066', 'center');
    text('还差 $' + fmt(miss) + ' 达标', W / 2, p.y + 276, 20, 'rgba(255,160,140,0.9)', 'center');

    button(150, p.y + 330, 420, 96, '再 试 一 次', function () {
      beginLevel();
    }, { fontSize: 30 });
    button(150, p.y + 442, 420, 76, '返回主菜单', function () {
      G.state = 'menu';
      persist();
    }, { color: '#6d7885', dark: '#454e58', textColor: '#eef3f8', fontSize: 24 });
  }

  function drawPaused() {
    overlay(0.7);
    var p = panel(Math.round((H - 480) / 2), 480);
    text('已 暂 停', W / 2, p.y + 84, 46, '#ffd95e', 'center');
    button(150, p.y + 150, 420, 92, '继 续', function () { G.state = 'playing'; G.playStart = G.t - 9; }, { fontSize: 30 });
    button(150, p.y + 262, 420, 82, '重玩本关', function () { beginLevel(); }, {
      color: '#6d7885', dark: '#454e58', textColor: '#eef3f8', fontSize: 26
    });
    button(150, p.y + 356, 420, 76, '主菜单', function () { G.state = 'menu'; persist(); }, {
      color: '#4e5866', dark: '#333a44', textColor: '#eef3f8', fontSize: 24
    });
  }

  function drawFinished() {
    overlay(0.86);
    var p = panel(Math.round((H - 620) / 2), 620);
    text('全 部 通 关 !', W / 2, p.y + 110, 50, '#ffd95e', 'center');
    text('你挖穿了整座矿山', W / 2, p.y + 176, 22, 'rgba(255,255,255,0.55)', 'center');
    text('$' + fmt(G.wallet), W / 2, p.y + 260, 56, '#ffe066', 'center');
    text('最终财富', W / 2, p.y + 310, 18, 'rgba(255,255,255,0.4)', 'center');
    button(150, p.y + 380, 420, 96, '再 来 一 次', function () { startNewGame(); }, { fontSize: 30 });
    button(150, p.y + 492, 420, 74, '主菜单', function () { G.state = 'menu'; persist(); }, {
      color: '#6d7885', dark: '#454e58', textColor: '#eef3f8', fontSize: 24
    });
  }

  /* ---------------------------------------------------------
     14. 主渲染
     --------------------------------------------------------- */
  function render() {
    var dpr = view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var s = view.scale * dpr;
    ctx.setTransform(s, 0, 0, s, view.ox * dpr, view.oy * dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    hitAreas.length = 0;

    // 世界（带抖动）
    ctx.save();
    if (G.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    }

    if (G.state === 'menu') {
      drawMenuBg();
    } else if (G.bg) {
      ctx.drawImage(G.bg, 0, 0, W, H);
      drawItems();
      drawMiner();
      drawRope();
    } else {
      ctx.fillStyle = '#2b1c10';
      ctx.fillRect(0, 0, W, H);
    }

    drawParticles();
    drawFloats();
    ctx.restore();

    // UI
    if (G.state === 'playing' || G.state === 'paused' || G.state === 'intro') {
      drawHUD();
    }

    if (G.state === 'menu') drawMenu();
    else if (G.state === 'intro') drawIntro();
    else if (G.state === 'complete') drawComplete();
    else if (G.state === 'shop') drawShop();
    else if (G.state === 'failed') drawFailed();
    else if (G.state === 'paused') drawPaused();
    else if (G.state === 'finished') drawFinished();
    else if (G.state === 'playing') {
      // 开局提示
      var el = G.t - (G.playStart === undefined ? -99 : G.playStart);
      if (el < 1.6) {
        var ha = clamp(1.6 - el, 0, 1);
        ctx.save();
        ctx.globalAlpha = ha;
        ctx.font = 'bold 32px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 9;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeText('点击屏幕放钩', W / 2, GROUND_TOP + 168);
        ctx.fillStyle = '#fff3c4';
        ctx.fillText('点击屏幕放钩', W / 2, GROUND_TOP + 168);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /* ---------------------------------------------------------
     15. 输入
     --------------------------------------------------------- */
  function handleTap(x, y) {
    for (var i = hitAreas.length - 1; i >= 0; i--) {
      var a = hitAreas[i];
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        a.action();
        return true;
      }
    }
    return false;
  }

  // TouchEvent 不继承 MouseEvent，Safari/iOS 上 e.clientX 是 undefined，
  // 必须从 touches / changedTouches 里取坐标（桌面端 mousedown 才有 clientX）
  function eventPoint(e) {
    var list = (e.changedTouches && e.changedTouches.length) ? e.changedTouches
      : ((e.touches && e.touches.length) ? e.touches : null);
    if (list) {
      var t = list[0];
      if (typeof t.clientX === 'number' && typeof t.clientY === 'number') {
        return { x: t.clientX, y: t.clientY };
      }
    }
    if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      return { x: e.clientX, y: e.clientY };
    }
    if (typeof e.pageX === 'number' && typeof e.pageY === 'number') {
      return { x: e.pageX, y: e.pageY };
    }
    return null;
  }

  function evFamily(e) {
    var n = e.type || '';
    if (n.indexOf('pointer') === 0) return 'p';
    if (n.indexOf('touch') === 0) return 't';
    return 'm';
  }

  // 同一次按压会依次触发 pointerdown / touchstart / mousedown，这里做去重
  var downGate = { t: -9999, x: -999, y: -999, fam: '' };

  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  function onDown(e) {
    var pt = eventPoint(e);
    if (!pt) return;

    var now = nowMs();
    var fam = evFamily(e);
    if (fam !== downGate.fam && now - downGate.t < 400 &&
        Math.abs(pt.x - downGate.x) < 12 && Math.abs(pt.y - downGate.y) < 12) {
      return;
    }
    downGate.t = now; downGate.x = pt.x; downGate.y = pt.y; downGate.fam = fam;

    if (e.cancelable) e.preventDefault();
    audioInit();
    var p = toLogical(pt.x, pt.y);
    if (!isFinite(p.x) || !isFinite(p.y)) return;
    if (handleTap(p.x, p.y)) return;
    if (G.state === 'playing') {
      shoot();
    }
  }

  function onUp(e) {
    if (e.cancelable) e.preventDefault();
  }

  // pointer / touch / mouse 三套都挂上，靠 downGate 去重，兼容各种 WebView
  if (window.PointerEvent) {
    window.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointerup', onUp);
  }
  window.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('touchend', onUp, { passive: false });
  window.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      audioInit();
      if (G.state === 'playing') shoot();
      else if (G.state === 'intro') { G.state = 'playing'; }
    } else if (e.key === 'd' || e.key === 'D') {
      useDynamite();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (G.state === 'playing') G.state = 'paused';
      else if (G.state === 'paused') G.state = 'playing';
    }
  });

  window.addEventListener('resize', resize);
  window.addEventListener('pageshow', function () { resize(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () { resize(); });
  }
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

  // 切后台自动暂停
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.state === 'playing') G.state = 'paused';
  });

  /* ---------------------------------------------------------
     16. 主循环
     --------------------------------------------------------- */
  var lastTime = 0;

  function loop(now) {
    if (!lastTime) lastTime = now;
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.06) dt = 0.06;
    if (dt < 0) dt = 0;

    var prevState = G.state;
    update(dt);
    if (prevState !== 'playing' && G.state === 'playing') G.playStart = G.t;

    render();
    requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------
     17. 启动
     --------------------------------------------------------- */
  function boot() {
    resize();
    loadSave();
    loadDifficulty();
    G.wallet = save.wallet;
    G.dynamite = save.dynamite;
    G.level = save.level;
    G.bg = buildBackground(99);
    G.state = 'menu';

    // 调试 / 测试接口
    window.__GOLD_MINER__ = {
      G: G,
      beginLevel: beginLevel,
      startNewGame: startNewGame,
      generateLevel: generateLevel,
      shoot: shoot,
      useDynamite: useDynamite,
      update: update,
      render: render,
      setState: function (s) { G.state = s; },
      setLevel: function (n) { G.level = n; beginLevel(); },
      setDifficulty: function (i) { setDifficulty(i); },
      getDifficulty: function () { return { index: DIFF_INDEX, key: diff().key, name: diff().name }; },
      getHitAreas: function () { return hitAreas; },
      bounds: function () { return { H: H, GROUND_TOP: GROUND_TOP, ITEM_TOP: ITEM_TOP, ITEM_BOTTOM: ITEM_BOTTOM, PIVOT_X: PIVOT_X, PIVOT_Y: PIVOT_Y }; }
    };

    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
