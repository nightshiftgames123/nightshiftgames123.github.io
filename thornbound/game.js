// Thornbound — a small Isaac-style roguelite crawler.
// World units are "art pixels": a room is 13x7 tiles of 32px plus a 32px wall ring,
// drawn into a canvas scaled to the screen (crisp on hi-dpi, smooth sub-pixel motion).
'use strict';
(() => {

// ===================================================================== constants
const TILE = 32, COLS = 13, ROWS = 7, WALL = 32;
const RW = COLS * TILE + WALL * 2, RH = ROWS * TILE + WALL * 2; // 480 x 288
const HUD = 36, VW = RW, VH = RH + HUD;
const MCX = RW / 2, MCY = RH / 2;
const GRID_W = 9, GRID_H = 8;
const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };

const SPRITES = {
  goblin: { scales: { 0.25: { file: 'goblin@0.25.png', w: 43, h: 42 }, 0.5: { file: 'goblin@0.5.png', w: 86, h: 85 } },
    anims: { down: [0, 1, 2, 3, 4, 5], downAtk: [6], up: [7, 8, 9, 10, 11], upAtk: [12], side: [13, 14, 15, 16, 17], sideAtk: [18, 19] } },
  ghost: { scales: { 0.25: { file: 'ghost@0.25.png', w: 43, h: 44 }, 0.5: { file: 'ghost@0.5.png', w: 86, h: 88 } },
    anims: { down: [0, 1, 2, 3, 4, 5], downAtk: [6], up: [7, 8, 9, 10, 11], upAtk: [12], side: [13, 14, 15, 16, 17, 18], sideAtk: [19] } },
};

const THEMES = [
  { name: 'Overgrown Ruins', tint: '#c9d3c1', dark: 0.30, wall: [60, 68, 72], moss: '#3f6234', rune: '#4fc3ff' },
  { name: 'Sunken Crypt', tint: '#9fb4d2', dark: 0.40, wall: [50, 58, 78], moss: '#2f5058', rune: '#5ad6ff' },
  { name: 'Hollow Depths', tint: '#b49dc6', dark: 0.46, wall: [60, 50, 74], moss: '#4c3b60', rune: '#c07bff' },
  { name: 'Thorn Heart', tint: '#cc9a8a', dark: 0.48, wall: [74, 48, 48], moss: '#5c2f2f', rune: '#ff6a5a' },
];

// Room layouts: '#' rubble, '^' thorns. Door lanes (centre row / column ends) stay clear.
const LAYOUTS = [
  ['.............', '.............', '.............', '.............', '.............', '.............', '.............'],
  ['.............', '..#.......#..', '.............', '.............', '.............', '..#.......#..', '.............'],
  ['.............', '.............', '.....###.....', '.....###.....', '.....###.....', '.............', '.............'],
  ['##.........##', '#...........#', '.............', '.............', '.............', '#...........#', '##.........##'],
  ['.............', '...^.....^...', '....^...^....', '.............', '....^...^....', '...^.....^...', '.............'],
  ['.............', '.##.##.##.##.', '.............', '.............', '.............', '.##.##.##.##.', '.............'],
  ['.............', '.............', '...#.....#...', '...#.....#...', '...#.....#...', '.............', '.............'],
  ['.............', '.....#.#.....', '....#...#....', '.............', '....#...#....', '.....#.#.....', '.............'],
  ['.............', '.#^.......^#.', '.............', '......#......', '.............', '.#^.......^#.', '.............'],
  ['###.......###', '.............', '..####.####..', '.............', '..####.####..', '.............', '###.......###'],
  ['..#.......#..', '.....^.^.....', '#...........#', '.....#.#.....', '#...........#', '.....^.^.....', '..#.......#..'],
  ['.............', '...###.###...', '...#.....#...', '.............', '...#.....#...', '...###.###...', '.............'],
  ['.............', '.^^.......^^.', '.^.........^.', '.............', '.^.........^.', '.^^.......^^.', '.............'],
  ['.............', '....#...#....', '..#.......#..', '.............', '..#.......#..', '....#...#....', '.............'],
];
const BOSS_LAYOUTS = [0, 1];

// ===================================================================== utils
const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;
const TAU = Math.PI * 2;
const ease = (t) => t * t * (3 - 2 * t);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
const $ = (id) => document.getElementById(id);

// ===================================================================== canvas
const cv = $('game'), ctx = cv.getContext('2d');
const stage = $('stage');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let K = 1, cssScale = 1;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const portrait = vh > vw * 1.05;
  stage.classList.toggle('portrait-touch', portrait && isTouch);
  const availH = portrait && isTouch ? vh * 0.6 : vh - 8;
  const s = Math.min((vw - 8) / VW, availH / VH);
  const cssW = Math.floor(VW * s), cssH = Math.floor(VH * s);
  cssScale = s;
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  K = cv.width / VW;
  ctx.imageSmoothingEnabled = false;
  $('touchHint').style.display = isTouch && portrait ? 'flex' : 'none';
}
window.addEventListener('resize', resize);
resize();
if (isTouch) $('controlsHelp').innerHTML = 'Drag <b>left side</b> to move · drag <b>right side</b> to shoot<br>Tap the <b>❚❚</b> in the top bar to pause';

// light map is rendered at low res and stretched smoothly
const lightCv = mk(RW / 2, RH / 2), lctx = lightCv.getContext('2d');

// ===================================================================== assets
const IMG = {};
function loadImg(key, src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => { IMG[key] = i; res(); }; i.onerror = () => res(); i.src = src; });
}
// hue/sat/light remap for enemy variants (done once at load)
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
function hsl2rgb(h, s, l) { if (!s) return [l * 255, l * 255, l * 255]; const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1;
  return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; }
function variant(img, hue, sat = 1, lit = 1) {
  const c = mk(img.width, img.height), x = c.getContext('2d');
  try {
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const [h, s, l] = rgb2hsl(p[i], p[i + 1], p[i + 2]);
      const o = hsl2rgb((h + hue / 360 + 1) % 1, clamp(s * sat, 0, 1), clamp(l * lit, 0, 1));
      p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2];
    }
    x.putImageData(d, 0, 0);
  } catch (e) { // file:// pages can't read pixels; fall back to a canvas filter
    x.clearRect(0, 0, c.width, c.height);
    x.filter = `hue-rotate(${hue}deg) saturate(${sat}) brightness(${lit})`;
    x.drawImage(img, 0, 0);
  }
  return c;
}
function silhouette(img, color) {
  const c = mk(img.width, img.height), x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}
const SHEETS = {};
function makeSheet(name, scale, img) {
  const m = SPRITES[name].scales[scale];
  return { img, white: silhouette(img, '#fff'), w: m.w, h: m.h, anims: SPRITES[name].anims };
}
function glowSprite(r, color) {
  const c = mk(r * 2, r * 2), x = c.getContext('2d');
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
  return c;
}
const GLOW = {};
const LIGHT = glowSprite(64, 'rgba(255,255,255,1)');

// ---- player pixel sprite (no player art supplied yet, so it's drawn here)
const PPAL = { k: '#0b0d14', H: '#46598a', h: '#2a3557', s: '#06070c', e: '#a8faff', t: '#dcae4e', g: '#62dcff', C: '#2f3d61', c: '#1d2642', w: '#cfbc9e', b: '#5a3e2a' };
const P_FRONT = ['......kk', '....kkHH', '...kHHHH', '..kHHHhh', '..kHHhkk', '.kHHhkss', '.kHhkess', '.kHhksss', '.kHhhkkk', 'kHHhhhtt',
  'kHhCCCCg', 'khCCCCCC', 'kwkCcCCC', 'kwkCcCCC', '.kkCcCCC', '.kCCcCCC', '.kCcCCCC', '.kCcCCCC', '.kccCCCc', '..kkkkkk'];
const P_BACK = ['......kk', '....kkHH', '...kHHHH', '..kHHHHH', '..kHHHHH', '.kHHHHHh', '.kHHHHhh', '.kHHHhhh', '.kHHhhhh', 'kHHhhhhh',
  'kHhCCCCC', 'khCCCCCC', 'kwkCCCCC', 'kwkCCcCC', '.kkCCcCC', '.kCCCcCC', '.kCCCcCC', '.kCcCcCC', '.kccCcCc', '..kkkkkk'];
const P_SIDE = ['......kkkk......', '....kkHHHHk.....', '...kHHHHHHHk....', '..kHHHHHHhhHk...', '..kHHHHHhhkkk...', '.kHHHHHhkssssk..',
  '.kHHHHhhksssek..', '.kHHHHhhkssssk..', '.kHHHhhhhkkkk...', 'kHHHhhhhhttk....', 'kHHhCCCCCCgk....', 'khhCCCCCCCCk....',
  'khCCCCCCCwwk....', 'kCCCcCCCCkk.....', 'kCCCcCCCCCk.....', '.kCCcCCCCCk.....', '.kCCcCCCCCk.....', '.kCcCCCCCck.....', '.kcCCCCCcck.....', '..kkkkkkkk......'];
const mirror = (rows) => rows.map((r) => r + r.split('').reverse().join(''));
function paintMap(x, rows, ox, oy) {
  rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch === '.' || ch === ' ') continue; x.fillStyle = PPAL[ch]; x.fillRect(ox + i, oy + y, 1, 1); } });
}
const PFRAMES = { down: [], up: [], side: [] };
function buildPlayer() {
  const maps = { down: mirror(P_FRONT), up: mirror(P_BACK), side: P_SIDE };
  for (const dir of ['down', 'up', 'side']) {
    for (let f = 0; f < 3; f++) { // 0 idle, 1/2 stride
      const c = mk(16, 23), x = c.getContext('2d');
      const feet = dir === 'side' ? [[3, f === 1 ? -1 : f === 2 ? 1 : 0], [7, f === 1 ? 1 : f === 2 ? -1 : 0]] : [[4, 0], [9, 0]];
      feet.forEach(([fx, dx], i) => {
        const lift = dir !== 'side' && f && (f === 1) === (i === 0) ? -1 : 0;
        x.fillStyle = PPAL.b; x.fillRect(fx + dx, 20 + lift, 3, 2); x.fillStyle = PPAL.k; x.fillRect(fx + dx, 22 + lift, 3, 1);
      });
      paintMap(x, maps[dir], 0, 0);
      PFRAMES[dir].push(c);
    }
  }
}
// hearts for the HUD
const HEART = ['.kk...kk.', 'kRRk.kRRk', 'kWRRkRRRk', 'kRRRRRRRk', '.kRRRRRk.', '..kRRRk..', '...kRk...', '....k....'];
const HEARTS = {};
function buildHearts() {
  const pals = { full: ['#e0353d', '#ff9da2'], empty: ['#3a1519', '#3a1519'] };
  for (const kind of ['full', 'half', 'empty']) {
    const c = mk(9, 8), x = c.getContext('2d');
    HEART.forEach((row, y) => { for (let i = 0; i < 9; i++) { const ch = row[i]; if (ch === '.') continue;
      const p = kind === 'half' ? (i <= 4 ? pals.full : pals.empty) : pals[kind];
      x.fillStyle = ch === 'k' ? '#0b0d14' : ch === 'W' ? p[1] : p[0]; x.fillRect(i, y, 1, 1); } });
    HEARTS[kind] = c;
  }
}

// ===================================================================== audio (synthesised)
const SFX = {
  ac: null, on: store('thornbound_sound') !== 'off', last: {},
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ac.createGain(); this.master.gain.value = 0.32; this.master.connect(this.ac.destination);
      const n = this.ac.sampleRate; this.nbuf = this.ac.createBuffer(1, n, n); const d = this.nbuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ac = null; }
  },
  tone(f0, f1, dur, type = 'square', vol = 0.2, delay = 0) {
    const a = this.ac; if (!a || !this.on) return; const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dur, vol = 0.25, freq = 1400, delay = 0) {
    const a = this.ac; if (!a || !this.on) return; const t = a.currentTime + delay;
    const s = a.createBufferSource(); s.buffer = this.nbuf; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  },
  play(name) {
    if (!this.ac || !this.on) return;
    const now = performance.now(); if (now - (this.last[name] || 0) < 35) return; this.last[name] = now;
    switch (name) {
      case 'shoot': this.tone(880, 520, 0.08, 'triangle', 0.12); break;
      case 'splash': this.noise(0.06, 0.06, 2600); break;
      case 'hit': this.noise(0.08, 0.18, 1800); this.tone(220, 120, 0.07, 'square', 0.06); break;
      case 'kill': this.noise(0.22, 0.25, 900); this.tone(180, 50, 0.2, 'sawtooth', 0.1); break;
      case 'hurt': this.tone(300, 80, 0.25, 'sawtooth', 0.22); this.noise(0.2, 0.2, 700); break;
      case 'crystal': this.tone(1320, 1320, 0.06, 'sine', 0.14); this.tone(1980, 1980, 0.09, 'sine', 0.1, 0.05); break;
      case 'heart': this.tone(520, 780, 0.15, 'sine', 0.18); break;
      case 'door': this.noise(0.35, 0.3, 300); this.tone(90, 60, 0.3, 'triangle', 0.2); break;
      case 'slash': this.noise(0.1, 0.16, 3200); break;
      case 'throw': this.tone(600, 300, 0.1, 'triangle', 0.08); break;
      case 'cast': this.tone(400, 900, 0.25, 'sine', 0.08); break;
      case 'orb': this.tone(300, 200, 0.12, 'sine', 0.07); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.16, i * 0.08)); break;
      case 'item': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, f * 1.01, 0.22, 'sine', 0.16, i * 0.07)); break;
      case 'buy': this.tone(988, 988, 0.06, 'square', 0.08); this.tone(1318, 1318, 0.12, 'square', 0.08, 0.06); break;
      case 'deny': this.tone(160, 140, 0.15, 'square', 0.1); break;
      case 'roar': this.tone(140, 45, 0.9, 'sawtooth', 0.22); this.noise(0.8, 0.22, 500); break;
      case 'boom': this.noise(0.6, 0.4, 600); this.tone(110, 30, 0.6, 'sine', 0.3); break;
      case 'step': this.noise(0.03, 0.03, 500); break;
      case 'dash': this.noise(0.3, 0.2, 1200); this.tone(200, 90, 0.3, 'sawtooth', 0.1); break;
      case 'select': this.tone(660, 660, 0.04, 'square', 0.06); break;
      case 'descend': [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.3, 'triangle', 0.15, i * 0.12)); break;
      case 'die': [330, 262, 196, 131].forEach((f, i) => this.tone(f, f * 0.9, 0.4, 'sawtooth', 0.12, i * 0.18)); break;
    }
  },
};

// ===================================================================== upgrades
const SKILL_INFO = {
  split: { name: 'Split Shard', icon: '⁂', max: 3, desc: (l) => `Fire ${l + 1} shards in a spread` },
  pierce: { name: 'Piercing Shard', icon: '➵', max: 3, desc: (l) => `Shards pass through ${l} foe${l > 1 ? 's' : ''}` },
  homing: { name: 'Seeking Runes', icon: '◎', max: 3, desc: (l) => `Shards curve toward foes${l > 1 ? ' (stronger)' : ''}` },
  orbit: { name: 'Orbiting Crystal', icon: '✧', max: 3, desc: (l) => `${l} crystal${l > 1 ? 's' : ''} circle you, cutting foes and blocking shots` },
  mantle: { name: 'Thorn Mantle', icon: '✺', max: 3, desc: (l) => `When hurt, burst ${6 + l * 2} thorns` },
  bounce: { name: 'Ricochet', icon: '↯', max: 2, desc: (l) => `Shards bounce off walls ${l} time${l > 1 ? 's' : ''}` },
  vamp: { name: 'Blood Rune', icon: '♥︎', max: 3, desc: (l) => `Heal ½ heart every ${16 - l * 4} kills` },
  frost: { name: 'Frost Shards', icon: '❅', max: 3, desc: (l) => `${l * 20}% chance to slow foes` },
  rear: { name: 'Back Shard', icon: '⇄', max: 1, desc: () => 'Also fire a shard behind you' },
};
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString();
const STAT_UPS = {
  dmg: { name: 'Keen Shards', icon: '⚔︎', desc: '+0.8 damage', apply: (p) => { p.dmg += 0.8; }, diff: (p) => [['DMG', fmt(p.dmg), fmt(p.dmg + 0.8)]] },
  rate: { name: 'Quick Hand', icon: '⚡︎', desc: 'Fire 15% faster', apply: (p) => { p.fireDelay *= 0.85; }, diff: (p) => [['RATE', fmt(1 / p.fireDelay), fmt(1 / (p.fireDelay * 0.85))]] },
  speed: { name: 'Wind Step', icon: '≫', desc: '+12% move speed', ok: (p) => p.speed < 190, apply: (p) => { p.speed *= 1.12; }, diff: (p) => [['SPD', fmt(p.speed / 100, 2), fmt(p.speed * 1.12 / 100, 2)]] },
  range: { name: 'Far Sight', icon: '◬', desc: '+25% range, faster shards', apply: (p) => { p.range *= 1.25; p.shotSpeed *= 1.1; }, diff: (p) => [['RANGE', fmt(p.range / 32), fmt(p.range * 1.25 / 32)]] },
  heart: { name: 'Heart Vessel', icon: '❤︎', desc: '+1 heart and heal it', ok: (p) => p.maxHp < 24, apply: (p) => { p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2); }, diff: (p) => [['HP', p.maxHp / 2, p.maxHp / 2 + 1]] },
  luck: { name: 'Lucky Bone', icon: '☘︎', desc: '+1 luck: more drops', apply: (p) => { p.luck += 1; }, diff: (p) => [['LUCK', p.luck, p.luck + 1]] },
};
function upgradeFor(id) {
  const p = G.player;
  if (STAT_UPS[id]) { const s = STAT_UPS[id]; return { id, name: s.name, icon: s.icon, desc: s.desc, lvText: 'Stat', diff: s.diff(p) }; }
  const s = SKILL_INFO[id], l = p.skills[id] || 0;
  return { id, name: s.name, icon: s.icon, desc: s.desc(l + 1), lvText: l ? `Lv ${l} → ${l + 1}` : 'New', diff: [] };
}
function availableUpgrades(kind) {
  const p = G.player, out = [];
  if (kind !== 'skill') for (const id in STAT_UPS) if (!STAT_UPS[id].ok || STAT_UPS[id].ok(p)) out.push(id);
  if (kind !== 'stat') for (const id in SKILL_INFO) if ((p.skills[id] || 0) < SKILL_INFO[id].max) out.push(id);
  return out;
}
function rollChoices(n) {
  // at least one skill when possible, the rest anything
  const skills = shuffle(availableUpgrades('skill')), all = shuffle(availableUpgrades());
  const out = [];
  if (skills.length) out.push(skills[0]);
  for (const id of all) { if (out.length >= n) break; if (!out.includes(id)) out.push(id); }
  return shuffle(out);
}
function applyUpgrade(id) {
  const p = G.player;
  if (STAT_UPS[id]) STAT_UPS[id].apply(p);
  else p.skills[id] = (p.skills[id] || 0) + 1;
}

// ===================================================================== game state
let G = null;
let mode = 'title'; // title | play | pause | levelup | dead
const lsBest = () => { try { return JSON.parse(store('thornbound_best') || 'null'); } catch (e) { return null; } };

function makePlayer() {
  return { x: MCX, y: MCY, vx: 0, vy: 0, r: 6, hp: 6, maxHp: 6, dmg: 3.5, fireDelay: 0.42, shotSpeed: 230, range: 200, speed: 118, luck: 0,
    skills: {}, level: 1, xp: 0, crystals: 0, inv: 0, fireCd: 0, face: 'down', flip: false, anim: 0, kills: 0, vampKills: 0, orbA: 0, orbHits: new Map(), thornCd: 0, stepT: 0 };
}
const xpNeed = (lv) => 10 + (lv - 1) * 8;

function newRun() {
  G = { floor: 1, player: makePlayer(), tears: [], ebul: [], enemies: [], pickups: [], parts: [], texts: [],
    shake: 0, freeze: 0, trans: null, fade: null, banner: null, pendingLv: 0, lvDelay: 0, time: 0, flow: null, flowT: 0, flowKey: '',
    bossBar: null, dying: 0, slowmo: 0, kills: 0 };
  genFloor();
  enterRoom(G.start, null);
  showBanner(`Floor 1`, THEMES[0].name);
}

// ===================================================================== floor generation (Isaac-style)
function genFloor() {
  const f = G.floor;
  for (let attempt = 0; attempt < 200; attempt++) {
    const want = Math.min(18, 7 + f * 2 + ri(0, 2));
    const map = new Map(), key = (x, y) => x + ',' + y;
    const nb = (x, y) => Object.values(DIRS).filter(([dx, dy]) => map.has(key(x + dx, y + dy))).length;
    const start = { gx: 4, gy: 4 }; map.set(key(4, 4), start);
    const q = [start];
    for (let guard = 0; q.length && map.size < want && guard < 400; guard++) {
      const r = q.shift();
      for (const [dx, dy] of shuffle(Object.values(DIRS))) {
        const nx = r.gx + dx, ny = r.gy + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H || map.has(key(nx, ny)) || map.size >= want) continue;
        if (Math.random() < 0.5 || nb(nx, ny) > 1) continue;
        const n = { gx: nx, gy: ny }; map.set(key(nx, ny), n); q.push(n);
      }
      if (!q.length && map.size < want) q.push(pick([...map.values()])); // keep growing
    }
    if (map.size < want) continue;
    const rooms = [...map.values()];
    // distances from start
    const distOf = new Map([[start, 0]]); const bq = [start];
    while (bq.length) { const r = bq.shift(); for (const [dx, dy] of Object.values(DIRS)) { const n = map.get(key(r.gx + dx, r.gy + dy)); if (n && !distOf.has(n)) { distOf.set(n, distOf.get(r) + 1); bq.push(n); } } }
    const dead = rooms.filter((r) => r !== start && nb(r.gx, r.gy) === 1);
    if (dead.length < 3) continue;
    dead.sort((a, b) => distOf.get(b) - distOf.get(a));
    if (distOf.get(dead[0]) < 3) continue;
    const boss = dead[0], others = shuffle(dead.slice(1));
    G.map = map; G.key = key; G.start = start;
    for (const r of rooms) {
      r.type = r === start ? 'start' : r === boss ? 'boss' : r === others[0] ? 'treasure' : r === others[1] ? 'shop' : 'fight';
      r.doors = {}; for (const d in DIRS) { const [dx, dy] = DIRS[d]; if (map.has(key(r.gx + dx, r.gy + dy))) r.doors[d] = true; }
      r.visited = false; r.seen = false; r.cleared = r.type !== 'fight' && r.type !== 'boss'; r.pickups = []; r.peds = [];
      r.seed = (Math.random() * 1e9) | 0; r.depth = distOf.get(r);
      const li = r.type === 'fight' ? ri(0, LAYOUTS.length - 1) : r.type === 'boss' ? pick(BOSS_LAYOUTS) : 0;
      r.grid = new Uint8Array(COLS * ROWS);
      LAYOUTS[li].forEach((row, y) => { for (let x = 0; x < COLS; x++) r.grid[y * COLS + x] = row[x] === '#' ? 1 : row[x] === '^' ? 2 : 0; });
      r.fx = ri(0, 512 - COLS * TILE); r.fy = ri(0, 512 - ROWS * TILE);
      r.bg = null;
    }
    // room contents
    const treasure = others[0], shop = others[1];
    treasure.peds.push(makePed('skill', MCX, MCY, 0));
    shuffle(['heart', 'skill', 'stat']).forEach((k, i) => shop.peds.push(makePed(k, MCX + (i - 1) * 80, MCY - 6, k === 'skill' ? 14 + f * 2 : k === 'stat' ? 8 + f : 4)));
    return;
  }
}
function makePed(kind, x, y, price) {
  const ped = { kind, x, y, price, taken: false };
  if (kind === 'skill') ped.id = pick(availableUpgrades('skill').length ? availableUpgrades('skill') : availableUpgrades());
  else if (kind === 'stat') ped.id = pick(availableUpgrades('stat'));
  return ped;
}
const roomAt = (gx, gy) => G.map.get(G.key(gx, gy));

// ===================================================================== tiles & collision
const toT = (v) => Math.floor((v - WALL) / TILE);
function tileAt(room, tx, ty) { return tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? 9 : room.grid[ty * COLS + tx]; }
const solidAt = (room, x, y) => tileAt(room, toT(x), toT(y)) === 1;
function collideTiles(e, room, alsoThorns) {
  const tx0 = toT(e.x - e.r), tx1 = toT(e.x + e.r), ty0 = toT(e.y - e.r), ty1 = toT(e.y + e.r);
  let hit = false;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = tileAt(room, tx, ty);
    if (t === 9 || !(t === 1 || (alsoThorns && t === 2))) continue;
    const x0 = WALL + tx * TILE + 2, y0 = WALL + ty * TILE + 2, x1 = x0 + TILE - 4, y1 = y0 + TILE - 4;
    const cx = clamp(e.x, x0, x1), cy = clamp(e.y, y0, y1);
    let dx = e.x - cx, dy = e.y - cy; const d = hyp(dx, dy);
    if (d < e.r) {
      hit = true;
      if (d === 0) { // centre inside the block: push out along the shallowest axis
        const l = e.x - x0, r = x1 - e.x, u = e.y - y0, b = y1 - e.y, m = Math.min(l, r, u, b);
        if (m === l) e.x = x0 - e.r; else if (m === r) e.x = x1 + e.r; else if (m === u) e.y = y0 - e.r; else e.y = y1 + e.r;
      } else { e.x = cx + dx / d * e.r; e.y = cy + dy / d * e.r; }
    }
  }
  return hit;
}
function clampRoom(e) {
  e.x = clamp(e.x, WALL + e.r, RW - WALL - e.r);
  e.y = clamp(e.y, WALL + e.r, RH - WALL - e.r);
}
function lineClear(room, x0, y0, x1, y1, thorns) {
  const d = hyp(x1 - x0, y1 - y0), n = Math.ceil(d / 8);
  for (let i = 1; i < n; i++) { const t = tileAt(room, toT(lerp(x0, x1, i / n)), toT(lerp(y0, y1, i / n))); if (t === 1 || (thorns && t === 2)) return false; }
  return true;
}
// BFS distance field toward the player for walking enemies
function updateFlow(room) {
  const p = G.player, ptx = clamp(toT(p.x), 0, COLS - 1), pty = clamp(toT(p.y), 0, ROWS - 1), k = ptx + ',' + pty;
  if (G.flow && G.flowKey === k && G.flowRoom === room) return;
  G.flowKey = k; G.flowRoom = room;
  const d = new Int16Array(COLS * ROWS).fill(9999);
  const q = [ptx + pty * COLS]; d[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % COLS, y = (i / COLS) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy;
      if (tileAt(room, nx, ny) !== 0) continue;
      if (dx && dy && (tileAt(room, x + dx, y) !== 0 || tileAt(room, x, y + dy) !== 0)) continue;
      const ni = nx + ny * COLS; if (d[ni] <= d[i] + 1) continue; d[ni] = d[i] + 1; q.push(ni);
    }
  }
  G.flow = d;
}
function flowDir(e) {
  const room = G.room, p = G.player;
  if (hyp(p.x - e.x, p.y - e.y) < 40 || lineClear(room, e.x, e.y, p.x, p.y, true)) return norm(p.x - e.x, p.y - e.y);
  updateFlow(room);
  const tx = clamp(toT(e.x), 0, COLS - 1), ty = clamp(toT(e.y), 0, ROWS - 1);
  let best = G.flow[tx + ty * COLS], bx = 0, by = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = tx + dx, ny = ty + dy; if (tileAt(room, nx, ny) !== 0) continue;
    if (dx && dy && (tileAt(room, tx + dx, ty) !== 0 || tileAt(room, tx, ty + dy) !== 0)) continue;
    const v = G.flow[nx + ny * COLS]; if (v < best) { best = v; bx = dx; by = dy; }
  }
  if (!bx && !by) return norm(p.x - e.x, p.y - e.y);
  return norm(WALL + (tx + bx) * TILE + 16 - e.x, WALL + (ty + by) * TILE + 16 - e.y);
}
function norm(x, y) { const d = hyp(x, y) || 1; return [x / d, y / d]; }

// ===================================================================== rooms
function freeTiles(room, awayFrom, minDist) {
  const out = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (room.grid[y * COLS + x]) continue;
    const px = WALL + x * TILE + 16, py = WALL + y * TILE + 16;
    if (awayFrom && hyp(px - awayFrom.x, py - awayFrom.y) < minDist) continue;
    out.push([px, py]);
  }
  return out;
}
function nearestFree(room, x, y) {
  let best = null, bd = 1e9;
  for (const [px, py] of freeTiles(room)) { const d = hyp(px - x, py - y); if (d < bd) { bd = d; best = [px, py]; } }
  return best || [x, y];
}
function enterRoom(room, fromDir) {
  const p = G.player;
  G.room = room; room.visited = true;
  for (const d in room.doors) { const [dx, dy] = DIRS[d]; const n = roomAt(room.gx + dx, room.gy + dy); if (n) n.seen = true; }
  if (!room.bg) room.bg = renderRoomBg(room);
  G.tears.length = 0; G.ebul.length = 0; G.enemies.length = 0; G.parts.length = 0; G.texts.length = 0; G.flow = null; G.bossBar = null;
  if (fromDir) { // fromDir: door we walked through in the previous room
    const enter = OPP[fromDir];
    if (enter === 'n') { p.x = MCX; p.y = WALL + p.r + 6; } if (enter === 's') { p.x = MCX; p.y = RH - WALL - p.r - 6; }
    if (enter === 'w') { p.x = WALL + p.r + 6; p.y = MCY; } if (enter === 'e') { p.x = RW - WALL - p.r - 6; p.y = MCY; }
  } else { p.x = MCX; p.y = MCY; }
  p.vx *= 0.3; p.vy *= 0.3;
  if (!room.cleared) {
    if (room.type === 'boss') spawnBoss(room);
    else spawnWave(room);
    p.inv = Math.max(p.inv, 0.6);
  }
  if (room.type === 'treasure' && !room.announced) { room.announced = true; showBanner('Treasure Room', 'A relic rests here'); }
  if (room.type === 'shop' && !room.announced) { room.announced = true; showBanner('Wandering Merchant', 'Spend your soul crystals'); }
}
function spawnWave(room) {
  const f = G.floor, p = G.player;
  const n = clamp(2 + f + ri(0, 2) + (room.depth > 3 ? 1 : 0), 3, 8);
  const spots = shuffle(freeTiles(room, p, 110));
  const pool = [['goblin', 5], ['ghost', 3], ['slinger', f >= 1 ? 2 : 0], ['wraith', f >= 2 ? 2 + f : 0]];
  const tot = pool.reduce((s, [, w]) => s + w, 0);
  for (let i = 0; i < n && i < spots.length; i++) {
    let r = Math.random() * tot, type = 'goblin';
    for (const [t, w] of pool) { if ((r -= w) < 0) { type = t; break; } }
    spawnEnemy(type, spots[i][0], spots[i][1]);
  }
}

// ===================================================================== room background (pre-rendered)
function renderRoomBg(room) {
  const th = THEMES[(G.floor - 1) % THEMES.length], R = seeded(room.seed);
  const c = mk(RW, RH), x = c.getContext('2d');
  x.fillStyle = '#0a0b0f'; x.fillRect(0, 0, RW, RH);
  // floor: a crop of the ruins art, tinted per floor and darkened so obstacles read clearly
  if (IMG.floor) x.drawImage(IMG.floor, room.fx, room.fy, COLS * TILE, ROWS * TILE, WALL, WALL, COLS * TILE, ROWS * TILE);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = th.tint; x.fillRect(WALL, WALL, COLS * TILE, ROWS * TILE);
  x.globalCompositeOperation = 'source-over'; x.fillStyle = 'rgba(8,10,14,0.22)'; x.fillRect(WALL, WALL, COLS * TILE, ROWS * TILE);
  if (room.type === 'boss') { x.fillStyle = 'rgba(60,0,0,0.18)'; x.fillRect(WALL, WALL, COLS * TILE, ROWS * TILE); }
  // shadow cast by the walls
  const sh = (x0, y0, x1, y1, w, h) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h); };
  sh(0, WALL, 0, WALL + 22, RW, 22); sh(0, RH - WALL, 0, RH - WALL - 10, RW, 10); sh(WALL, 0, WALL + 14, 0, 14, RH); sh(RW - WALL, 0, RW - WALL - 14, 0, 14, RH);
  // walls: stone bricks
  const [wr, wg, wb] = th.wall;
  const brick = (bx, by, bw, bh) => {
    const v = R() * 22 - 11;
    x.fillStyle = `rgb(${wr + v | 0},${wg + v | 0},${wb + v | 0})`; x.fillRect(bx, by, bw, bh);
    x.fillStyle = 'rgba(255,255,255,0.09)'; x.fillRect(bx, by, bw, 1);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(bx, by + bh - 1, bw, 1); x.fillRect(bx + bw - 1, by, 1, bh);
    if (R() < 0.18) { x.fillStyle = 'rgba(0,0,0,0.35)'; const cx = bx + R() * bw | 0; x.fillRect(cx, by + 1, 1, bh - 2); }
  };
  x.fillStyle = '#121419';
  const band = (x0, y0, w, h) => {
    x.fillRect(x0, y0, w, h);
    for (let y = y0; y < y0 + h; y += 8) { const off = ((y - y0) / 8) % 2 ? 8 : 0; for (let bx = x0 - off; bx < x0 + w; bx += 16) brick(Math.max(bx, x0) + 0.5 | 0, y + 0.5 | 0, Math.min(16, x0 + w - Math.max(bx, x0)) - 1, 7); x.fillStyle = '#121419'; }
  };
  band(0, 0, RW, WALL); band(0, RH - WALL, RW, WALL); band(0, WALL, WALL, RH - WALL * 2); band(RW - WALL, WALL, WALL, RH - WALL * 2);
  // moss creeping along the inner edge
  x.fillStyle = th.moss;
  for (let i = 0; i < 160; i++) {
    const side = ri(0, 3), t = R();
    let px, py; if (side === 0) { px = WALL + t * (RW - WALL * 2); py = WALL - R() * 9; } else if (side === 1) { px = WALL + t * (RW - WALL * 2); py = RH - WALL + R() * 6; }
    else if (side === 2) { px = WALL - R() * 7; py = WALL + t * (RH - WALL * 2); } else { px = RW - WALL + R() * 7; py = WALL + t * (RH - WALL * 2); }
    x.globalAlpha = 0.5 + R() * 0.5; x.fillRect(px | 0, py | 0, 1 + (R() * 3 | 0), 1 + (R() * 2 | 0));
  }
  x.globalAlpha = 1;
  // inner lip
  x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(WALL - 2, WALL - 2, RW - WALL * 2 + 4, 2);
  x.strokeStyle = '#0a0b0f'; x.lineWidth = 2; x.strokeRect(WALL - 1, WALL - 1, RW - WALL * 2 + 2, RH - WALL * 2 + 2);
  // corner pillars with runes (echoing the UI frame)
  for (const [cx, cy] of [[0, 0], [RW - WALL, 0], [0, RH - WALL], [RW - WALL, RH - WALL]]) {
    x.fillStyle = '#1a1d24'; x.fillRect(cx + 3, cy + 3, WALL - 6, WALL - 6);
    x.fillStyle = `rgb(${wr + 14},${wg + 14},${wb + 16})`; x.fillRect(cx + 5, cy + 5, WALL - 10, WALL - 10);
    x.fillStyle = '#14161c'; x.fillRect(cx + 9, cy + 9, WALL - 18, WALL - 18);
    x.fillStyle = th.rune; x.shadowColor = th.rune; x.shadowBlur = 6;
    const g = ri(0, 2); x.fillRect(cx + 15, cy + 11, 2, 10); if (g === 0) { x.fillRect(cx + 17, cy + 12, 3, 2); x.fillRect(cx + 17, cy + 16, 3, 2); } else if (g === 1) { x.fillRect(cx + 12, cy + 13, 3, 2); x.fillRect(cx + 17, cy + 13, 3, 2); } else { x.fillRect(cx + 17, cy + 11, 3, 2); x.fillRect(cx + 12, cy + 19, 3, 2); }
    x.shadowBlur = 0;
  }
  // obstacles
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const t = room.grid[ty * COLS + tx], px = WALL + tx * TILE, py = WALL + ty * TILE;
    if (t === 1) drawRock(x, px, py, R, th); else if (t === 2) drawThorns(x, px, py, R);
  }
  return c;
}
function drawRock(x, px, py, R, th) {
  x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(px + 3, py + 6, 28, 26);
  const big = R() < 0.6;
  const blocks = big ? [[px + 2, py + 3, 28, 26]] : [[px + 1, py + 8, 17, 20], [px + 14, py + 3, 17, 18], [px + 12, py + 18, 16, 12]];
  for (const [bx, by, bw, bh] of blocks) {
    const v = R() * 16 - 8, [wr, wg, wb] = th.wall;
    x.fillStyle = '#0e1013'; x.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    x.fillStyle = `rgb(${wr + 20 + v | 0},${wg + 26 + v | 0},${wb + 22 + v | 0})`; x.fillRect(bx, by, bw, bh);
    x.fillStyle = `rgb(${wr + 44 + v | 0},${wg + 52 + v | 0},${wb + 46 + v | 0})`; x.fillRect(bx, by, bw, Math.max(4, bh * 0.35 | 0));
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(bx, by, bw, 1); x.fillRect(bx, by, 1, bh);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(bx, by + bh - 2, bw, 2);
    x.fillStyle = 'rgba(0,0,0,0.5)'; // cracks
    for (let i = 0; i < 2; i++) { let cx = bx + 3 + R() * (bw - 6), cy = by + 3 + R() * (bh - 6); for (let k = 0; k < 4; k++) { x.fillRect(cx | 0, cy | 0, 1, 1); cx += R() * 2 - 1; cy += 1; } }
    x.fillStyle = th.moss; // moss on top
    for (let i = 0; i < 10; i++) { x.fillRect(bx + R() * bw | 0, by + R() * 5 | 0, 2, 1 + (R() * 2 | 0)); }
  }
}
function drawThorns(x, px, py, R) {
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(px + 16, py + 20, 14, 9, 0, 0, TAU); x.fill();
  x.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = R() * TAU, len = 8 + R() * 8, sx = px + 16 + Math.cos(a) * 3, sy = py + 17 + Math.sin(a) * 3;
    const ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len * 0.75;
    x.strokeStyle = i % 2 ? '#3b2a3e' : '#2f4228'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + (R() * 8 - 4), sy + (R() * 8 - 4), ex, ey); x.stroke();
    x.fillStyle = '#c9b8a8';
    for (let k = 1; k <= 2; k++) { const t = k / 3; x.fillRect(lerp(sx, ex, t) | 0, lerp(sy, ey, t) - 1 | 0, 1, 2); }
  }
  x.fillStyle = '#7a3b5a'; for (let i = 0; i < 3; i++) x.fillRect(px + 9 + R() * 14 | 0, py + 10 + R() * 12 | 0, 2, 2);
}

// ===================================================================== entities: enemies
const ETYPES = {
  goblin: { sheet: 'goblin', hp: 10, speed: 62, r: 7, xp: 4, contact: 1, color: '#6fae3c' },
  slinger: { sheet: 'goblinP', hp: 8, speed: 52, r: 7, xp: 5, contact: 1, color: '#9c6fc8' },
  ghost: { sheet: 'ghost', hp: 9, speed: 42, r: 7, xp: 5, contact: 1, flying: true, alpha: 0.88, color: '#9ff0e0' },
  wraith: { sheet: 'ghostW', hp: 15, speed: 50, r: 7, xp: 8, contact: 1, flying: true, alpha: 0.85, color: '#9a8cff' },
  warlord: { sheet: 'goblinB', hp: 150, speed: 54, r: 14, xp: 40, contact: 2, boss: true, color: '#d0603a', name: 'Goblin Warlord' },
  banshee: { sheet: 'ghostB', hp: 130, speed: 40, r: 13, xp: 40, contact: 2, flying: true, boss: true, alpha: 0.9, color: '#ff8adf', name: 'The Banshee' },
};
function spawnEnemy(type, x, y, quick) {
  const d = ETYPES[type], hpMul = 1 + 0.35 * (G.floor - 1);
  const e = { type, d, x, y, vx: 0, vy: 0, r: d.r, hp: d.hp * hpMul, maxHp: d.hp * hpMul, sheet: SHEETS[d.sheet],
    face: 'down', flip: false, anim: Math.random() * 4, state: 'spawn', t: quick ? 0.3 : 0.7, atkCd: rand(0.6, 1.6), pose: 0,
    flash: 0, slow: 0, phase: Math.random() * TAU, alpha: 1, inv: false };
  G.enemies.push(e);
  for (let i = 0; i < 14; i++) part(x + rand(-8, 8), y + rand(-4, 4), rand(-20, 20), rand(-50, -10), rand(0.4, 0.8), '#1a1220', 3, -10);
  return e;
}
function spawnBoss(room) {
  const type = G.floor % 2 === 1 ? 'warlord' : 'banshee';
  const e = spawnEnemy(type, MCX, MCY - 30);
  e.t = 1.4; e.atkCd = 1.2;
  if (G.floor > 2) { e.hp *= 1.2; e.maxHp *= 1.2; }
  G.bossBar = e;
  showBanner(ETYPES[type].name, `Floor ${G.floor} guardian`, true);
  SFX.play('roar'); G.shake = 6;
}
function faceFrom(e, vx, vy) {
  if (Math.abs(vx) > Math.abs(vy) * 1.1) { e.face = 'side'; e.flip = vx < 0; } else if (Math.abs(vy) > 0.01) { e.face = vy < 0 ? 'up' : 'down'; }
}
function moveEnemy(e, dx, dy, speed, dt, accel = 8) {
  const sm = e.slow > 0 ? 0.5 : 1;
  e.vx = lerp(e.vx, dx * speed * sm, Math.min(1, accel * dt)); e.vy = lerp(e.vy, dy * speed * sm, Math.min(1, accel * dt));
}
function enemyShoot(e, ang, speed, kind, r = 3.5, dmg = 1) {
  G.ebul.push({ x: e.x + Math.cos(ang) * 8, y: e.y - 6 + Math.sin(ang) * 8, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r, kind, life: 4, dmg, a: ang });
}
function updateEnemy(e, dt) {
  const p = G.player, room = G.room, d = e.d;
  const dxp = p.x - e.x, dyp = p.y - e.y, dist = hyp(dxp, dyp), angP = Math.atan2(dyp, dxp);
  if (e.flash > 0) e.flash -= dt; if (e.slow > 0) e.slow -= dt;
  e.t -= dt; e.atkCd -= dt;
  if (e.state === 'spawn') { e.alpha = 1 - Math.max(0, e.t) / 0.7; if (e.t <= 0) { e.state = 'move'; e.alpha = 1; } return; }
  const B = AI[e.type]; B(e, dt, { dxp, dyp, dist, angP });
  // integrate + collide
  e.x += e.vx * dt; e.y += e.vy * dt;
  if (!d.flying) collideTiles(e, room, true);
  clampRoom(e);
  if (Math.hypot(e.vx, e.vy) > 6 && !e.pose) faceFrom(e, e.vx, e.vy);
  e.anim += dt * (4 + Math.hypot(e.vx, e.vy) * 0.08);
}
const AI = {
  goblin(e, dt, { dxp, dyp, dist }) {
    if (e.state === 'move') {
      const [mx, my] = flowDir(e); moveEnemy(e, mx, my, e.d.speed, dt);
      if (dist < 30 && e.atkCd <= 0) { e.state = 'windup'; e.t = 0.32; e.pose = 1; faceFrom(e, dxp, dyp); e.ax = dxp / dist; e.ay = dyp / dist; }
    } else if (e.state === 'windup') {
      moveEnemy(e, 0, 0, 0, dt, 12);
      if (e.t <= 0) {
        e.state = 'recover'; e.t = 0.35; e.pose = 2; SFX.play('slash');
        const hx = e.x + e.ax * 16, hy = e.y + e.ay * 16;
        slashFx(hx, hy, Math.atan2(e.ay, e.ax), '#e8eef0');
        if (hyp(G.player.x - hx, G.player.y - hy) < 17) hurtPlayer(1, e.x, e.y);
        e.vx += e.ax * 60; e.vy += e.ay * 60;
      }
    } else if (e.state === 'recover') { moveEnemy(e, 0, 0, 0, dt, 6); if (e.t <= 0) { e.state = 'move'; e.pose = 0; e.atkCd = rand(0.7, 1.1); } }
  },
  slinger(e, dt, { dxp, dyp, dist, angP }) {
    if (e.state === 'move') {
      let mx = 0, my = 0;
      if (dist > 150) [mx, my] = flowDir(e);
      else if (dist < 95) [mx, my] = norm(-dxp, -dyp);
      else { const s = Math.sin(G.time * 1.3 + e.phase) > 0 ? 1 : -1; [mx, my] = norm(-dyp * s, dxp * s); }
      moveEnemy(e, mx, my, e.d.speed, dt);
      if (e.atkCd <= 0 && dist < 220 && lineClear(G.room, e.x, e.y, G.player.x, G.player.y)) { e.state = 'windup'; e.t = 0.42; e.pose = 1; faceFrom(e, dxp, dyp); }
    } else if (e.state === 'windup') {
      moveEnemy(e, 0, 0, 0, dt, 12);
      if (e.t <= 0) {
        SFX.play('throw'); const n = G.floor >= 3 ? 3 : 1;
        for (let i = 0; i < n; i++) enemyShoot(e, angP + (i - (n - 1) / 2) * 0.22, 150, 'dagger');
        e.state = 'recover'; e.t = 0.3; e.pose = 2;
      }
    } else if (e.state === 'recover') { moveEnemy(e, 0, 0, 0, dt, 6); if (e.t <= 0) { e.state = 'move'; e.pose = 0; e.atkCd = rand(1.7, 2.5); } }
  },
  ghost(e, dt, { dxp, dyp, dist }) {
    if (e.state === 'move') {
      const w = Math.sin(G.time * 3 + e.phase) * 0.6;
      const [mx, my] = norm(dxp / dist - dyp / dist * w, dyp / dist + dxp / dist * w);
      moveEnemy(e, mx, my, e.d.speed, dt, 3);
      if (e.atkCd <= 0 && dist < 200) { e.state = 'windup'; e.t = 0.55; e.pose = 1; e.face = 'down'; e.flip = false; SFX.play('cast'); }
    } else if (e.state === 'windup') {
      moveEnemy(e, 0, 0, 0, dt, 5);
      if (e.t <= 0) {
        SFX.play('orb');
        const base = (e.cross = !e.cross) ? 0 : Math.PI / 4;
        for (let i = 0; i < 4; i++) enemyShoot(e, base + i * Math.PI / 2, 85, 'orb');
        e.state = 'move'; e.pose = 0; e.atkCd = rand(2.4, 3.4);
      }
    }
  },
  wraith(e, dt, { dxp, dyp, dist, angP }) {
    if (e.state === 'move') {
      const w = Math.sin(G.time * 2 + e.phase) * 0.8;
      const [mx, my] = norm(dxp / dist - dyp / dist * w, dyp / dist + dxp / dist * w);
      moveEnemy(e, mx, my, e.d.speed, dt, 3);
      if (e.atkCd <= 0 && dist < 230) { e.state = 'windup'; e.t = 0.6; e.pose = 1; e.face = 'down'; e.flip = false; SFX.play('cast'); }
    } else if (e.state === 'windup') {
      moveEnemy(e, 0, 0, 0, dt, 5);
      if (e.t <= 0) { SFX.play('orb'); for (let i = 0; i < 8; i++) enemyShoot(e, angP + i * TAU / 8, 80, 'orbP'); e.state = 'move'; e.pose = 0; e.atkCd = rand(2.6, 3.4); }
    }
  },
  warlord(e, dt, { dxp, dyp, dist, angP }) {
    const enraged = e.hp < e.maxHp * 0.5;
    if (e.state === 'move') {
      const [mx, my] = flowDir(e); moveEnemy(e, mx, my, e.d.speed * (enraged ? 1.25 : 1), dt, 4);
      if (e.atkCd <= 0) {
        const opts = ['charge', 'fan', dist < 50 ? 'slam' : 'charge'];
        if (enraged && !e.summoned) opts.push('summon', 'summon');
        const a = pick(opts); e.atk = a;
        if (a === 'charge') { e.state = 'aim'; e.t = 0.7; e.pose = 1; e.ca = angP; faceFrom(e, dxp, dyp); }
        else if (a === 'fan') { e.state = 'fan'; e.t = 0; e.vol = enraged ? 4 : 3; e.pose = 1; faceFrom(e, dxp, dyp); }
        else if (a === 'slam') { e.state = 'slamwind'; e.t = 0.45; e.pose = 1; }
        else { e.state = 'summon'; e.t = 0.6; e.pose = 1; }
      }
    } else if (e.state === 'aim') {
      moveEnemy(e, 0, 0, 0, dt, 10); e.ca = Math.atan2(dyp, dxp);
      if (e.t <= 0) { e.state = 'charge'; e.t = 0.9; e.pose = 2; SFX.play('dash'); }
    } else if (e.state === 'charge') {
      e.vx = Math.cos(e.ca) * 250; e.vy = Math.sin(e.ca) * 250;
      if (Math.random() < 0.6) part(e.x, e.y + 8, rand(-20, 20), rand(-20, 0), 0.4, '#5a4a3a', 3);
      const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
      const wall = nx < WALL + e.r + 1 || nx > RW - WALL - e.r - 1 || ny < WALL + e.r + 1 || ny > RH - WALL - e.r - 1 || solidAt(G.room, nx + Math.cos(e.ca) * e.r, ny + Math.sin(e.ca) * e.r);
      if (wall || e.t <= 0) {
        e.vx = e.vy = 0; e.state = 'stun'; e.t = wall ? 0.9 : 0.4; e.pose = 0;
        if (wall) { G.shake = 8; SFX.play('boom'); for (let i = 0; i < (enraged ? 10 : 7); i++) enemyShoot(e, e.ca + Math.PI + (i / (enraged ? 9 : 6) - 0.5) * 2.2, rand(100, 150), 'rock'); }
      }
    } else if (e.state === 'stun') { moveEnemy(e, 0, 0, 0, dt, 10); if (e.t <= 0) { e.state = 'move'; e.atkCd = rand(1.0, 1.6); } }
    else if (e.state === 'fan') {
      moveEnemy(e, 0, 0, 0, dt, 10);
      if (e.t <= 0) {
        if (e.vol-- <= 0) { e.state = 'move'; e.pose = 0; e.atkCd = rand(1.2, 1.8); return; }
        SFX.play('throw'); e.pose = e.pose === 1 ? 2 : 1; faceFrom(e, dxp, dyp);
        const n = 5; for (let i = 0; i < n; i++) enemyShoot(e, angP + (i - 2) * 0.28 + (e.vol % 2 ? 0.14 : 0), 145, 'dagger');
        e.t = 0.45;
      }
    } else if (e.state === 'slamwind') {
      moveEnemy(e, 0, 0, 0, dt, 10);
      if (e.t <= 0) { SFX.play('boom'); G.shake = 7; e.pose = 2; for (let i = 0; i < 14; i++) enemyShoot(e, i * TAU / 14, 110, 'rock'); slashFx(e.x, e.y, 0, '#cfa070', 26); e.state = 'stun'; e.t = 0.6; }
    } else if (e.state === 'summon') {
      moveEnemy(e, 0, 0, 0, dt, 10);
      if (e.t <= 0) { e.summoned = true; SFX.play('roar'); for (const s of [-1, 1]) { const [sx, sy] = nearestFree(G.room, e.x + s * 60, e.y); spawnEnemy('goblin', sx, sy, true); } e.state = 'move'; e.pose = 0; e.atkCd = 1.5; }
    }
  },
  banshee(e, dt, { dxp, dyp, dist, angP }) {
    const enraged = e.hp < e.maxHp * 0.5;
    if (e.state === 'move') {
      const w = Math.sin(G.time * 1.5) * 0.9; const [mx, my] = norm(dxp / dist - dyp / dist * w, dyp / dist + dxp / dist * w);
      moveEnemy(e, mx, my, dist > 90 ? e.d.speed : -e.d.speed * 0.5, dt, 2);
      if (e.atkCd <= 0) {
        const a = pick(['spiral', 'rings', 'vanish', enraged ? 'spiral' : 'rings']); e.state = a; e.pose = 1; e.face = 'down'; e.flip = false;
        if (a === 'spiral') { e.t = enraged ? 3 : 2.3; e.sa = angP; e.st = 0; SFX.play('cast'); }
        if (a === 'rings') { e.t = 0; e.vol = enraged ? 4 : 3; }
        if (a === 'vanish') { e.t = 0.45; SFX.play('cast'); }
      }
    } else if (e.state === 'spiral') {
      moveEnemy(e, 0, 0, 0, dt, 4); e.st -= dt; e.sa += dt * 2.2;
      if (e.st <= 0) { e.st = 0.1; SFX.play('orb'); const arms = enraged ? 3 : 2; for (let i = 0; i < arms; i++) enemyShoot(e, e.sa + i * TAU / arms, 95, 'orbP'); }
      if (e.t <= 0) { e.state = 'move'; e.pose = 0; e.atkCd = rand(1.3, 2); }
    } else if (e.state === 'rings') {
      moveEnemy(e, 0, 0, 0, dt, 4);
      if (e.t <= 0) {
        if (e.vol-- <= 0) { e.state = 'move'; e.pose = 0; e.atkCd = rand(1.2, 1.8); return; }
        SFX.play('orb'); const n = 14, off = e.vol % 2 ? TAU / n / 2 : 0;
        for (let i = 0; i < n; i++) enemyShoot(e, off + i * TAU / n, 80, 'orbP');
        e.t = 0.55;
      }
    } else if (e.state === 'vanish') {
      moveEnemy(e, 0, 0, 0, dt, 6); e.alpha = Math.max(0, e.t / 0.45); e.inv = true;
      if (e.t <= 0) {
        const spots = freeTiles(G.room, G.player, 130); const s = pick(spots.length ? spots : freeTiles(G.room));
        e.x = s[0]; e.y = s[1]; e.state = 'appear'; e.t = 0.45;
      }
    } else if (e.state === 'appear') {
      e.alpha = 1 - e.t / 0.45;
      if (e.t <= 0) { e.alpha = 1; e.inv = false; SFX.play('orb'); for (let i = 0; i < 10; i++) enemyShoot(e, angP + i * TAU / 10, 105, 'orbP'); e.state = 'move'; e.pose = 0; e.atkCd = rand(0.9, 1.4); }
    }
  },
};

// ===================================================================== combat
function damageEnemy(e, dmg, kx, ky, src) {
  if (e.state === 'spawn' || e.inv || e.hp <= 0) return false;
  e.hp -= dmg; e.flash = 0.09;
  const kb = e.d.boss ? 0.15 : 1;
  e.vx += kx * 90 * kb; e.vy += ky * 90 * kb;
  const fr = G.player.skills.frost || 0;
  if (fr && src === 'tear' && Math.random() < fr * 0.2) { e.slow = 2; for (let i = 0; i < 5; i++) part(e.x, e.y - 8, rand(-30, 30), rand(-30, 30), 0.5, '#bfefff', 2); }
  for (let i = 0; i < 4; i++) part(e.x + rand(-4, 4), e.y - 8 + rand(-4, 4), kx * 60 + rand(-40, 40), ky * 60 + rand(-40, 40), rand(0.2, 0.4), e.d.color, 2);
  G.texts.push({ x: e.x + rand(-4, 4), y: e.y - 22, t: 0.6, text: fmt(dmg), color: '#fff' });
  SFX.play('hit');
  if (e.hp <= 0) killEnemy(e);
  return true;
}
function killEnemy(e) {
  const p = G.player;
  e.dead = true; G.kills++; p.kills++;
  SFX.play(e.d.boss ? 'boom' : 'kill');
  const n = e.d.boss ? 70 : 18;
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(20, e.d.boss ? 200 : 110); part(e.x, e.y - 8, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.9), i % 3 ? e.d.color : '#1a1a1a', rand(2, 4), 80); }
  G.shake = Math.max(G.shake, e.d.boss ? 12 : 2.5);
  if (e.d.boss) { G.slowmo = 0.9; G.bossBar = null; }
  gainXp(e.d.xp);
  // drops
  const luck = p.luck;
  if (Math.random() < 0.32 + luck * 0.05) dropPickup(Math.random() < 0.12 ? 'bigcrystal' : 'crystal', e.x, e.y);
  if (Math.random() < 0.05 + luck * 0.02) dropPickup('halfheart', e.x, e.y);
  const v = p.skills.vamp || 0;
  if (v && ++p.vampKills >= 16 - v * 4) { p.vampKills = 0; if (p.hp < p.maxHp) { p.hp += 1; SFX.play('heart'); G.texts.push({ x: p.x, y: p.y - 26, t: 0.9, text: '+♥', color: '#ff6a7a' }); } }
}
function gainXp(n) {
  const p = G.player; p.xp += n;
  while (p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; G.pendingLv++; G.lvDelay = 0.45; }
}
function hurtPlayer(n, sx, sy) {
  const p = G.player;
  if (p.inv > 0 || G.dying || mode !== 'play') return;
  p.hp -= n; p.inv = 1.1; G.freeze = 0.07; G.shake = 7; G.hurtFlash = 0.25;
  const [kx, ky] = norm(p.x - sx, p.y - sy); p.vx += kx * 160; p.vy += ky * 160;
  SFX.play('hurt');
  for (let i = 0; i < 12; i++) part(p.x, p.y - 8, rand(-90, 90), rand(-90, 60), rand(0.3, 0.6), '#c3243a', 2, 120);
  const m = p.skills.mantle || 0;
  if (m) { const k = 6 + m * 2; for (let i = 0; i < k; i++) { const a = i * TAU / k; fireTear(p.x, p.y - 6, Math.cos(a), Math.sin(a), { dmg: 2 + m * 1.5, thorn: true, noSplit: true }); } }
  if (p.hp <= 0) { p.hp = 0; G.dying = 1.4; G.slowmo = 1.4; SFX.play('die'); }
}
function fireTear(x, y, dx, dy, o = {}) {
  const p = G.player;
  const sp = p.shotSpeed * (o.thorn ? 1.1 : 1);
  G.tears.push({ x, y, vx: dx * sp + (o.thorn ? 0 : p.vx * 0.25), vy: dy * sp + (o.thorn ? 0 : p.vy * 0.25), r: o.thorn ? 3 : 3.5 + Math.min(2, p.dmg / 6),
    dmg: o.dmg || p.dmg, life: (o.thorn ? 140 : p.range) / sp, pierce: o.thorn ? 0 : p.skills.pierce || 0,
    bounce: o.thorn ? 0 : p.skills.bounce || 0, homing: o.thorn ? 0 : p.skills.homing || 0, hit: new Set(), thorn: !!o.thorn, z: 0 });
}
function playerShoot(ax, ay) {
  const p = G.player;
  const base = Math.atan2(ay, ax), n = 1 + (p.skills.split || 0), spread = 0.17;
  for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * spread; fireTear(p.x + Math.cos(a) * 5, p.y - 8 + Math.sin(a) * 4, Math.cos(a), Math.sin(a)); }
  if (p.skills.rear) fireTear(p.x, p.y - 8, -Math.cos(base), -Math.sin(base));
  SFX.play('shoot');
}
function slashFx(x, y, ang, color, size = 14) {
  G.parts.push({ x, y, vx: 0, vy: 0, t: 0.16, max: 0.16, color, size, arc: ang, grav: 0 });
}
function part(x, y, vx, vy, t, color, size = 2, grav = 0) {
  if (G.parts.length > 500) G.parts.shift();
  G.parts.push({ x, y, vx, vy, t, max: t, color, size, grav });
}
function dropPickup(type, x, y) {
  const [px, py] = solidAt(G.room, x, y) ? nearestFree(G.room, x, y) : [x, y];
  G.room.pickups.push({ type, x: px, y: py, vx: rand(-50, 50), vy: rand(-50, 50), z: 0, vz: 70, t: 0, delay: 0.35 });
}

// ===================================================================== input
const keys = new Set();
const input = { mx: 0, my: 0, ax: 0, ay: 0, aimMouse: false, mouseX: 0, mouseY: 0, mouseDown: false };
const sticks = { move: null, aim: null };
window.addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) ev.preventDefault();
  keys.add(k); SFX.init();
  if (mode === 'title' && (k === 'enter' || k === ' ')) startGame();
  else if (mode === 'play' && (k === 'escape' || k === 'p')) pauseGame();
  else if (mode === 'pause' && (k === 'escape' || k === 'p')) resumeGame();
  else if (mode === 'dead' && k === 'enter') startGame();
  else if (mode === 'levelup') lvKey(k);
  if (k === 'm') toggleSound();
});
window.addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); input.mouseDown = false; if (mode === 'play') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pauseGame(); });

function canvasPoint(cx, cy) { const r = cv.getBoundingClientRect(); return [(cx - r.left) / r.width * VW, (cy - r.top) / r.height * VH]; }
const PAUSE_BTN = { x: 396, y: 8, w: 20, h: 20 };
const inPauseBtn = (x, y) => x >= PAUSE_BTN.x - 6 && x <= PAUSE_BTN.x + PAUSE_BTN.w + 6 && y >= PAUSE_BTN.y - 6 && y <= PAUSE_BTN.y + PAUSE_BTN.h + 6;
cv.addEventListener('mousedown', (ev) => {
  SFX.init(); const [x, y] = canvasPoint(ev.clientX, ev.clientY);
  if (mode === 'play' && inPauseBtn(x, y)) { pauseGame(); return; }
  input.mouseDown = true; input.mouseX = x; input.mouseY = y;
});
window.addEventListener('mousemove', (ev) => { const [x, y] = canvasPoint(ev.clientX, ev.clientY); input.mouseX = x; input.mouseY = y; });
window.addEventListener('mouseup', () => { input.mouseDown = false; });
cv.addEventListener('contextmenu', (ev) => ev.preventDefault());

// twin-stick touch: left half moves, right half aims; sticks appear where the thumb lands
const STICK_R = 55;
function stickEl(which) { return which === 'move' ? $('stickMove') : $('stickAim'); }
window.addEventListener('touchstart', (ev) => {
  SFX.init();
  if (mode !== 'play') return;
  for (const t of ev.changedTouches) {
    const [x, y] = canvasPoint(t.clientX, t.clientY);
    if (inPauseBtn(x, y)) { pauseGame(); ev.preventDefault(); return; }
    const which = t.clientX < window.innerWidth / 2 ? 'move' : 'aim';
    if (sticks[which]) continue;
    sticks[which] = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
    const el = stickEl(which); el.style.display = 'block'; el.style.left = t.clientX + 'px'; el.style.top = t.clientY + 'px'; el.firstElementChild.style.transform = '';
  }
  ev.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', (ev) => {
  for (const t of ev.changedTouches) for (const which of ['move', 'aim']) {
    const s = sticks[which]; if (!s || s.id !== t.identifier) continue;
    let dx = t.clientX - s.ox, dy = t.clientY - s.oy; const d = hyp(dx, dy);
    if (d > STICK_R) { // drag the base along so the stick never "runs out"
      const over = d - STICK_R; s.ox += dx / d * over; s.oy += dy / d * over; dx = t.clientX - s.ox; dy = t.clientY - s.oy;
      const el = stickEl(which); el.style.left = s.ox + 'px'; el.style.top = s.oy + 'px';
    }
    s.dx = dx / STICK_R; s.dy = dy / STICK_R;
    stickEl(which).firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  }
  if (mode === 'play') ev.preventDefault();
}, { passive: false });
function endTouch(ev) {
  for (const t of ev.changedTouches) for (const which of ['move', 'aim']) {
    const s = sticks[which]; if (s && s.id === t.identifier) { sticks[which] = null; stickEl(which).style.display = 'none'; }
  }
}
window.addEventListener('touchend', endTouch); window.addEventListener('touchcancel', endTouch);
function clearSticks() { for (const w of ['move', 'aim']) { sticks[w] = null; stickEl(w).style.display = 'none'; } }

function readInput() {
  let mx = 0, my = 0, ax = 0, ay = 0;
  if (keys.has('a')) mx -= 1; if (keys.has('d')) mx += 1; if (keys.has('w')) my -= 1; if (keys.has('s')) my += 1;
  if (keys.has('arrowleft')) ax -= 1; if (keys.has('arrowright')) ax += 1; if (keys.has('arrowup')) ay -= 1; if (keys.has('arrowdown')) ay += 1;
  const ml = hyp(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  if (sticks.move) { const s = sticks.move, l = hyp(s.dx, s.dy); if (l > 0.18) { const k = Math.min(1, (l - 0.18) / 0.62) / l; mx = s.dx * k * l; my = s.dy * k * l; const m2 = hyp(mx, my); if (m2 > 1) { mx /= m2; my /= m2; } } }
  if (sticks.aim) { const s = sticks.aim; if (hyp(s.dx, s.dy) > 0.3) { ax = s.dx; ay = s.dy; } }
  if (input.mouseDown && !ax && !ay) { const p = G.player; ax = input.mouseX - p.x; ay = input.mouseY - HUD - (p.y - 8); }
  const al = hyp(ax, ay); if (al) { ax /= al; ay /= al; }
  input.mx = mx; input.my = my; input.ax = ax; input.ay = ay;
}

// ===================================================================== update
function update(dt) {
  G.time += dt;
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
  if (G.hurtFlash > 0) G.hurtFlash -= dt;
  G.shake = Math.max(0, G.shake - dt * 30);
  if (G.fade) return updateFade(dt);
  if (G.trans) return updateTrans(dt);
  if (G.freeze > 0) { G.freeze -= dt; return; }
  if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.35; }
  if (G.dying) { G.dying -= dt / 0.35; updateParticles(dt); if (G.dying <= 0) gameOver(); return; }
  readInput();
  updatePlayer(dt);
  updateTears(dt);
  for (const e of G.enemies) updateEnemy(e, dt);
  separateEnemies();
  G.enemies = G.enemies.filter((e) => !e.dead);
  updateBullets(dt);
  updatePickups(dt);
  updateParticles(dt);
  checkRoomClear();
  if (G.pendingLv > 0 && !G.dying) { G.lvDelay -= dt; if (G.lvDelay <= 0) openLevelUp(); }
}
function updatePlayer(dt) {
  const p = G.player, room = G.room;
  if (p.inv > 0) p.inv -= dt;
  const accel = 14;
  p.vx = lerp(p.vx, input.mx * p.speed, Math.min(1, accel * dt)); p.vy = lerp(p.vy, input.my * p.speed, Math.min(1, accel * dt));
  p.x += p.vx * dt; p.y += p.vy * dt;
  collideTiles(p, room, false); clampRoom(p);
  // thorn bushes hurt
  const tt = tileAt(room, toT(p.x), toT(p.y + 2));
  if (tt === 2) hurtPlayer(1, WALL + toT(p.x) * TILE + 16, WALL + toT(p.y + 2) * TILE + 16);
  const moving = hyp(p.vx, p.vy) > 12;
  if (moving) { p.anim += dt * hyp(p.vx, p.vy) * 0.075; p.stepT -= dt; if (p.stepT <= 0) { p.stepT = 0.28; part(p.x + rand(-3, 3), p.y + 4, rand(-10, 10), rand(-12, -4), 0.35, 'rgba(120,110,90,0.7)', 2); } }
  else p.anim = 0;
  // facing: aim wins over movement (Isaac's head-turn)
  const fx = input.ax || input.mx, fy = input.ay || input.my;
  if (fx || fy) { if (Math.abs(fx) > Math.abs(fy)) { p.face = 'side'; p.flip = fx < 0; } else p.face = fy < 0 ? 'up' : 'down'; }
  p.fireCd -= dt;
  if ((input.ax || input.ay) && p.fireCd <= 0) { p.fireCd = p.fireDelay; playerShoot(input.ax, input.ay); }
  // orbiting crystals
  const orbs = p.skills.orbit || 0;
  if (orbs) {
    p.orbA += dt * 3.2;
    for (let i = 0; i < orbs; i++) {
      const a = p.orbA + i * TAU / orbs, ox = p.x + Math.cos(a) * 24, oy = p.y - 6 + Math.sin(a) * 24;
      for (const e of G.enemies) { if (hyp(e.x - ox, e.y - 8 - oy) < e.r + 6) { const k = p.orbHits.get(e) || 0; if (G.time > k) { p.orbHits.set(e, G.time + 0.35); damageEnemy(e, p.dmg * 0.6, Math.cos(a), Math.sin(a), 'orb'); } } }
      for (const b of G.ebul) if (hyp(b.x - ox, b.y - oy) < b.r + 5) { b.dead = true; part(b.x, b.y, 0, 0, 0.2, '#9fe8ff', 3); }
    }
  }
  // doors
  if (room.cleared) {
    const lane = 12;
    const tryDoor = (d, cond) => { if (room.doors[d] && cond) startTrans(d); };
    tryDoor('n', Math.abs(p.x - MCX) < lane && p.y - p.r <= WALL + 0.5 && input.my < -0.2);
    tryDoor('s', Math.abs(p.x - MCX) < lane && p.y + p.r >= RH - WALL - 0.5 && input.my > 0.2);
    tryDoor('w', Math.abs(p.y - MCY) < lane && p.x - p.r <= WALL + 0.5 && input.mx < -0.2);
    tryDoor('e', Math.abs(p.y - MCY) < lane && p.x + p.r >= RW - WALL - 0.5 && input.mx > 0.2);
    // gentle funnel: near a door, nudge the player into the lane so doors feel easy to hit
    for (const d in room.doors) {
      if (d === 'n' && p.y < WALL + 26 && Math.abs(p.x - MCX) < 26 && input.my < 0) p.x = lerp(p.x, MCX, Math.min(1, 6 * dt));
      if (d === 's' && p.y > RH - WALL - 26 && Math.abs(p.x - MCX) < 26 && input.my > 0) p.x = lerp(p.x, MCX, Math.min(1, 6 * dt));
      if (d === 'w' && p.x < WALL + 26 && Math.abs(p.y - MCY) < 26 && input.mx < 0) p.y = lerp(p.y, MCY, Math.min(1, 6 * dt));
      if (d === 'e' && p.x > RW - WALL - 26 && Math.abs(p.y - MCY) < 26 && input.mx > 0) p.y = lerp(p.y, MCY, Math.min(1, 6 * dt));
    }
  }
  // contact damage
  for (const e of G.enemies) if (e.state !== 'spawn' && e.alpha > 0.5 && hyp(e.x - p.x, e.y - p.y) < e.r + p.r - 1) hurtPlayer(e.d.contact, e.x, e.y);
  // trapdoor
  if (room.trapdoor && hyp(p.x - MCX, p.y - MCY) < 10) descend();
  // pedestals
  for (const ped of room.peds) {
    if (ped.taken) continue;
    const near = hyp(p.x - ped.x, p.y - ped.y) < 15;
    if (near && !ped.blocked) {
      if (ped.price > p.crystals) { ped.blocked = true; SFX.play('deny'); G.texts.push({ x: ped.x, y: ped.y - 30, t: 1, text: `Need ${ped.price}`, color: '#ff9a7a' }); }
      else takePedestal(ped);
    } else if (!near && hyp(p.x - ped.x, p.y - ped.y) > 22) ped.blocked = false;
  }
}
function takePedestal(ped) {
  const p = G.player;
  p.crystals -= ped.price; ped.taken = true;
  if (ped.kind === 'heart') { p.hp = Math.min(p.maxHp, p.hp + 2); SFX.play('heart'); G.texts.push({ x: ped.x, y: ped.y - 26, t: 1, text: '+♥', color: '#ff6a7a' }); }
  else { const u = upgradeFor(ped.id); applyUpgrade(ped.id); SFX.play('item'); showBanner(u.name, u.desc); for (let i = 0; i < 30; i++) part(ped.x, ped.y - 16, rand(-80, 80), rand(-120, 0), rand(0.4, 0.9), i % 2 ? '#e8b65a' : '#7fdcff', 2, 60); }
  if (ped.price) SFX.play('buy');
}
function separateEnemies() {
  const es = G.enemies;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i], b = es[j], dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy), m = a.r + b.r;
    if (d < m && d > 0) { const push = (m - d) / 2, nx = dx / d, ny = dy / d; if (!a.d.boss) { a.x -= nx * push; a.y -= ny * push; } if (!b.d.boss) { b.x += nx * push; b.y += ny * push; } }
  }
}
function updateTears(dt) {
  const room = G.room;
  for (const t of G.tears) {
    if (t.homing && G.enemies.length) {
      let best = null, bd = 150; for (const e of G.enemies) { if (e.state === 'spawn' || t.hit.has(e)) continue; const d = hyp(e.x - t.x, e.y - 8 - t.y); if (d < bd) { bd = d; best = e; } }
      if (best) { const sp = hyp(t.vx, t.vy), cur = Math.atan2(t.vy, t.vx), want = Math.atan2(best.y - 8 - t.y, best.x - t.x);
        let da = ((want - cur + Math.PI * 3) % TAU) - Math.PI; const turn = (2 + t.homing * 2) * dt; da = clamp(da, -turn, turn); t.vx = Math.cos(cur + da) * sp; t.vy = Math.sin(cur + da) * sp; }
    }
    t.x += t.vx * dt; t.y += t.vy * dt; t.life -= dt;
    // walls
    let hitWall = false;
    if (t.x < WALL || t.x > RW - WALL) { if (t.bounce > 0) { t.bounce--; t.vx *= -1; t.x = clamp(t.x, WALL, RW - WALL); } else hitWall = true; }
    if (t.y < WALL - 10 || t.y > RH - WALL - 4) { if (t.bounce > 0) { t.bounce--; t.vy *= -1; t.y = clamp(t.y, WALL - 10, RH - WALL - 4); } else hitWall = true; }
    if (hitWall || solidAt(room, t.x, t.y + 6) || t.life <= 0) { t.dead = true; splash(t); continue; }
    for (const e of G.enemies) {
      if (t.hit.has(e) || e.dead) continue;
      if (hyp(e.x - t.x, e.y - 8 - t.y) < e.r + t.r + 2) {
        const sp = hyp(t.vx, t.vy) || 1;
        if (damageEnemy(e, t.dmg, t.vx / sp, t.vy / sp, 'tear')) {
          t.hit.add(e);
          if (t.pierce > 0) t.pierce--; else { t.dead = true; splash(t); break; }
        }
      }
    }
  }
  G.tears = G.tears.filter((t) => !t.dead);
}
function splash(t) {
  SFX.play('splash');
  const c = t.thorn ? '#9ccf6a' : '#8fe6ff';
  for (let i = 0; i < 6; i++) part(t.x, t.y, rand(-60, 60), rand(-60, 30), rand(0.15, 0.35), c, 2, 100);
}
function updateBullets(dt) {
  const p = G.player, room = G.room;
  for (const b of G.ebul) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const spectral = b.kind === 'orb' || b.kind === 'orbP';
    if (b.x < WALL - 4 || b.x > RW - WALL + 4 || b.y < WALL - 4 || b.y > RH - WALL + 4 || b.life <= 0 || (!spectral && solidAt(room, b.x, b.y))) {
      b.dead = true; for (let i = 0; i < 4; i++) part(b.x, b.y, rand(-40, 40), rand(-40, 40), 0.25, bulletColor(b), 2); continue;
    }
    if (hyp(p.x - b.x, p.y - 6 - b.y) < p.r + b.r - 1) { b.dead = true; hurtPlayer(b.dmg, b.x - b.vx, b.y - b.vy); }
  }
  G.ebul = G.ebul.filter((b) => !b.dead);
}
const bulletColor = (b) => (b.kind === 'orb' ? '#9ff0e0' : b.kind === 'orbP' ? '#d48cff' : b.kind === 'rock' ? '#a08870' : '#d8d0c0');
function updatePickups(dt) {
  const p = G.player, list = G.room.pickups;
  for (const k of list) {
    k.t += dt;
    if (k.vz || k.z > 0) { k.vz -= 260 * dt; k.z = Math.max(0, k.z + k.vz * dt); if (k.z === 0) k.vz = 0; }
    k.x += k.vx * dt; k.y += k.vy * dt; k.vx *= Math.pow(0.02, dt); k.vy *= Math.pow(0.02, dt);
    const kr = { x: k.x, y: k.y, r: 4 }; collideTiles(kr, G.room, false); clampRoom(kr); k.x = kr.x; k.y = kr.y;
    if (k.t < k.delay) continue;
    const isHeart = k.type === 'heart' || k.type === 'halfheart';
    const canTake = !isHeart || p.hp < p.maxHp;
    const d = hyp(p.x - k.x, p.y - k.y);
    if (canTake && d < 56) { const pull = (1 - d / 56) * 600 * dt; k.x += (p.x - k.x) / d * pull; k.y += (p.y - k.y) / d * pull; }
    if (canTake && d < p.r + 6) {
      k.dead = true;
      if (k.type === 'crystal') { p.crystals += 1; SFX.play('crystal'); }
      else if (k.type === 'bigcrystal') { p.crystals += 5; SFX.play('crystal'); G.texts.push({ x: k.x, y: k.y - 14, t: 0.8, text: '+5', color: '#8fe6ff' }); }
      else { p.hp = Math.min(p.maxHp, p.hp + (k.type === 'heart' ? 2 : 1)); SFX.play('heart'); }
      for (let i = 0; i < 6; i++) part(k.x, k.y - 4, rand(-40, 40), rand(-60, 0), 0.3, isHeart ? '#ff6a7a' : '#8fe6ff', 2);
    }
  }
  G.room.pickups = list.filter((k) => !k.dead);
}
function updateParticles(dt) {
  for (const q of G.parts) { q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.grav || 0) * dt; q.vx *= Math.pow(0.1, dt); }
  G.parts = G.parts.filter((q) => q.t > 0);
  for (const t of G.texts) { t.t -= dt; t.y -= 22 * dt; }
  G.texts = G.texts.filter((t) => t.t > 0);
}
function checkRoomClear() {
  const room = G.room;
  if (room.cleared || G.enemies.length) return;
  room.cleared = true;
  SFX.play('door'); G.shake = Math.max(G.shake, 3);
  const p = G.player, luck = p.luck;
  if (room.type === 'boss') {
    room.trapdoor = true;
    room.peds.push(makePed('skill', MCX, MCY - 52, 0));
    dropPickup('heart', MCX - 30, MCY + 20); for (let i = 0; i < 4; i++) dropPickup('crystal', MCX + 30, MCY + 20);
    showBanner('Guardian Slain', 'A passage opens below');
  } else {
    const r = Math.random() - luck * 0.04;
    const [x, y] = nearestFree(room, MCX, MCY);
    if (r < 0.22) dropPickup('heart', x, y);
    else if (r < 0.52) for (let i = 0; i < 3; i++) dropPickup('crystal', x, y);
    else if (r < 0.66) dropPickup('bigcrystal', x, y);
  }
}
// ---- room transition
function startTrans(dir) {
  const [dx, dy] = DIRS[dir], to = roomAt(G.room.gx + dx, G.room.gy + dy);
  if (!to) return;
  if (!to.bg) to.bg = renderRoomBg(to);
  G.trans = { from: G.room, to, dir, t: 0, dur: 0.38 };
  G.tears.length = 0; G.ebul.length = 0;
}
function updateTrans(dt) {
  const tr = G.trans; tr.t += dt;
  if (tr.t >= tr.dur) { G.trans = null; enterRoom(tr.to, tr.dir); }
}
function descend() {
  if (G.fade) return;
  SFX.play('descend');
  G.fade = { t: 0, dur: 1.2, swapped: false };
}
function updateFade(dt) {
  const f = G.fade; f.t += dt;
  if (!f.swapped && f.t >= f.dur / 2) {
    f.swapped = true; G.floor++;
    genFloor(); enterRoom(G.start, null);
    const th = THEMES[(G.floor - 1) % THEMES.length];
    showBanner(`Floor ${G.floor}`, th.name);
    saveBest();
  }
  if (f.t >= f.dur) G.fade = null;
}
function showBanner(title, sub, boss) { G.banner = { title, sub, t: 0, dur: boss ? 2.6 : 2.4, boss }; }

// ===================================================================== render
function render() {
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
  if (!G) return;
  const sx = G.shake ? rand(-G.shake, G.shake) * 0.5 : 0, sy = G.shake ? rand(-G.shake, G.shake) * 0.5 : 0;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, HUD, RW, RH); ctx.clip();
  if (G.trans) {
    const tr = G.trans, k = ease(Math.min(1, tr.t / tr.dur)), [dx, dy] = DIRS[tr.dir];
    const ox = -dx * RW * k, oy = -dy * RH * k;
    ctx.drawImage(tr.from.bg, ox, HUD + oy); drawDoors(tr.from, ox, HUD + oy);
    ctx.drawImage(tr.to.bg, ox + dx * RW, HUD + oy + dy * RH); drawDoors(tr.to, ox + dx * RW, HUD + oy + dy * RH);
  } else {
    ctx.translate(sx, HUD + sy);
    drawWorld();
  }
  ctx.restore();
  drawHud();
  if (G.bossBar) drawBossBar(G.bossBar);
  if (G.banner) drawBanner(G.banner);
  if (G.hurtFlash > 0) { ctx.fillStyle = `rgba(160,0,20,${G.hurtFlash * 0.8})`; ctx.fillRect(0, HUD, RW, RH); }
  if (G.fade) { const f = G.fade, a = f.t < f.dur / 2 ? f.t / (f.dur / 2) : 1 - (f.t - f.dur / 2) / (f.dur / 2); ctx.fillStyle = `rgba(0,0,0,${clamp(a, 0, 1)})`; ctx.fillRect(0, 0, VW, VH); }
  if (G.dying) { ctx.fillStyle = `rgba(30,0,0,${clamp(1 - G.dying / 1.4, 0, 0.7)})`; ctx.fillRect(0, 0, VW, VH); }
}
function drawWorld() {
  const room = G.room, p = G.player, th = THEMES[(G.floor - 1) % THEMES.length];
  ctx.drawImage(room.bg, 0, 0);
  drawDoors(room, 0, 0);
  if (room.trapdoor) drawTrapdoor();
  for (const ped of room.peds) if (!ped.taken) drawPedestal(ped);
  for (const k of room.pickups) drawPickup(k);
  // shadows then y-sorted actors
  const actors = [...G.enemies, p].sort((a, b) => a.y - b.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const a of actors) { if (a === p && G.dying <= 0 && p.hp <= 0) continue; ctx.beginPath(); ctx.ellipse(a.x, a.y + 3, a.r + 2, (a.r + 2) * 0.45, 0, 0, TAU); ctx.fill(); }
  for (const a of actors) { if (a === p) drawPlayer(); else drawEnemy(a); }
  // telegraph for the warlord's charge
  for (const e of G.enemies) if (e.state === 'aim') { ctx.strokeStyle = `rgba(255,70,40,${0.3 + 0.3 * Math.sin(G.time * 30)})`; ctx.lineWidth = e.r * 1.6; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.ca) * 400, e.y + Math.sin(e.ca) * 400); ctx.stroke(); }
  // projectiles (additive glow)
  ctx.globalCompositeOperation = 'lighter';
  for (const t of G.tears) ctx.drawImage(t.thorn ? GLOW.green : GLOW.cyan, t.x - 10, t.y - 10, 20, 20);
  for (const b of G.ebul) if (b.kind === 'orb' || b.kind === 'orbP') ctx.drawImage(b.kind === 'orb' ? GLOW.teal : GLOW.violet, b.x - 11, b.y - 11, 22, 22);
  ctx.globalCompositeOperation = 'source-over';
  for (const t of G.tears) drawTear(t);
  for (const b of G.ebul) drawBullet(b);
  // orbiting crystals
  const orbs = p.skills.orbit || 0;
  for (let i = 0; i < orbs; i++) { const a = p.orbA + i * TAU / orbs; const ox = p.x + Math.cos(a) * 24, oy = p.y - 6 + Math.sin(a) * 24;
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(GLOW.cyan, ox - 12, oy - 12, 24, 24); ctx.globalCompositeOperation = 'source-over';
    if (IMG.c16) ctx.drawImage(IMG.c16, ox - 6, oy - 6, 12, 12); }
  // particles
  for (const q of G.parts) {
    const a = clamp(q.t / q.max, 0, 1);
    if (q.arc !== undefined) { ctx.strokeStyle = q.color; ctx.globalAlpha = a; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.2 - a * 0.4), q.arc - 1.1, q.arc + 1.1); ctx.stroke(); ctx.globalAlpha = 1; continue; }
    ctx.globalAlpha = a; ctx.fillStyle = q.color; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  // lighting: darkness with light pools around the player, projectiles and loot
  lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, lightCv.width, lightCv.height);
  lctx.fillStyle = `rgba(4,5,12,${th.dark})`; lctx.fillRect(0, 0, lightCv.width, lightCv.height);
  lctx.globalCompositeOperation = 'destination-out';
  const L = (x, y, r, a = 1) => { lctx.globalAlpha = a; lctx.drawImage(LIGHT, (x - r) / 2, (y - r) / 2, r, r); };
  L(p.x, p.y - 8, 230); L(MCX, MCY, 420, 0.35);
  for (const t of G.tears) L(t.x, t.y, 50, 0.6);
  for (const b of G.ebul) L(b.x, b.y, 40, 0.5);
  for (const e of G.enemies) if (e.d.flying) L(e.x, e.y - 10, 70, 0.5);
  for (const k of room.pickups) L(k.x, k.y, 40, 0.6);
  for (const ped of room.peds) if (!ped.taken) L(ped.x, ped.y - 14, 70, 0.8);
  if (room.trapdoor) L(MCX, MCY, 60, 0.7);
  lctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true; ctx.drawImage(lightCv, 0, 0, RW, RH); ctx.imageSmoothingEnabled = false;
  // floating numbers on top of the lighting
  ctx.textAlign = 'center'; ctx.font = '600 9px "Pixelify Sans", monospace';
  for (const t of G.texts) { ctx.globalAlpha = clamp(t.t * 3, 0, 1); ctx.fillStyle = '#000'; ctx.fillText(t.text, t.x + 1, t.y + 1); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); }
  ctx.globalAlpha = 1;
  // pedestal labels
  for (const ped of room.peds) if (!ped.taken && hyp(p.x - ped.x, p.y - ped.y) < 70) drawPedLabel(ped);
}
function drawDoors(room, ox, oy) {
  const th = THEMES[(G.floor - 1) % THEMES.length];
  for (const d in room.doors) {
    const [dx, dy] = DIRS[d], n = roomAt(room.gx + dx, room.gy + dy);
    const special = n.type === 'boss' || room.type === 'boss' ? 'boss' : n.type === 'treasure' ? 'treasure' : n.type === 'shop' ? 'shop' : '';
    const frame = special === 'boss' ? '#7a2a24' : special === 'treasure' ? '#c99a3a' : special === 'shop' ? '#3a8ab0' : '#5c6470';
    const glow = special === 'boss' ? '#ff4a3a' : special === 'treasure' ? '#ffd27a' : th.rune;
    const open = room.cleared;
    ctx.save(); ctx.translate(ox + (d === 'w' ? WALL / 2 : d === 'e' ? RW - WALL / 2 : MCX), oy + (d === 'n' ? WALL / 2 : d === 's' ? RH - WALL / 2 : MCY));
    ctx.rotate(d === 'n' ? 0 : d === 's' ? Math.PI : d === 'w' ? -Math.PI / 2 : Math.PI / 2);
    // drawn as a north door, rotated into place
    ctx.fillStyle = '#0c0d10'; ctx.fillRect(-20, -16, 40, 32);
    ctx.fillStyle = frame; ctx.fillRect(-19, -16, 6, 32); ctx.fillRect(13, -16, 6, 32); ctx.fillRect(-19, -16, 38, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-19, -16, 38, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-13, -10, 1, 26); ctx.fillRect(12, -10, 1, 26);
    if (open) {
      const g = ctx.createLinearGradient(0, -10, 0, 16); g.addColorStop(0, '#000'); g.addColorStop(1, '#1b1d24'); ctx.fillStyle = g; ctx.fillRect(-13, -10, 26, 26);
    } else {
      ctx.fillStyle = '#2a2d34'; ctx.fillRect(-13, -10, 26, 26);
      ctx.fillStyle = '#4a4f5a'; for (let i = -10; i <= 8; i += 6) ctx.fillRect(i, -10, 3, 26);
      ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 8; ctx.fillRect(-2, 0, 4, 8); ctx.shadowBlur = 0;
    }
    if (special) { ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 6; ctx.fillRect(-3, -15, 6, 3); ctx.shadowBlur = 0; }
    ctx.restore();
  }
}
function drawTrapdoor() {
  ctx.fillStyle = '#0d0e12'; ctx.fillRect(MCX - 17, MCY - 13, 34, 26);
  ctx.fillStyle = '#4a3a2a'; ctx.fillRect(MCX - 15, MCY - 11, 30, 22);
  ctx.fillStyle = '#000'; ctx.fillRect(MCX - 12, MCY - 8, 24, 16);
  const a = 0.4 + 0.3 * Math.sin(G.time * 3);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(GLOW.cyan, MCX - 18, MCY - 14, 36, 28); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawPedestal(ped) {
  const { x, y } = ped;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 6, 12, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1c1f26'; ctx.fillRect(x - 11, y - 8, 22, 14);
  ctx.fillStyle = '#5a616c'; ctx.fillRect(x - 10, y - 8, 20, 12); ctx.fillStyle = '#7b8490'; ctx.fillRect(x - 10, y - 8, 20, 3);
  const bob = Math.sin(G.time * 3 + x) * 2, iy = y - 20 + bob;
  ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(ped.kind === 'heart' ? GLOW.red : ped.kind === 'stat' ? GLOW.gold : GLOW.cyan, x - 14, iy - 14, 28, 28); ctx.globalCompositeOperation = 'source-over';
  if (ped.kind === 'heart') ctx.drawImage(HEARTS.full, x - 9, iy - 8, 18, 16);
  else {
    const info = STAT_UPS[ped.id] || SKILL_INFO[ped.id];
    ctx.fillStyle = '#0c0e14'; ctx.beginPath(); ctx.arc(x, iy, 8, 0, TAU); ctx.fill();
    ctx.strokeStyle = ped.kind === 'stat' ? '#e8b65a' : '#7fdcff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = ped.kind === 'stat' ? '#ffd88a' : '#bff2ff'; ctx.font = '11px "Pixelify Sans", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(info.icon, x, iy + 1); ctx.textBaseline = 'alphabetic';
  }
  if (ped.price) {
    ctx.font = '700 9px "Pixelify Sans", monospace'; ctx.textAlign = 'center';
    const can = G.player.crystals >= ped.price;
    if (IMG.c16) ctx.drawImage(IMG.c16, x - 12, y + 7, 9, 9);
    ctx.fillStyle = '#000'; ctx.fillText(ped.price, x + 4, y + 15); ctx.fillStyle = can ? '#bff2ff' : '#ff8a7a'; ctx.fillText(ped.price, x + 3, y + 14);
  }
}
function drawPedLabel(ped) {
  const name = ped.kind === 'heart' ? 'Heart' : (STAT_UPS[ped.id] || SKILL_INFO[ped.id]).name;
  ctx.font = '600 9px "Pixelify Sans", monospace'; ctx.textAlign = 'center';
  const w = ctx.measureText(name).width + 10, y = ped.y - 40;
  ctx.fillStyle = 'rgba(8,9,14,0.8)'; ctx.fillRect(ped.x - w / 2, y - 9, w, 13);
  ctx.fillStyle = '#e8d6a8'; ctx.fillText(name, ped.x, y);
}
function drawPickup(k) {
  const bob = k.z + (k.vz ? 0 : Math.sin(G.time * 4 + k.x) * 1.2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(k.x, k.y + 3, 5, 2, 0, 0, TAU); ctx.fill();
  if (k.type === 'crystal' || k.type === 'bigcrystal') {
    const s = k.type === 'bigcrystal' ? 18 : 11;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(GLOW.cyan, k.x - s, k.y - s / 2 - bob - s / 2, s * 2, s * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (IMG.c16) ctx.drawImage(s > 12 ? IMG.c32 : IMG.c16, k.x - s / 2, k.y - s - bob + 2, s, s);
  } else {
    const img = k.type === 'heart' ? HEARTS.full : HEARTS.half;
    ctx.drawImage(img, k.x - 5, k.y - 9 - bob, 10, 9);
  }
}
function drawTear(t) {
  ctx.fillStyle = t.thorn ? '#3e5a28' : '#16496a'; ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 0.8, 0, TAU); ctx.fill();
  ctx.fillStyle = t.thorn ? '#9ccf6a' : '#7fdcff'; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8fbff'; ctx.fillRect(t.x - t.r * 0.5, t.y - t.r * 0.6, Math.max(1, t.r * 0.6), Math.max(1, t.r * 0.6));
}
function drawBullet(b) {
  if (b.kind === 'dagger') {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = '#1a1210'; ctx.fillRect(-6, -2, 12, 4); ctx.fillStyle = '#d8d6d0'; ctx.fillRect(-1, -1, 6, 2); ctx.fillStyle = '#7a4a2a'; ctx.fillRect(-5, -1, 4, 2); ctx.restore();
  } else if (b.kind === 'rock') {
    ctx.fillStyle = '#1a1612'; ctx.fillRect(b.x - 3, b.y - 3, 6, 6); ctx.fillStyle = '#8a7660'; ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
  } else {
    ctx.fillStyle = b.kind === 'orb' ? '#2a6a66' : '#5a2a7a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 0.8, 0, TAU); ctx.fill();
    ctx.fillStyle = bulletColor(b); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 1, b.y - 2, 2, 2);
  }
}
function drawPlayer() {
  const p = G.player;
  if (p.hp <= 0 && !G.dying) return;
  if (p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0 && !G.dying) return;
  const stride = hyp(p.vx, p.vy) > 12 ? 1 + (Math.floor(p.anim) % 2) : 0;
  const img = PFRAMES[p.face][stride];
  const bob = stride ? (Math.floor(p.anim) % 2 ? -1 : 0) : Math.round(Math.sin(G.time * 2.5) * 0.5);
  const x = Math.round(p.x * 2) / 2 - 8, y = Math.round(p.y * 2) / 2 + 5 - 23 + bob;
  ctx.save();
  if (G.dying) { ctx.globalAlpha = clamp(G.dying / 1.4, 0, 1); }
  if (p.flip) { ctx.translate(x + 16, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); } else ctx.drawImage(img, x, y);
  ctx.restore();
  // eyes glow
  if (p.face !== 'up') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(GLOW.cyan, p.x - 7 + (p.face === 'side' ? (p.flip ? -4 : 4) : 0), y + 1, 14, 12); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
}
function drawEnemy(e) {
  const S = e.sheet; if (!S) return;
  const A = S.anims;
  let frame;
  if (e.pose) { const arr = A[e.face + 'Atk']; frame = arr[Math.min(arr.length - 1, e.pose - 1)]; }
  else { const arr = A[e.face]; frame = arr[Math.floor(e.anim) % arr.length]; }
  const w = S.w, h = S.h;
  const dx = Math.round(e.x * 2) / 2 - w / 2, dy = Math.round(e.y * 2) / 2 + e.r * 0.6 - h + (e.d.flying ? Math.sin(G.time * 3 + e.phase) * 2 - 3 : 0);
  ctx.save();
  ctx.globalAlpha = (e.d.alpha || 1) * e.alpha;
  if (e.flip) { ctx.translate(dx + w, dy); ctx.scale(-1, 1); } else ctx.translate(dx, dy);
  ctx.drawImage(S.img, frame * w, 0, w, h, 0, 0, w, h);
  if (e.flash > 0) { ctx.globalAlpha = 0.85 * e.alpha; ctx.drawImage(S.white, frame * w, 0, w, h, 0, 0, w, h); }
  ctx.restore();
  if (e.slow > 0) { ctx.fillStyle = 'rgba(160,220,255,0.8)'; ctx.fillRect(e.x - 1, e.y - h + e.r + 4, 2, 2); }
  if (e.state === 'windup' || e.state === 'slamwind') { ctx.fillStyle = '#ff5a3a'; ctx.font = '700 10px "Pixelify Sans", monospace'; ctx.textAlign = 'center'; ctx.fillText('!', e.x, dy + 6); }
}

// ---- HUD
function drawHud() {
  const p = G.player;
  const g = ctx.createLinearGradient(0, 0, 0, HUD); g.addColorStop(0, '#15171d'); g.addColorStop(1, '#0b0c10');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, HUD);
  ctx.fillStyle = '#2a2e38'; ctx.fillRect(0, HUD - 2, VW, 2);
  // hearts
  const hearts = Math.min(16, p.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const hx = 8 + (i % 8) * 11, hy = 5 + Math.floor(i / 8) * 10;
    const v = p.hp - i * 2; ctx.drawImage(v >= 2 ? HEARTS.full : v === 1 ? HEARTS.half : HEARTS.empty, hx, hy);
  }
  // xp bar
  const need = xpNeed(p.level), fill = clamp(p.xp / need, 0, 1);
  ctx.fillStyle = '#05060a'; ctx.fillRect(8, 27, 118, 5);
  ctx.fillStyle = '#2b6fa0'; ctx.fillRect(9, 28, 116 * fill, 3); ctx.fillStyle = '#7fdcff'; ctx.fillRect(9, 28, 116 * fill, 1);
  ctx.font = '700 9px "Pixelify Sans", monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = '#7fdcff'; ctx.fillText(`LV ${p.level}`, 132, 33);
  // crystals
  if (IMG.c16) ctx.drawImage(IMG.c16, 168, 7, 13, 13);
  ctx.font = '700 11px "Pixelify Sans", monospace'; ctx.fillStyle = '#e9e4d8'; ctx.fillText(p.crystals, 184, 18);
  // floor
  const th = THEMES[(G.floor - 1) % THEMES.length];
  ctx.font = '600 9px "Pixelify Sans", monospace'; ctx.fillStyle = '#a9a3b8'; ctx.textAlign = 'center';
  ctx.fillText(`FLOOR ${G.floor}`, 290, 15); ctx.fillStyle = '#6b6878'; ctx.fillText(th.name.toUpperCase(), 290, 27);
  // pause button
  ctx.fillStyle = '#20232c'; ctx.fillRect(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h);
  ctx.fillStyle = '#a9a3b8'; ctx.fillRect(PAUSE_BTN.x + 6, PAUSE_BTN.y + 5, 3, 10); ctx.fillRect(PAUSE_BTN.x + 11, PAUSE_BTN.y + 5, 3, 10);
  drawMinimap();
}
function drawMinimap() {
  const cw = 6, ch = 4, ox = VW - GRID_W * cw - 6, oy = 2;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ox - 2, oy - 1, GRID_W * cw + 3, GRID_H * ch + 2);
  for (const r of G.map.values()) {
    if (!r.visited && !r.seen) continue;
    const x = ox + r.gx * cw, y = oy + r.gy * ch;
    ctx.fillStyle = r === G.room ? '#f2ecd8' : r.visited ? '#6a6f7c' : '#2e313a'; ctx.fillRect(x, y, cw - 1, ch - 1);
    const ic = r.type === 'boss' ? '#ff4a3a' : r.type === 'treasure' ? '#ffd27a' : r.type === 'shop' ? '#5ad6ff' : null;
    if (ic && r !== G.room) { ctx.fillStyle = ic; ctx.fillRect(x + 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + 1, 3, 1); }
  }
}
function drawBossBar(e) {
  const w = 220, x = (VW - w) / 2, y = VH - 18;
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 3, y - 11, w + 6, 20);
  ctx.font = '600 8px "Pixelify Sans", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8b65a'; ctx.fillText(e.d.name.toUpperCase(), VW / 2, y - 3);
  ctx.fillStyle = '#2a0a0a'; ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = '#c2302a'; ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 5); ctx.fillStyle = '#ff7a6a'; ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 1);
}
function drawBanner(b) {
  const inT = 0.3, outT = 0.5; const a = b.t < inT ? b.t / inT : b.t > b.dur - outT ? (b.dur - b.t) / outT : 1;
  const y = HUD + 62;
  ctx.globalAlpha = clamp(a, 0, 1);
  const g = ctx.createLinearGradient(0, 0, VW, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y - 22, VW, 40);
  ctx.textAlign = 'center'; ctx.font = '700 18px "Pixelify Sans", monospace';
  ctx.fillStyle = '#000'; ctx.fillText(b.title, VW / 2 + 1, y + 1); ctx.fillStyle = b.boss ? '#ff7a5a' : '#e8b65a'; ctx.fillText(b.title, VW / 2, y);
  ctx.font = '600 9px "Pixelify Sans", monospace'; ctx.fillStyle = '#b8b2c4'; ctx.fillText(b.sub, VW / 2, y + 12);
  ctx.globalAlpha = 1;
}

// ===================================================================== screens
function startGame() {
  SFX.init(); newRun(); mode = 'play'; clearSticks();
  for (const id of ['title', 'dead', 'pause', 'levelup']) $(id).classList.add('hidden');
}
function pauseGame() {
  if (mode !== 'play') return;
  mode = 'pause'; clearSticks(); keys.clear(); input.mouseDown = false;
  const p = G.player;
  $('pauseStats').innerHTML = statRows(p).map(([k, v]) => `<b>${k}</b> ${v}`).join('<br>');
  const owned = Object.entries(p.skills).map(([id, l]) => `${SKILL_INFO[id].name} ${l > 1 ? 'Lv' + l : ''}`);
  $('pauseSkills').textContent = owned.length ? owned.join(' · ') : 'No skills yet';
  $('pause').classList.remove('hidden');
  $('btnResume').focus();
}
function resumeGame() { mode = 'play'; $('pause').classList.add('hidden'); last = performance.now(); }
function toggleSound() { SFX.on = !SFX.on; store('thornbound_sound', SFX.on ? 'on' : 'off'); $('btnSound').textContent = `SOUND: ${SFX.on ? 'ON' : 'OFF'}`; }
function statRows(p) {
  return [['Damage', fmt(p.dmg)], ['Fire rate', fmt(1 / p.fireDelay) + '/s'], ['Speed', fmt(p.speed / 100, 2)], ['Range', fmt(p.range / 32)], ['Luck', p.luck], ['Level', p.level]];
}
function saveBest() {
  const b = lsBest() || { floor: 0, level: 0 };
  if (G.floor > b.floor || (G.floor === b.floor && G.player.level > b.level)) store('thornbound_best', JSON.stringify({ floor: G.floor, level: G.player.level }));
}
function gameOver() {
  mode = 'dead'; clearSticks(); saveBest();
  const p = G.player, t = Math.floor(G.time);
  $('deadStats').innerHTML = `<b>Floor</b> ${G.floor} — ${THEMES[(G.floor - 1) % THEMES.length].name}<br><b>Level</b> ${p.level}<br><b>Foes slain</b> ${G.kills}<br><b>Time</b> ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('dead').classList.remove('hidden'); $('btnRetry').focus();
}
function showTitle() {
  mode = 'title';
  const b = lsBest();
  $('bestLine').textContent = b ? `Deepest: floor ${b.floor}, level ${b.level}` : '';
  $('title').classList.remove('hidden');
}

// ---- level-up panel (on the supplied frame art)
let LV = null;
function openLevelUp() {
  mode = 'levelup'; clearSticks(); keys.clear(); input.mouseDown = false;
  G.pendingLv--;
  SFX.play('levelup');
  LV = { choices: rollChoices(3), sel: 0, rerollCost: 3 };
  renderLevelUp();
  $('levelup').classList.remove('hidden');
}
function renderLevelUp() {
  const p = G.player;
  $('lvNum').textContent = `LEVEL ${p.level}`;
  const u = upgradeFor(LV.choices[LV.sel]);
  const diffs = new Map(u.diff.map(([k, a, b]) => [k, b]));
  const rows = [['HP', p.maxHp / 2], ['DMG', fmt(p.dmg)], ['RATE', fmt(1 / p.fireDelay)], ['SPD', fmt(p.speed / 100, 2)], ['RANGE', fmt(p.range / 32)], ['LUCK', p.luck]];
  $('lvStats').innerHTML = rows.map(([k, v]) => `<span>${k}</span><span class="${diffs.has(k) ? 'up' : ''}">${diffs.has(k) ? diffs.get(k) + ' ▲' : v}</span>`).join('');
  const box = $('lvChoices'); box.innerHTML = '';
  LV.choices.forEach((id, i) => {
    const c = upgradeFor(id), b = document.createElement('button');
    b.className = 'choice' + (i === LV.sel ? ' sel' : '');
    b.innerHTML = `<span class="ic">${c.icon}</span><span class="nm">${c.name}</span><span class="lv">${c.lvText}</span>`;
    b.onclick = () => { if (LV.sel === i) confirmLevelUp(); else { LV.sel = i; SFX.play('select'); renderLevelUp(); } };
    box.appendChild(b);
  });
  $('lvPreview').innerHTML = `<b>${u.name}</b><span>${u.desc}</span>${u.diff.map(([k, a, b]) => `<span class="diff">${k} ${a} → ${b}</span>`).join('')}`;
  $('lvXp').textContent = `${p.xp}/${xpNeed(p.level)}`;
  const rr = $('lvReroll'); rr.textContent = p.crystals; rr.disabled = p.crystals < LV.rerollCost;
  $('lvRerollLabel').textContent = `tap to reroll (${LV.rerollCost})`;
  // portrait: the player sprite, big
  const pc = $('lvPortrait'), px = pc.getContext('2d'); px.imageSmoothingEnabled = false; px.clearRect(0, 0, 44, 44);
  px.fillStyle = '#121019'; px.fillRect(0, 0, 44, 44);
  const g = px.createRadialGradient(22, 24, 2, 22, 24, 22); g.addColorStop(0, 'rgba(79,195,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); px.fillStyle = g; px.fillRect(0, 0, 44, 44);
  px.drawImage(PFRAMES.down[0], 6, 5, 32, 46);
}
function lvKey(k) {
  if (!LV) return;
  if (k === 'arrowleft' || k === 'a') { LV.sel = (LV.sel + 2) % 3; SFX.play('select'); renderLevelUp(); }
  else if (k === 'arrowright' || k === 'd') { LV.sel = (LV.sel + 1) % 3; SFX.play('select'); renderLevelUp(); }
  else if (['1', '2', '3'].includes(k)) { LV.sel = +k - 1; SFX.play('select'); renderLevelUp(); }
  else if (k === 'r') reroll();
  else if (k === 'enter' || k === ' ') confirmLevelUp();
}
function reroll() {
  const p = G.player; if (p.crystals < LV.rerollCost) { SFX.play('deny'); return; }
  p.crystals -= LV.rerollCost; LV.rerollCost += 2; LV.choices = rollChoices(3); LV.sel = 0; SFX.play('buy'); renderLevelUp();
}
function confirmLevelUp() {
  if (!LV) return;
  applyUpgrade(LV.choices[LV.sel]); SFX.play('item');
  LV = null; $('levelup').classList.add('hidden');
  if (G.pendingLv > 0) { G.lvDelay = 0.2; }
  mode = 'play'; last = performance.now();
  G.player.inv = Math.max(G.player.inv, 0.5);
}
$('lvConfirm').onclick = confirmLevelUp;
$('lvReroll').onclick = reroll;
$('btnStart').onclick = startGame;
$('btnRetry').onclick = startGame;
$('btnResume').onclick = resumeGame;
$('btnSound').onclick = toggleSound;
$('btnSound').textContent = `SOUND: ${SFX.on ? 'ON' : 'OFF'}`;
$('btnQuit').onclick = () => { $('pause').classList.add('hidden'); saveBest(); G = null; showTitle(); demoRoom(); };

// ===================================================================== main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode === 'play' && G) update(dt);
  else if (G && mode === 'title') { G.time += dt; }
  render();
  requestAnimationFrame(frame);
}
// a quiet room behind the title screen
function demoRoom() {
  newRun(); G.banner = null;
  G.enemies.length = 0;
}

async function boot() {
  await Promise.all([
    loadImg('goblin', 'assets/goblin@0.25.png'), loadImg('goblinBig', 'assets/goblin@0.5.png'),
    loadImg('ghost', 'assets/ghost@0.25.png'), loadImg('ghostBig', 'assets/ghost@0.5.png'),
    loadImg('c16', 'assets/crystal16.png'), loadImg('c32', 'assets/crystal32.png'), loadImg('floor', 'assets/floor.jpg'),
  ]);
  try { await document.fonts.load('700 12px "Pixelify Sans"'); } catch (e) {}
  SHEETS.goblin = makeSheet('goblin', 0.25, IMG.goblin);
  SHEETS.goblinP = makeSheet('goblin', 0.25, variant(IMG.goblin, 175, 0.9, 0.95));
  SHEETS.goblinB = makeSheet('goblin', 0.5, variant(IMG.goblinBig, -75, 1.15, 0.95));
  SHEETS.ghost = makeSheet('ghost', 0.25, IMG.ghost);
  SHEETS.ghostW = makeSheet('ghost', 0.25, variant(IMG.ghost, 85, 1.3, 0.9));
  SHEETS.ghostB = makeSheet('ghost', 0.5, variant(IMG.ghostBig, 140, 1.4, 1));
  GLOW.cyan = glowSprite(16, 'rgba(90,200,255,0.9)'); GLOW.teal = glowSprite(16, 'rgba(110,240,210,0.8)'); GLOW.violet = glowSprite(16, 'rgba(200,110,255,0.85)');
  GLOW.green = glowSprite(16, 'rgba(140,220,90,0.7)'); GLOW.red = glowSprite(16, 'rgba(255,80,90,0.8)'); GLOW.gold = glowSprite(16, 'rgba(255,200,100,0.8)');
  buildPlayer(); buildHearts();
  demoRoom(); showTitle();
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
}
boot();

// test hook for automated checks
window.__thornbound = { get G() { return G; }, get mode() { return mode; }, startGame, gainXp: (n) => gainXp(n), spawnEnemy: (t) => spawnEnemy(t, MCX + 80, MCY),
  goto: (type) => { const r = [...G.map.values()].find((q) => q.type === type); enterRoom(r, null); }, upgrade: applyUpgrade };
})();
