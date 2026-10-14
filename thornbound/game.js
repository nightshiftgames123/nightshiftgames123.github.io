// Thornbound — a small Isaac-style roguelite crawler, laid out for a phone held upright.
// World units are "art pixels": a room is 9x11 tiles of 32px plus a 32px wall ring,
// drawn into a canvas scaled to the screen (crisp on hi-dpi, smooth sub-pixel motion).
'use strict';
(() => {

// ===================================================================== constants
const TILE = 32, COLS = 9, ROWS = 11, WALL = 32;
const RW = COLS * TILE + WALL * 2, RH = ROWS * TILE + WALL * 2; // 352 x 416
const HUD = 40, VW = RW, VH = RH + HUD;
const MCX = RW / 2, MCY = RH / 2;
const GRID_W = 9, GRID_H = 8;
const FINAL_FLOOR = 4;
const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };

// Painted sprite sheets (built by tools/build_assets.py). Every sheet has the same frames:
// 4 walk rows of 5 (down, up, right, left) then attack poses A1-A3 (facing you) and B1-B3 (facing right).
const FRAME_NAMES = ['down0', 'down1', 'down2', 'down3', 'down4', 'up0', 'up1', 'up2', 'up3', 'up4', 'right0', 'right1', 'right2', 'right3', 'right4',
  'left0', 'left1', 'left2', 'left3', 'left4', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
const FRAME = Object.fromEntries(FRAME_NAMES.map((n, i) => [n, i]));
const ATLAS = { cols: 8, cell: { 0.44: 104, 0.8: 189 }, foot: 8 }; // foot: source px between feet and cell bottom
// which attack poses each sheet uses: [windup, strike] when facing you, and when facing sideways
const POSES = {
  wizard: { down: ['A1', 'A1'], side: ['B1', 'B1'] },
  knight: { down: ['A2', 'A3'], side: ['B1', 'B2'] },
  skeleton: { down: ['A2', 'A3'], side: ['B1', 'B2'] },
  goblin: { down: ['A2', 'A3'], side: ['B1', 'B2'] },
  ghost: { down: ['A1', 'A2'], side: ['B1', 'B2'] },
};
const WORLD_SCALE = 0.245; // world units per source pixel for normal-size characters

const THEMES = [
  { name: 'Overgrown Ruins', tint: '#c9d3c1', dark: 0.30, wall: [60, 68, 72], moss: '#3f6234', rune: '#4fc3ff' },
  { name: 'Sunken Crypt', tint: '#9fb4d2', dark: 0.40, wall: [50, 58, 78], moss: '#2f5058', rune: '#5ad6ff' },
  { name: 'Hollow Depths', tint: '#b49dc6', dark: 0.46, wall: [60, 50, 74], moss: '#4c3b60', rune: '#c07bff' },
  { name: 'Thorn Heart', tint: '#cc9a8a', dark: 0.48, wall: [74, 48, 48], moss: '#5c2f2f', rune: '#ff6a5a' },
];
const theme = () => THEMES[(G.floor - 1) % THEMES.length];

// Room layouts (9x11): '#' rubble, '^' thorns. Door lanes (centre row / column ends) stay clear.
const LAYOUTS = [
  ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
  ['.........', '.........', '..#...#..', '.........', '.........', '.........', '.........', '.........', '..#...#..', '.........', '.........'],
  ['.........', '.........', '.........', '.........', '...###...', '...###...', '...###...', '.........', '.........', '.........', '.........'],
  ['##.....##', '#.......#', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '#.......#', '##.....##'],
  ['.........', '.........', '..^...^..', '...^.^...', '.........', '.........', '.........', '...^.^...', '..^...^..', '.........', '.........'],
  ['.........', '.##...##.', '.........', '.........', '.##...##.', '.........', '.##...##.', '.........', '.........', '.##...##.', '.........'],
  ['.........', '.........', '.#.....#.', '.#.....#.', '.#.....#.', '.........', '.#.....#.', '.#.....#.', '.#.....#.', '.........', '.........'],
  ['.........', '.........', '....#....', '...#.#...', '..#...#..', '.........', '..#...#..', '...#.#...', '....#....', '.........', '.........'],
  ['.........', '.#^...^#.', '.........', '.........', '....#....', '.........', '....#....', '.........', '.........', '.#^...^#.', '.........'],
  ['###...###', '.........', '.##...##.', '.........', '.##...##.', '.........', '.##...##.', '.........', '.##...##.', '.........', '###...###'],
  ['..#...#..', '.........', '#..^.^..#', '.........', '...#.#...', '.........', '...#.#...', '.........', '#..^.^..#', '.........', '..#...#..'],
  ['.........', '.........', '..##.##..', '..#...#..', '.........', '.........', '.........', '..#...#..', '..##.##..', '.........', '.........'],
  ['.........', '.^^...^^.', '.^.....^.', '.........', '.........', '.........', '.........', '.........', '.^.....^.', '.^^...^^.', '.........'],
  ['.........', '.........', '.###.....', '.........', '.....###.', '.........', '.###.....', '.........', '.....###.', '.........', '.........'],
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
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ===================================================================== persistent progression
const SAVE_KEY = 'thornbound_save_v1';
const defaultSave = () => ({ bank: 0, up: {}, feats: {}, stats: { runs: 0, kills: 0, wins: 0, best: 0, bought: 0, bestTime: 0 }, ascMax: 0, asc: 0, char: 'wanderer' });
function loadSave() {
  try { const s = JSON.parse(store(SAVE_KEY) || 'null'); if (s) { const d = defaultSave(); return { ...d, ...s, stats: { ...d.stats, ...(s.stats || {}) } }; } } catch (e) {}
  return defaultSave();
}
const SAVE = loadSave();
const persist = () => store(SAVE_KEY, JSON.stringify(SAVE));
const upRank = (id) => SAVE.up[id] || 0;

// Shrine: permanent upgrades bought with banked crystals
const META = [
  { id: 'vitality', name: 'Heart of Stone', desc: '+1 starting heart', costs: [40, 90, 160] },
  { id: 'might', name: 'Sharpened Will', desc: '+0.3 base damage', costs: [25, 45, 70, 100, 140] },
  { id: 'haste', name: 'Quickening', desc: 'Fire 4% faster', costs: [25, 45, 70, 100, 140] },
  { id: 'fortune', name: 'Fortune', desc: '+1 starting luck', costs: [50, 100, 170] },
  { id: 'greed', name: 'Greed', desc: 'Foes drop crystals more often', costs: [30, 60, 100] },
  { id: 'wisdom', name: 'Wisdom', desc: '+15% experience', costs: [40, 80, 130] },
  { id: 'haggle', name: 'Haggler', desc: 'Merchant prices 20% lower', costs: [50, 110] },
  { id: 'legacy', name: 'Legacy', desc: 'Start each run with a random skill', costs: [80, 200] },
  { id: 'secondwind', name: 'Second Wind', desc: 'Once per run, rise again with 1 heart', costs: [150] },
];

// Feats: lifetime achievements; most unlock something
const FEATS = {
  warlord: { name: "Warlord's Bane", desc: 'Slay the Goblin Warlord', reward: 'Unlocks the Thornknight' },
  banshee: { name: 'Silence', desc: 'Slay the Banshee', reward: 'Unlocks the Blood Rune skill' },
  depths: { name: 'Into the Depths', desc: 'Reach floor 3', reward: 'Unlocks the Seer' },
  twins: { name: 'Twin Fall', desc: 'Defeat the Twin Guardians', reward: 'Unlocks the Ricochet skill' },
  victory: { name: 'Unbound', desc: 'Destroy the Thornheart', reward: 'Unlocks the Revenant and Ascension' },
  slayer: { name: 'Slayer', desc: 'Slay 200 foes in total', reward: 'Unlocks the Orbiting Crystal skill' },
  hoarder: { name: 'Hoarder', desc: 'Hold 30 crystals at once', reward: 'Unlocks the Back Shard skill' },
  level10: { name: 'Ascendant', desc: 'Reach level 10 in one run', reward: 'Unlocks the Frost Shards skill' },
  untouched: { name: 'Untouchable', desc: 'Defeat a guardian without being hit', reward: '+50 banked crystals', bank: 50 },
  patron: { name: 'Patron', desc: 'Buy 5 things from merchants', reward: '+30 banked crystals', bank: 30 },
  asc3: { name: 'Truly Thornbound', desc: 'Win on Ascension 3 or higher', reward: '+150 banked crystals', bank: 150 },
};
const SKILL_LOCK = { vamp: 'banshee', bounce: 'twins', orbit: 'slayer', rear: 'hoarder', frost: 'level10' };

const CHARS = {
  wanderer: { name: 'Wanderer', desc: 'A travelling wizard. 3 hearts, balanced crystal shards.', lock: null, sheet: 'wizard',
    hp: 6, dmg: 3.5, fd: 0.42, speed: 118, range: 200, shot: 230, skills: {} },
  thornknight: { name: 'Thornknight', desc: '4 hearts, heavy slow shards, slower feet. Starts with Thorn Mantle.', lock: 'warlord', sheet: 'knight',
    hp: 8, dmg: 4.6, fd: 0.56, speed: 106, range: 175, shot: 215, skills: { mantle: 1 } },
  seer: { name: 'Seer', desc: '2 hearts, rapid long-range shards. Starts with Seeking Runes.', lock: 'depths', sheet: 'wizard', tint: [55, 1.1, 1],
    hp: 4, dmg: 3.0, fd: 0.32, speed: 124, range: 240, shot: 250, skills: { homing: 1 } },
  revenant: { name: 'Revenant', desc: 'A risen skeleton. 3 hearts. Starts with Split Shard and an Orbiting Crystal.', lock: 'victory', sheet: 'skeleton', tint: [165, 0.8, 1.05],
    hp: 6, dmg: 3.2, fd: 0.44, speed: 120, range: 200, shot: 230, skills: { split: 1, orbit: 1 } },
};
const charUnlocked = (id) => !CHARS[id].lock || SAVE.feats[CHARS[id].lock];

// ===================================================================== canvas
const cv = $('game'), ctx = cv.getContext('2d');
const stage = $('stage');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let K = 1;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const portrait = vh > vw * 1.05;
  stage.classList.toggle('portrait-touch', portrait && isTouch);
  const availH = portrait && isTouch ? vh * 0.66 : vh - 8;
  const s = Math.min((vw - 8) / VW, availH / VH);
  const cssW = Math.floor(VW * s), cssH = Math.floor(VH * s);
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  K = cv.width / VW;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  $('touchHint').style.display = isTouch && portrait ? 'flex' : 'none';
}
window.addEventListener('resize', resize);
resize();
if (isTouch) $('controlsHelp').innerHTML = 'Drag <b>left side</b> to move · drag <b>right side</b> to shoot<br>Tap <b>❚❚</b> in the top bar to pause';

const lightCv = mk(RW / 2, RH / 2), lctx = lightCv.getContext('2d');

// ===================================================================== assets
const IMG = {};
function loadImg(key, src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => { IMG[key] = i; res(); }; i.onerror = () => res(); i.src = src; });
}
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
function makeSheet(kind, scale, img, worldScale = WORLD_SCALE) {
  const cell = ATLAS.cell[scale];
  return { kind, img, white: silhouette(img, '#fff'), cell, ds: worldScale / scale, foot: ATLAS.foot * scale, poses: POSES[kind] };
}
// draw one frame with its feet at (x, y); mirror flips it horizontally
function drawFrame(S, name, x, y, mirror, flash, tilt = 0) {
  const i = FRAME[name], c = S.cell, sx = (i % ATLAS.cols) * c, sy = Math.floor(i / ATLAS.cols) * c;
  const w = c * S.ds, h = c * S.ds, dx = -w / 2, dy = -(c - S.foot) * S.ds;
  ctx.save();
  ctx.translate(x, y); if (tilt) ctx.rotate(tilt); // tilt pivots on the feet
  if (mirror) { ctx.translate(dx + w, dy); ctx.scale(-1, 1); } else ctx.translate(dx, dy);
  ctx.drawImage(S.img, sx, sy, c, c, 0, 0, w, h);
  if (flash) { ctx.globalAlpha *= flash; ctx.drawImage(S.white, sx, sy, c, c, 0, 0, w, h); }
  ctx.restore();
}
// which frame to show for a walker facing face/flip, with an optional attack pose (1 windup, 2 strike)
// Walk frames to cycle per sheet and row; by default all five. The wizard's front walk skips
// the two frames where the art leaves his staff out, so it doesn't blink.
const WALK = { wizard: { down: [0, 1, 3] } };
function poseFrame(S, face, flip, anim, moving, pose) {
  if (pose) { const set = face === 'side' ? S.poses.side : S.poses.down; return [set[Math.min(1, pose - 1)], face === 'side' && flip]; }
  const row = face === 'side' ? (flip ? 'left' : 'right') : face;
  const seq = (WALK[S.kind] && WALK[S.kind][row]) || [0, 1, 2, 3, 4];
  return [row + (moving ? seq[Math.floor(anim) % seq.length] : seq[0]), false];
}
// A small bounce and sway on every step, so walking always reads as walking even where
// neighbouring frames in the art are nearly the same.
// Armoured characters get a heavier stomp, since their walk frames barely change.
const STEP = { knight: [2.4, 0.07], skeleton: [1.9, 0.055] };
function stepMotion(anim, moving, kind) {
  if (!moving) return [0, 0];
  const [lift, sway] = STEP[kind] || [1.4, 0.045];
  const s = Math.sin(anim * Math.PI * 0.8);
  return [-Math.abs(s) * lift, s * sway];
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

// ---- hero sprite sheets, one recoloured wizard per character
const CHAR_SHEETS = {};
// hearts for the HUD (and, scaled up, the Thornheart itself), drawn as smooth shapes
const HEARTS = {};
function heartPath(x, s) {
  x.beginPath(); x.moveTo(0.5 * s, 0.92 * s);
  x.bezierCurveTo(0.12 * s, 0.64 * s, -0.04 * s, 0.4 * s, 0.1 * s, 0.2 * s);
  x.bezierCurveTo(0.22 * s, 0.02 * s, 0.44 * s, 0.04 * s, 0.5 * s, 0.24 * s);
  x.bezierCurveTo(0.56 * s, 0.04 * s, 0.78 * s, 0.02 * s, 0.9 * s, 0.2 * s);
  x.bezierCurveTo(1.04 * s, 0.4 * s, 0.88 * s, 0.64 * s, 0.5 * s, 0.92 * s); x.closePath();
}
function heartCanvas(top, bottom, kind, size = 40) {
  const c = mk(size, size), x = c.getContext('2d'), pad = size * 0.06, s = size - pad * 2;
  x.translate(pad, pad);
  heartPath(x, s); x.fillStyle = '#16080b'; x.fill();
  x.lineWidth = s * 0.08; x.strokeStyle = '#16080b'; x.stroke();
  const fillPart = (clipHalf) => {
    x.save(); heartPath(x, s); x.clip();
    if (clipHalf) { x.beginPath(); x.rect(0, 0, s / 2, s); x.clip(); }
    const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, top); g.addColorStop(1, bottom); x.fillStyle = g; x.fillRect(0, 0, s, s);
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.ellipse(s * 0.28, s * 0.3, s * 0.1, s * 0.06, -0.6, 0, TAU); x.fill();
    x.restore();
  };
  if (kind === 'empty') { x.save(); heartPath(x, s); x.clip(); x.fillStyle = '#3a1519'; x.fillRect(0, 0, s, s); x.restore(); }
  else { if (kind === 'half') { x.save(); heartPath(x, s); x.clip(); x.fillStyle = '#3a1519'; x.fillRect(0, 0, s, s); x.restore(); } fillPart(kind === 'half'); }
  return c;
}
function buildHearts() {
  HEARTS.full = heartCanvas('#ff5a62', '#b0161f', 'full');
  HEARTS.half = heartCanvas('#ff5a62', '#b0161f', 'half');
  HEARTS.empty = heartCanvas('#3a1519', '#3a1519', 'empty');
  HEARTS.boss = heartCanvas('#c0263a', '#4a0610', 'full', 160);
  HEARTS.bossWhite = silhouette(HEARTS.boss, '#fff');
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
      case 'clang': this.tone(1400, 900, 0.12, 'square', 0.07); this.noise(0.08, 0.12, 5000); break;
      case 'throw': this.tone(600, 300, 0.1, 'triangle', 0.08); break;
      case 'cast': this.tone(400, 900, 0.25, 'sine', 0.08); break;
      case 'orb': this.tone(300, 200, 0.12, 'sine', 0.07); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.16, i * 0.08)); break;
      case 'item': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, f * 1.01, 0.22, 'sine', 0.16, i * 0.07)); break;
      case 'buy': this.tone(988, 988, 0.06, 'square', 0.08); this.tone(1318, 1318, 0.12, 'square', 0.08, 0.06); break;
      case 'deny': this.tone(160, 140, 0.15, 'square', 0.1); break;
      case 'roar': this.tone(140, 45, 0.9, 'sawtooth', 0.22); this.noise(0.8, 0.22, 500); break;
      case 'boom': this.noise(0.6, 0.4, 600); this.tone(110, 30, 0.6, 'sine', 0.3); break;
      case 'dash': this.noise(0.3, 0.2, 1200); this.tone(200, 90, 0.3, 'sawtooth', 0.1); break;
      case 'select': this.tone(660, 660, 0.04, 'square', 0.06); break;
      case 'descend': [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.3, 'triangle', 0.15, i * 0.12)); break;
      case 'die': [330, 262, 196, 131].forEach((f, i) => this.tone(f, f * 0.9, 0.4, 'sawtooth', 0.12, i * 0.18)); break;
      case 'feat': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, f, 0.16, 'square', 0.07, i * 0.06)); break;
      case 'spike': this.noise(0.15, 0.25, 2200); this.tone(500, 160, 0.15, 'square', 0.08); break;
      case 'win': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, f, 0.3, 'triangle', 0.16, i * 0.12)); break;
    }
  },
};

// ===================================================================== in-run upgrades
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
const skillUnlocked = (id) => !SKILL_LOCK[id] || SAVE.feats[SKILL_LOCK[id]];
const STAT_UPS = {
  dmg: { name: 'Keen Shards', icon: '⚔︎', desc: '+0.8 damage', apply: (p) => { p.dmg += 0.8; }, diff: (p) => [['DMG', fmt(p.dmg), fmt(p.dmg + 0.8)]] },
  rate: { name: 'Quick Hand', icon: '⚡︎', desc: 'Fire 15% faster', ok: (p) => p.fireDelay > 0.14, apply: (p) => { p.fireDelay *= 0.85; }, diff: (p) => [['RATE', fmt(1 / p.fireDelay), fmt(1 / (p.fireDelay * 0.85))]] },
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
  if (kind !== 'stat') for (const id in SKILL_INFO) if (skillUnlocked(id) && (p.skills[id] || 0) < SKILL_INFO[id].max) out.push(id);
  return out;
}
function rollChoices(n) {
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
let mode = 'title'; // title | play | pause | levelup | dead | menu

function makePlayer(charId) {
  const c = CHARS[charId];
  return { x: MCX, y: MCY, vx: 0, vy: 0, r: 6, charId,
    hp: c.hp + upRank('vitality') * 2, maxHp: c.hp + upRank('vitality') * 2,
    dmg: c.dmg + upRank('might') * 0.3, fireDelay: c.fd * (1 - upRank('haste') * 0.04), shotSpeed: c.shot, range: c.range, speed: c.speed,
    luck: upRank('fortune'), revive: upRank('secondwind'),
    skills: { ...c.skills }, level: 1, xp: 0, crystals: 0, inv: 0, fireCd: 0, face: 'down', flip: false, anim: 0, kills: 0, vampKills: 0,
    orbA: 0, orbHits: new Map(), stepT: 0, castT: 0 };
}
const xpNeed = (lv) => 10 + (lv - 1) * 8;

function newRun(charId) {
  G = { floor: 1, asc: SAVE.asc, player: makePlayer(charId), sheet: CHAR_SHEETS[charId], tears: [], ebul: [], enemies: [], parts: [], texts: [], hazards: [],
    shake: 0, freeze: 0, trans: null, fade: null, banner: null, toasts: [], pendingLv: 0, lvDelay: 0, time: 0, flow: null, flowKey: '',
    bosses: [], dying: 0, slowmo: 0, kills: 0, bossesKilled: 0, newFeats: [], victoryT: 0, ended: false };
  for (let i = 0; i < upRank('legacy'); i++) { const opts = availableUpgrades('skill'); if (opts.length) applyUpgrade(pick(opts)); }
  genFloor();
  enterRoom(G.start, null);
  showBanner('Floor 1', THEMES[0].name);
}
const hpMul = () => (1 + 0.35 * (G.floor - 1)) * (1 + 0.2 * G.asc);

function unlockFeat(id) {
  if (SAVE.feats[id] || !G || G.ended) return;
  SAVE.feats[id] = true;
  if (FEATS[id].bank) SAVE.bank += FEATS[id].bank;
  persist();
  G.newFeats.push(id); G.toasts.push({ text: `Feat: ${FEATS[id].name}`, sub: FEATS[id].reward, t: 0 });
  SFX.play('feat');
}

// ===================================================================== floor generation (Isaac-style)
function genFloor() {
  const f = G.floor;
  for (let attempt = 0; attempt < 300; attempt++) {
    const want = Math.min(16, 6 + f * 2 + ri(0, 2));
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
      if (!q.length && map.size < want) q.push(pick([...map.values()]));
    }
    if (map.size < want) continue;
    const rooms = [...map.values()];
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
      const li = r.type === 'fight' ? ri(0, LAYOUTS.length - 1) : r.type === 'boss' ? (f === FINAL_FLOOR ? 0 : pick(BOSS_LAYOUTS)) : 0;
      r.grid = new Uint8Array(COLS * ROWS);
      LAYOUTS[li].forEach((row, y) => { for (let x = 0; x < COLS; x++) r.grid[y * COLS + x] = row[x] === '#' ? 1 : row[x] === '^' ? 2 : 0; });
      r.fx = ri(0, 1024 - COLS * TILE * 2); r.fy = ri(0, 1024 - ROWS * TILE * 2);
      r.bg = null;
    }
    const treasure = others[0], shop = others[1];
    treasure.peds.push(makePed('skill', MCX, MCY, 0));
    const haggle = 1 - upRank('haggle') * 0.2;
    shuffle(['heart', 'skill', 'stat']).forEach((k, i) => shop.peds.push(makePed(k, MCX + (i - 1) * 84, MCY - 10,
      Math.max(1, Math.round((k === 'skill' ? 14 + f * 2 : k === 'stat' ? 8 + f : 4) * haggle)))));
    return;
  }
}
function makePed(kind, x, y, price) {
  const ped = { kind, x, y, price, taken: false };
  if (kind === 'skill') { const s = availableUpgrades('skill'); ped.id = pick(s.length ? s : availableUpgrades()); if (STAT_UPS[ped.id]) ped.kind = 'stat'; }
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
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = tileAt(room, tx, ty);
    if (t === 9 || !(t === 1 || (alsoThorns && t === 2))) continue;
    const x0 = WALL + tx * TILE + 2, y0 = WALL + ty * TILE + 2, x1 = x0 + TILE - 4, y1 = y0 + TILE - 4;
    const cx = clamp(e.x, x0, x1), cy = clamp(e.y, y0, y1);
    const dx = e.x - cx, dy = e.y - cy, d = hyp(dx, dy);
    if (d < e.r) {
      if (d === 0) {
        const l = e.x - x0, r = x1 - e.x, u = e.y - y0, b = y1 - e.y, m = Math.min(l, r, u, b);
        if (m === l) e.x = x0 - e.r; else if (m === r) e.x = x1 + e.r; else if (m === u) e.y = y0 - e.r; else e.y = y1 + e.r;
      } else { e.x = cx + dx / d * e.r; e.y = cy + dy / d * e.r; }
    }
  }
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
  G.tears.length = 0; G.ebul.length = 0; G.enemies.length = 0; G.parts.length = 0; G.texts.length = 0; G.hazards.length = 0; G.flow = null; G.bosses = [];
  if (fromDir) {
    const enter = OPP[fromDir];
    if (enter === 'n') { p.x = MCX; p.y = WALL + p.r + 6; } if (enter === 's') { p.x = MCX; p.y = RH - WALL - p.r - 6; }
    if (enter === 'w') { p.x = WALL + p.r + 6; p.y = MCY; } if (enter === 'e') { p.x = RW - WALL - p.r - 6; p.y = MCY; }
  } else { p.x = MCX; p.y = MCY + 60; }
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
  const n = clamp(2 + f + ri(0, 2) + (room.depth > 3 ? 1 : 0) + (G.asc >= 2 ? 1 : 0), 3, 9);
  const spots = shuffle(freeTiles(room, p, 120));
  const pool = [['goblin', 5], ['skeleton', f === 1 ? 2 : 3], ['ghost', 3], ['slinger', 2], ['wraith', f >= 2 ? 2 + f : 0]];
  const tot = pool.reduce((s, [, w]) => s + w, 0);
  for (let i = 0; i < n && i < spots.length; i++) {
    let r = Math.random() * tot, type = 'goblin';
    for (const [t, w] of pool) { if ((r -= w) < 0) { type = t; break; } }
    spawnEnemy(type, spots[i][0], spots[i][1]);
  }
}

// ===================================================================== room background (pre-rendered)
function renderRoomBg(room) {
  const th = theme(), R = seeded(room.seed);
  const c = mk(RW * 2, RH * 2), x = c.getContext('2d'); x.scale(2, 2); // 2x so the painted floor stays sharp
  const IW = COLS * TILE, IH = ROWS * TILE;
  x.fillStyle = '#0a0b0f'; x.fillRect(0, 0, RW, RH);
  if (IMG.floor) x.drawImage(IMG.floor, room.fx, room.fy, IW * 2, IH * 2, WALL, WALL, IW, IH);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = th.tint; x.fillRect(WALL, WALL, IW, IH);
  x.globalCompositeOperation = 'source-over'; x.fillStyle = 'rgba(8,10,14,0.40)'; x.fillRect(WALL, WALL, IW, IH);
  if (room.type === 'boss') { x.fillStyle = G.floor === FINAL_FLOOR ? 'rgba(80,0,10,0.3)' : 'rgba(60,0,0,0.18)'; x.fillRect(WALL, WALL, IW, IH); }
  const sh = (x0, y0, x1, y1, w, h) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h); };
  sh(0, WALL, 0, WALL + 22, RW, 22); sh(0, RH - WALL, 0, RH - WALL - 10, RW, 10); sh(WALL, 0, WALL + 14, 0, 14, RH); sh(RW - WALL, 0, RW - WALL - 14, 0, 14, RH);
  const [wr, wg, wb] = th.wall;
  const brick = (bx, by, bw, bh) => {
    const v = R() * 22 - 11;
    x.fillStyle = `rgb(${wr + v | 0},${wg + v | 0},${wb + v | 0})`; x.fillRect(bx, by, bw, bh);
    x.fillStyle = 'rgba(255,255,255,0.09)'; x.fillRect(bx, by, bw, 1);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(bx, by + bh - 1, bw, 1); x.fillRect(bx + bw - 1, by, 1, bh);
    if (R() < 0.18) { x.fillStyle = 'rgba(0,0,0,0.35)'; const cx = bx + R() * bw | 0; x.fillRect(cx, by + 1, 1, bh - 2); }
  };
  const band = (x0, y0, w, h) => {
    x.fillStyle = '#121419'; x.fillRect(x0, y0, w, h);
    for (let y = y0; y < y0 + h; y += 8) { const off = ((y - y0) / 8) % 2 ? 8 : 0; for (let bx = x0 - off; bx < x0 + w; bx += 16) brick(Math.max(bx, x0), y, Math.min(16, x0 + w - Math.max(bx, x0)) - 1, 7); }
  };
  band(0, 0, RW, WALL); band(0, RH - WALL, RW, WALL); band(0, WALL, WALL, RH - WALL * 2); band(RW - WALL, WALL, WALL, RH - WALL * 2);
  x.fillStyle = th.moss;
  for (let i = 0; i < 180; i++) {
    const side = Math.floor(R() * 4), t = R();
    let px, py; if (side === 0) { px = WALL + t * IW; py = WALL - R() * 9; } else if (side === 1) { px = WALL + t * IW; py = RH - WALL + R() * 6; }
    else if (side === 2) { px = WALL - R() * 7; py = WALL + t * IH; } else { px = RW - WALL + R() * 7; py = WALL + t * IH; }
    x.globalAlpha = 0.5 + R() * 0.5; x.fillRect(px | 0, py | 0, 1 + (R() * 3 | 0), 1 + (R() * 2 | 0));
  }
  x.globalAlpha = 1;
  x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(WALL - 2, WALL - 2, IW + 4, 2);
  x.strokeStyle = '#0a0b0f'; x.lineWidth = 2; x.strokeRect(WALL - 1, WALL - 1, IW + 2, IH + 2);
  for (const [cx, cy] of [[0, 0], [RW - WALL, 0], [0, RH - WALL], [RW - WALL, RH - WALL]]) {
    x.fillStyle = '#1a1d24'; x.fillRect(cx + 3, cy + 3, WALL - 6, WALL - 6);
    x.fillStyle = `rgb(${wr + 14},${wg + 14},${wb + 16})`; x.fillRect(cx + 5, cy + 5, WALL - 10, WALL - 10);
    x.fillStyle = '#14161c'; x.fillRect(cx + 9, cy + 9, WALL - 18, WALL - 18);
    x.fillStyle = th.rune; x.shadowColor = th.rune; x.shadowBlur = 6;
    const g = Math.floor(R() * 3); x.fillRect(cx + 15, cy + 11, 2, 10); if (g === 0) { x.fillRect(cx + 17, cy + 12, 3, 2); x.fillRect(cx + 17, cy + 16, 3, 2); } else if (g === 1) { x.fillRect(cx + 12, cy + 13, 3, 2); x.fillRect(cx + 17, cy + 13, 3, 2); } else { x.fillRect(cx + 17, cy + 11, 3, 2); x.fillRect(cx + 12, cy + 19, 3, 2); }
    x.shadowBlur = 0;
  }
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
    x.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < 2; i++) { let cx = bx + 3 + R() * (bw - 6), cy = by + 3 + R() * (bh - 6); for (let k = 0; k < 4; k++) { x.fillRect(cx | 0, cy | 0, 1, 1); cx += R() * 2 - 1; cy += 1; } }
    x.fillStyle = th.moss;
    for (let i = 0; i < 10; i++) x.fillRect(bx + R() * bw | 0, by + R() * 5 | 0, 2, 1 + (R() * 2 | 0));
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

// ===================================================================== enemies
const ETYPES = {
  goblin: { sheet: 'goblin', hp: 10, speed: 62, r: 7, xp: 4, contact: 1, color: '#6fae3c' },
  skeleton: { sheet: 'skeleton', hp: 16, speed: 44, r: 7, xp: 6, contact: 1, color: '#d8d0b8', shield: true },
  slinger: { sheet: 'goblinP', hp: 8, speed: 52, r: 7, xp: 5, contact: 1, color: '#9c6fc8' },
  ghost: { sheet: 'ghost', hp: 9, speed: 42, r: 7, xp: 5, contact: 1, flying: true, alpha: 0.88, color: '#9ff0e0' },
  wraith: { sheet: 'ghostW', hp: 15, speed: 50, r: 7, xp: 8, contact: 1, flying: true, alpha: 0.85, color: '#9a8cff' },
  warlord: { sheet: 'goblinB', hp: 150, speed: 54, r: 14, xp: 40, contact: 2, boss: true, color: '#d0603a', name: 'Goblin Warlord' },
  banshee: { sheet: 'ghostB', hp: 130, speed: 40, r: 13, xp: 40, contact: 2, flying: true, boss: true, alpha: 0.9, color: '#ff8adf', name: 'The Banshee' },
  thornheart: { custom: true, hp: 520, speed: 48, r: 18, xp: 120, contact: 2, flying: true, boss: true, color: '#e0353d', name: 'The Thornheart' },
};
function spawnEnemy(type, x, y, quick) {
  const d = ETYPES[type], m = d.boss ? (1 + 0.2 * G.asc) : hpMul();
  const e = { type, d, x, y, vx: 0, vy: 0, r: d.r, hp: d.hp * m, maxHp: d.hp * m, sheet: SHEETS[d.sheet],
    face: 'down', flip: false, anim: Math.random() * 4, state: 'spawn', t: quick ? 0.3 : 0.7, atkCd: rand(0.6, 1.6), pose: 0,
    flash: 0, slow: 0, phase: Math.random() * TAU, alpha: 1, inv: false };
  G.enemies.push(e);
  for (let i = 0; i < 14; i++) part(x + rand(-8, 8), y + rand(-4, 4), rand(-20, 20), rand(-50, -10), rand(0.4, 0.8), '#1a1220', 3, -10);
  return e;
}
function spawnBoss() {
  const f = G.floor;
  G.bossHit = false;
  if (f === FINAL_FLOOR) {
    const e = spawnEnemy('thornheart', MCX, WALL + 80); e.t = 2; e.atkCd = 1.5; e.ph = 1;
    G.bosses = [e]; G.bossName = 'The Thornheart';
    showBanner('The Thornheart', 'Root of every thorn', true);
  } else if (f === 3) {
    const a = spawnEnemy('warlord', MCX - 70, MCY - 70), b = spawnEnemy('banshee', MCX + 70, MCY - 70);
    for (const e of [a, b]) { e.hp *= 0.7; e.maxHp *= 0.7; e.t = 1.4; e.atkCd = rand(1.2, 2.2); }
    G.bosses = [a, b]; G.bossName = 'Twin Guardians';
    showBanner('Twin Guardians', 'Warlord and Banshee, together', true);
  } else {
    const type = f === 1 ? 'warlord' : 'banshee';
    const e = spawnEnemy(type, MCX, MCY - 70); e.t = 1.4; e.atkCd = 1.2;
    G.bosses = [e]; G.bossName = ETYPES[type].name;
    showBanner(ETYPES[type].name, `Guardian of floor ${f}`, true);
  }
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
  speed *= 1 + 0.06 * G.asc;
  G.ebul.push({ x: e.x + Math.cos(ang) * 8, y: e.y - 6 + Math.sin(ang) * 8, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r, kind, life: 5, dmg });
}
// a bullet from a fixed point in the room (bullet walls)
function shootFrom(x, y, ang, speed, kind) {
  speed *= 1 + 0.06 * G.asc;
  G.ebul.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 3.5, kind, life: 7, dmg: 1 });
}
function updateEnemy(e, dt) {
  const p = G.player, room = G.room, d = e.d;
  const dxp = p.x - e.x, dyp = p.y - e.y, dist = hyp(dxp, dyp) || 1, angP = Math.atan2(dyp, dxp);
  if (e.flash > 0) e.flash -= dt; if (e.slow > 0) e.slow -= dt;
  e.t -= dt; e.atkCd -= dt;
  if (e.state === 'spawn') { e.alpha = 1 - Math.max(0, e.t) / 0.7; if (e.t <= 0) { e.state = 'move'; e.alpha = 1; } return; }
  AI[e.type](e, dt, { dxp, dyp, dist, angP });
  e.x += e.vx * dt; e.y += e.vy * dt;
  if (!d.flying) collideTiles(e, room, true);
  clampRoom(e);
  if (Math.hypot(e.vx, e.vy) > 6 && !e.pose) faceFrom(e, e.vx, e.vy);
  e.anim += dt * (e.d.flying ? 6 : Math.max(5, Math.hypot(e.vx, e.vy) * 0.11));
}
const AI = {
  skeleton(e, dt, o) { AI.goblin(e, dt, o); },
  goblin(e, dt, { dxp, dyp, dist }) {
    if (e.state === 'move') {
      const [mx, my] = flowDir(e); moveEnemy(e, mx, my, e.d.speed, dt);
      if (dist < 30 && e.atkCd <= 0) { e.state = 'windup'; e.t = e.type === 'skeleton' ? 0.45 : 0.32; e.pose = 1; faceFrom(e, dxp, dyp); e.ax = dxp / dist; e.ay = dyp / dist; }
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
        if (enraged && !e.summoned && G.bosses.length === 1) opts.push('summon', 'summon');
        const a = pick(opts);
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
        if (wall) { G.shake = 8; SFX.play('boom'); const n = enraged ? 10 : 7; for (let i = 0; i < n; i++) enemyShoot(e, e.ca + Math.PI + (i / (n - 1) - 0.5) * 2.2, rand(100, 150), 'rock'); }
      }
    } else if (e.state === 'stun') { moveEnemy(e, 0, 0, 0, dt, 10); if (e.t <= 0) { e.state = 'move'; e.atkCd = rand(1.0, 1.6); } }
    else if (e.state === 'fan') {
      moveEnemy(e, 0, 0, 0, dt, 10);
      if (e.t <= 0) {
        if (e.vol-- <= 0) { e.state = 'move'; e.pose = 0; e.atkCd = rand(1.2, 1.8); return; }
        SFX.play('throw'); e.pose = e.pose === 1 ? 2 : 1; faceFrom(e, dxp, dyp);
        for (let i = 0; i < 5; i++) enemyShoot(e, angP + (i - 2) * 0.28 + (e.vol % 2 ? 0.14 : 0), 145, 'dagger');
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
  // Final boss: three phases. It runs one attack at a time while it keeps moving.
  thornheart(e, dt, { angP }) {
    const ratio = e.hp / e.maxHp, ph = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (ph !== e.ph) {
      e.ph = ph; e.state = 'shift'; e.t = 1.8; e.atk = null; G.ebul.length = 0; G.hazards.length = 0;
      SFX.play('roar'); G.shake = 12;
      showBanner(ph === 2 ? 'Its Chains Break' : 'Unbound Fury', ph === 2 ? 'The Thornheart tears free' : 'The Thornheart rages', true);
      for (let i = 0; i < 40; i++) { const a = rand(0, TAU); part(e.x, e.y - 14, Math.cos(a) * 160, Math.sin(a) * 160, 0.8, i % 2 ? '#e0353d' : '#2f4228', 3); }
    }
    if (e.state === 'shift') { moveEnemy(e, 0, 0, 0, dt, 4); if (e.t <= 0) { e.state = 'move'; e.atkCd = 0.6; } return; }
    if (ph === 1) {
      const tx = MCX + Math.sin(G.time * 0.7) * 40, ty = WALL + 80; const [mx, my] = norm(tx - e.x, ty - e.y);
      moveEnemy(e, mx, my, hyp(tx - e.x, ty - e.y) > 3 ? e.d.speed : 0, dt, 3);
    } else {
      e.retarget = (e.retarget || 0) - dt;
      if (!e.tx || e.retarget <= 0 || hyp(e.tx - e.x, e.ty - e.y) < 8) {
        const spots = freeTiles(G.room, G.player, 110); const s = pick(spots.length ? spots : freeTiles(G.room)); e.tx = s[0]; e.ty = s[1]; e.retarget = 2.5;
      }
      const [mx, my] = norm(e.tx - e.x, e.ty - e.y); moveEnemy(e, mx, my, e.d.speed * (ph === 3 ? 1.4 : 1.1), dt, 2);
    }
    if (!e.atk && e.atkCd <= 0) {
      const opts = ['spiral', 'wall', 'thorns', 'aimed', 'summon'];
      if (ph >= 2) opts.push('nova', 'thorns');
      if (ph === 3) opts.push('spiral', 'wall');
      let k = pick(opts); if (k === e.lastAtk) k = pick(opts);
      if (k === 'summon' && G.enemies.length > 3) k = 'aimed';
      e.lastAtk = k;
      e.atk = { k, t: 0, n: 0, dur: k === 'spiral' ? (ph === 3 ? 3.2 : 2.4) : 0, sa: angP, dir: Math.random() < 0.5 ? 1 : -1 };
      if (k === 'spiral') SFX.play('cast');
    }
    const A = e.atk; if (!A) return;
    A.t -= dt;
    if (A.k === 'spiral') {
      A.dur -= dt; A.sa += dt * 2.1 * A.dir;
      if (A.t <= 0) { A.t = ph === 3 ? 0.08 : 0.1; SFX.play('orb'); const arms = ph + 1; for (let i = 0; i < arms; i++) enemyShoot(e, A.sa + i * TAU / arms, 92, 'shard'); }
      if (A.dur <= 0) endAtk(e);
    } else if (A.k === 'wall') {
      if (A.t <= 0) {
        if (A.n >= (ph === 1 ? 2 : 3)) { endAtk(e); return; }
        SFX.play('orb'); A.t = 1.0;
        if (!(ph >= 2 && A.n % 2 === 1)) { const gap = rand(WALL + 40, RW - WALL - 40); for (let x = WALL + 8; x < RW - WALL; x += 15) if (Math.abs(x - gap) > 30) shootFrom(x, WALL + 6, Math.PI / 2, 72, 'orbP'); }
        else { const gap = rand(WALL + 50, RH - WALL - 50), left = Math.random() < 0.5;
          for (let y = WALL + 8; y < RH - WALL; y += 15) if (Math.abs(y - gap) > 30) shootFrom(left ? WALL + 6 : RW - WALL - 6, y, left ? 0 : Math.PI, 72, 'orbP'); }
        A.n++;
      }
    } else if (A.k === 'thorns') {
      if (A.t <= 0) {
        if (A.n >= (ph === 3 ? 3 : 2)) { endAtk(e); return; }
        const p = G.player, count = 2 + ph;
        G.hazards.push({ x: p.x, y: p.y, warn: 0.9, t: 0, r: 18 });
        for (let i = 1; i < count; i++) { const a = rand(0, TAU), d = rand(30, 80); G.hazards.push({ x: clamp(p.x + Math.cos(a) * d, WALL + 16, RW - WALL - 16), y: clamp(p.y + Math.sin(a) * d, WALL + 16, RH - WALL - 16), warn: 0.9 + rand(0, 0.25), t: 0, r: 18 }); }
        A.n++; A.t = 1.1;
      }
    } else if (A.k === 'aimed') {
      if (A.t <= 0) {
        if (A.n >= 3) { endAtk(e); return; }
        SFX.play('throw'); const spread = ph === 3 ? 7 : 5;
        for (let i = 0; i < spread; i++) enemyShoot(e, angP + (i - (spread - 1) / 2) * 0.16, 155, 'shard');
        A.n++; A.t = 0.38;
      }
    } else if (A.k === 'nova') {
      if (A.t <= 0) {
        if (A.n >= 2) { endAtk(e); return; }
        SFX.play('boom'); G.shake = 5; const n = 20, off = A.n ? TAU / n / 2 : 0;
        for (let i = 0; i < n; i++) enemyShoot(e, off + i * TAU / n, 100, 'shard');
        A.n++; A.t = 0.35;
      }
    } else if (A.k === 'summon') {
      SFX.play('roar');
      const type = ph === 1 ? 'goblin' : ph === 2 ? 'ghost' : 'wraith';
      for (const s of [-1, 1]) { const [sx, sy] = nearestFree(G.room, e.x + s * 70, e.y + 40); spawnEnemy(type, sx, sy, true); }
      endAtk(e);
    }
  },
};
function endAtk(e) { e.atk = null; e.atkCd = rand(0.7, 1.3) * (e.ph === 3 ? 0.65 : 1); }

// ===================================================================== combat
function damageEnemy(e, dmg, kx, ky, src) {
  if (e.state === 'spawn' || e.state === 'shift' || e.inv || e.hp <= 0) return false;
  e.hp -= dmg; e.flash = 0.09;
  const kb = e.d.boss ? 0.15 : 1;
  e.vx += kx * 90 * kb; e.vy += ky * 90 * kb;
  const fr = G.player.skills.frost || 0;
  if (fr && src === 'tear' && !e.d.boss && Math.random() < fr * 0.2) { e.slow = 2; for (let i = 0; i < 5; i++) part(e.x, e.y - 8, rand(-30, 30), rand(-30, 30), 0.5, '#bfefff', 2); }
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
  const n = e.d.boss ? 80 : 18;
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(20, e.d.boss ? 220 : 110); part(e.x, e.y - 8, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 1), i % 3 ? e.d.color : '#1a1a1a', rand(2, 4), 80); }
  G.shake = Math.max(G.shake, e.d.boss ? 12 : 2.5);
  if (e.d.boss) {
    G.slowmo = 0.9; G.bossesKilled++;
    if (e.type === 'warlord') unlockFeat('warlord');
    if (e.type === 'banshee') unlockFeat('banshee');
    if (e.type === 'thornheart') { G.ebul.length = 0; G.hazards.length = 0; for (const o of G.enemies) if (!o.dead) { o.dead = true; part(o.x, o.y, 0, -40, 0.6, o.d.color, 4); } }
  }
  gainXp(e.d.xp);
  if (SAVE.stats.kills + G.kills >= 200) unlockFeat('slayer');
  const luck = p.luck;
  if (Math.random() < 0.32 + luck * 0.05 + upRank('greed') * 0.08) dropPickup(Math.random() < 0.12 ? 'bigcrystal' : 'crystal', e.x, e.y);
  if (Math.random() < (0.05 + luck * 0.02) * Math.max(0.25, 1 - 0.15 * G.asc)) dropPickup('halfheart', e.x, e.y);
  const v = p.skills.vamp || 0;
  if (v && ++p.vampKills >= 16 - v * 4) { p.vampKills = 0; if (p.hp < p.maxHp) { p.hp += 1; SFX.play('heart'); G.texts.push({ x: p.x, y: p.y - 26, t: 0.9, text: '+♥', color: '#ff6a7a' }); } }
}
function gainXp(n) {
  const p = G.player; p.xp += Math.round(n * (1 + upRank('wisdom') * 0.15));
  while (p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; G.pendingLv++; G.lvDelay = 0.45; }
  if (p.level >= 10) unlockFeat('level10');
}
function hurtPlayer(n, sx, sy) {
  const p = G.player;
  if (p.inv > 0 || G.dying || mode !== 'play' || G.victoryT) return;
  p.hp -= n; p.inv = 1.1; G.freeze = 0.07; G.shake = 7; G.hurtFlash = 0.25;
  if (G.room.type === 'boss') G.bossHit = true;
  const [kx, ky] = norm(p.x - sx, p.y - sy); p.vx += kx * 160; p.vy += ky * 160;
  SFX.play('hurt');
  for (let i = 0; i < 12; i++) part(p.x, p.y - 8, rand(-90, 90), rand(-90, 60), rand(0.3, 0.6), '#c3243a', 2, 120);
  const m = p.skills.mantle || 0;
  if (m) { const k = 6 + m * 2; for (let i = 0; i < k; i++) { const a = i * TAU / k; fireTear(p.x, p.y - 6, Math.cos(a), Math.sin(a), { dmg: 2 + m * 1.5, thorn: true }); } }
  if (p.hp <= 0) {
    if (p.revive > 0) { // Second Wind
      p.revive--; p.hp = 2; p.inv = 2.2; G.ebul.length = 0; G.hazards.length = 0; G.slowmo = 0.6; SFX.play('levelup');
      showBanner('Second Wind', 'You rise again');
      for (let i = 0; i < 40; i++) { const a = rand(0, TAU); part(p.x, p.y - 8, Math.cos(a) * 140, Math.sin(a) * 140, 0.7, '#ffd27a', 3); }
      for (const e of G.enemies) if (!e.d.boss && hyp(e.x - p.x, e.y - p.y) < 70) { const [nx, ny] = norm(e.x - p.x, e.y - p.y); damageEnemy(e, 20, nx, ny, 'burst'); }
      return;
    }
    p.hp = 0; G.dying = 1.4; G.slowmo = 1.4; SFX.play('die');
  }
}
function fireTear(x, y, dx, dy, o = {}) {
  const p = G.player;
  const sp = p.shotSpeed * (o.thorn ? 1.1 : 1);
  G.tears.push({ x, y, vx: dx * sp + (o.thorn ? 0 : p.vx * 0.25), vy: dy * sp + (o.thorn ? 0 : p.vy * 0.25), r: o.thorn ? 3 : 3.5 + Math.min(2, p.dmg / 6),
    dmg: o.dmg || p.dmg, life: (o.thorn ? 140 : p.range) / sp, pierce: o.thorn ? 0 : p.skills.pierce || 0,
    bounce: o.thorn ? 0 : p.skills.bounce || 0, homing: o.thorn ? 0 : p.skills.homing || 0, hit: new Set(), thorn: !!o.thorn });
}
function playerShoot(ax, ay) {
  const p = G.player;
  const base = Math.atan2(ay, ax), n = 1 + (p.skills.split || 0), spread = 0.17;
  for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * spread; fireTear(p.x + Math.cos(a) * 5, p.y - 8 + Math.sin(a) * 4, Math.cos(a), Math.sin(a)); }
  if (p.skills.rear) fireTear(p.x, p.y - 8, -Math.cos(base), -Math.sin(base));
  p.castT = 0.16;
  SFX.play('shoot');
}
function slashFx(x, y, ang, color, size = 14) { G.parts.push({ x, y, vx: 0, vy: 0, t: 0.16, max: 0.16, color, size, arc: ang, grav: 0 }); }
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
const input = { mx: 0, my: 0, ax: 0, ay: 0, mouseX: 0, mouseY: 0, mouseDown: false };
const sticks = { move: null, aim: null };
window.addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) && mode !== 'menu') ev.preventDefault();
  keys.add(k); SFX.init();
  if (mode === 'title') {
    if (k === 'enter') startGame();
    else if (k === 'arrowleft' || k === 'arrowright') cycleChar(k === 'arrowleft' ? -1 : 1);
  } else if (mode === 'play' && (k === 'escape' || k === 'p')) pauseGame();
  else if (mode === 'pause' && (k === 'escape' || k === 'p')) resumeGame();
  else if (mode === 'dead' && k === 'enter') startGame();
  else if (mode === 'menu' && k === 'escape') closeMenus();
  else if (mode === 'levelup') lvKey(k);
  if (k === 'm') toggleSound();
});
window.addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); input.mouseDown = false; if (mode === 'play') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pauseGame(); });

function canvasPoint(cx, cy) { const r = cv.getBoundingClientRect(); return [(cx - r.left) / r.width * VW, (cy - r.top) / r.height * VH]; }
const PAUSE_BTN = { x: 258, y: 10, w: 20, h: 20 };
const inPauseBtn = (x, y) => x >= PAUSE_BTN.x - 8 && x <= PAUSE_BTN.x + PAUSE_BTN.w + 8 && y >= PAUSE_BTN.y - 8 && y <= PAUSE_BTN.y + PAUSE_BTN.h + 8;
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
const stickEl = (which) => (which === 'move' ? $('stickMove') : $('stickAim'));
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
  if (sticks.move) { const s = sticks.move, l = hyp(s.dx, s.dy); if (l > 0.18) { const k = Math.min(1, (l - 0.18) / 0.62); mx = s.dx / l * k; my = s.dy / l * k; } }
  if (sticks.aim) { const s = sticks.aim; if (hyp(s.dx, s.dy) > 0.3) { ax = s.dx; ay = s.dy; } }
  if (input.mouseDown && !ax && !ay) { const p = G.player; ax = input.mouseX - p.x; ay = input.mouseY - HUD - (p.y - 8); }
  const al = hyp(ax, ay); if (al) { ax /= al; ay /= al; }
  input.mx = mx; input.my = my; input.ax = ax; input.ay = ay;
}

// ===================================================================== update
function update(dt) {
  G.time += dt;
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
  if (G.toasts.length) { G.toasts[0].t += dt; if (G.toasts[0].t > 3) G.toasts.shift(); }
  if (G.hurtFlash > 0) G.hurtFlash -= dt;
  G.shake = Math.max(0, G.shake - dt * 30);
  if (G.fade) return updateFade(dt);
  if (G.trans) return updateTrans(dt);
  if (G.freeze > 0) { G.freeze -= dt; return; }
  if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.35; }
  if (G.dying) { G.dying -= dt / 0.35; updateParticles(dt); if (G.dying <= 0) endRun(false); return; }
  if (G.victoryT) { G.victoryT -= dt / (G.slowmo > 0 ? 0.35 : 1); if (G.victoryT <= 0) { endRun(true); return; } }
  readInput();
  updatePlayer(dt);
  updateTears(dt);
  for (const e of G.enemies) updateEnemy(e, dt);
  separateEnemies();
  G.enemies = G.enemies.filter((e) => !e.dead);
  G.bosses = G.bosses.filter((e) => !e.dead);
  updateBullets(dt);
  updateHazards(dt);
  updatePickups(dt);
  updateParticles(dt);
  checkRoomClear();
  if (G.pendingLv > 0 && !G.dying && !G.victoryT) { G.lvDelay -= dt; if (G.lvDelay <= 0) openLevelUp(); }
}
function updatePlayer(dt) {
  const p = G.player, room = G.room;
  if (p.inv > 0) p.inv -= dt;
  if (p.castT > 0) p.castT -= dt;
  const accel = 14;
  p.vx = lerp(p.vx, input.mx * p.speed, Math.min(1, accel * dt)); p.vy = lerp(p.vy, input.my * p.speed, Math.min(1, accel * dt));
  p.x += p.vx * dt; p.y += p.vy * dt;
  collideTiles(p, room, false); clampRoom(p);
  const tt = tileAt(room, toT(p.x), toT(p.y + 2));
  if (tt === 2) hurtPlayer(1, WALL + toT(p.x) * TILE + 16, WALL + toT(p.y + 2) * TILE + 16);
  const moving = hyp(p.vx, p.vy) > 8;
  if (moving) { p.anim += dt * Math.max(6, hyp(p.vx, p.vy) * 0.085); p.stepT -= dt; if (p.stepT <= 0) { p.stepT = 0.28; part(p.x + rand(-3, 3), p.y + 4, rand(-10, 10), rand(-12, -4), 0.35, 'rgba(120,110,90,0.7)', 2); } }
  else p.anim = 0;
  const fx = input.ax || input.mx, fy = input.ay || input.my;
  if (fx || fy) { if (Math.abs(fx) > Math.abs(fy)) { p.face = 'side'; p.flip = fx < 0; } else p.face = fy < 0 ? 'up' : 'down'; }
  p.fireCd -= dt;
  if ((input.ax || input.ay) && p.fireCd <= 0 && !G.victoryT) { p.fireCd = p.fireDelay; playerShoot(input.ax, input.ay); }
  const orbs = p.skills.orbit || 0;
  if (orbs) {
    p.orbA += dt * 3.2;
    for (let i = 0; i < orbs; i++) {
      const a = p.orbA + i * TAU / orbs, ox = p.x + Math.cos(a) * 24, oy = p.y - 6 + Math.sin(a) * 24;
      for (const e of G.enemies) { if (hyp(e.x - ox, e.y - 8 - oy) < e.r + 6) { const k = p.orbHits.get(e) || 0; if (G.time > k) { p.orbHits.set(e, G.time + 0.35); damageEnemy(e, p.dmg * 0.6, Math.cos(a), Math.sin(a), 'orb'); } } }
      for (const b of G.ebul) if (hyp(b.x - ox, b.y - oy) < b.r + 5) { b.dead = true; part(b.x, b.y, 0, 0, 0.2, '#9fe8ff', 3); }
    }
  }
  if (room.cleared && !G.victoryT) {
    const lane = 12;
    const tryDoor = (d, cond) => { if (room.doors[d] && cond) startTrans(d); };
    tryDoor('n', Math.abs(p.x - MCX) < lane && p.y - p.r <= WALL + 0.5 && input.my < -0.2);
    tryDoor('s', Math.abs(p.x - MCX) < lane && p.y + p.r >= RH - WALL - 0.5 && input.my > 0.2);
    tryDoor('w', Math.abs(p.y - MCY) < lane && p.x - p.r <= WALL + 0.5 && input.mx < -0.2);
    tryDoor('e', Math.abs(p.y - MCY) < lane && p.x + p.r >= RW - WALL - 0.5 && input.mx > 0.2);
    // gentle funnel: near a door, nudge the player into the lane so doors feel easy to hit
    const k = Math.min(1, 6 * dt);
    if (room.doors.n && p.y < WALL + 26 && Math.abs(p.x - MCX) < 26 && input.my < 0) p.x = lerp(p.x, MCX, k);
    if (room.doors.s && p.y > RH - WALL - 26 && Math.abs(p.x - MCX) < 26 && input.my > 0) p.x = lerp(p.x, MCX, k);
    if (room.doors.w && p.x < WALL + 26 && Math.abs(p.y - MCY) < 26 && input.mx < 0) p.y = lerp(p.y, MCY, k);
    if (room.doors.e && p.x > RW - WALL - 26 && Math.abs(p.y - MCY) < 26 && input.mx > 0) p.y = lerp(p.y, MCY, k);
  }
  for (const e of G.enemies) if (e.state !== 'spawn' && e.alpha > 0.5 && hyp(e.x - p.x, e.y - p.y) < e.r + p.r - 1) hurtPlayer(e.d.contact, e.x, e.y);
  if (room.trapdoor && hyp(p.x - MCX, p.y - MCY) < 10) descend();
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
  if (ped.price) { SFX.play('buy'); SAVE.stats.bought++; persist(); if (SAVE.stats.bought >= 5) unlockFeat('patron'); }
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
    let hitWall = false;
    if (t.x < WALL || t.x > RW - WALL) { if (t.bounce > 0) { t.bounce--; t.vx *= -1; t.x = clamp(t.x, WALL, RW - WALL); } else hitWall = true; }
    if (t.y < WALL - 10 || t.y > RH - WALL - 4) { if (t.bounce > 0) { t.bounce--; t.vy *= -1; t.y = clamp(t.y, WALL - 10, RH - WALL - 4); } else hitWall = true; }
    if (hitWall || solidAt(room, t.x, t.y + 6) || t.life <= 0) { t.dead = true; splash(t); continue; }
    for (const e of G.enemies) {
      if (t.hit.has(e) || e.dead) continue;
      if (hyp(e.x - t.x, e.y - (e.d.custom ? 14 : 8) - t.y) < e.r + t.r + 2) {
        const sp = hyp(t.vx, t.vy) || 1;
        if (e.d.shield && !e.pose && shieldBlocks(e, t.vx / sp, t.vy / sp)) { // skeletons block shots from the front
          t.dead = true; t.hit.add(e); SFX.play('clang');
          for (let i = 0; i < 6; i++) part(t.x, t.y, rand(-70, 70), rand(-70, 20), 0.3, '#ffd88a', 2, 120);
          damageEnemy(e, t.dmg * 0.2, t.vx / sp * 0.3, t.vy / sp * 0.3, 'block'); break;
        }
        if (damageEnemy(e, t.dmg, t.vx / sp, t.vy / sp, 'tear')) {
          t.hit.add(e);
          if (t.pierce > 0) t.pierce--; else { t.dead = true; splash(t); break; }
        }
      }
    }
  }
  G.tears = G.tears.filter((t) => !t.dead);
}
function shieldBlocks(e, dx, dy) {
  const fx = e.face === 'side' ? (e.flip ? -1 : 1) : 0, fy = e.face === 'down' ? 1 : e.face === 'up' ? -1 : 0;
  return dx * fx + dy * fy < -0.55;
}
function splash(t) {
  SFX.play('splash');
  const c = t.thorn ? '#9ccf6a' : '#8fe6ff';
  for (let i = 0; i < 6; i++) part(t.x, t.y, rand(-60, 60), rand(-60, 30), rand(0.15, 0.35), c, 2, 100);
}
const SPECTRAL = { orb: 1, orbP: 1, shard: 1 };
function updateBullets(dt) {
  const p = G.player, room = G.room;
  for (const b of G.ebul) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.x < WALL - 4 || b.x > RW - WALL + 4 || b.y < WALL - 4 || b.y > RH - WALL + 4 || b.life <= 0 || (!SPECTRAL[b.kind] && solidAt(room, b.x, b.y))) {
      b.dead = true; for (let i = 0; i < 4; i++) part(b.x, b.y, rand(-40, 40), rand(-40, 40), 0.25, bulletColor(b), 2); continue;
    }
    if (hyp(p.x - b.x, p.y - 6 - b.y) < p.r + b.r - 1) { b.dead = true; hurtPlayer(b.dmg, b.x - b.vx, b.y - b.vy); }
  }
  G.ebul = G.ebul.filter((b) => !b.dead);
}
const bulletColor = (b) => (b.kind === 'orb' ? '#9ff0e0' : b.kind === 'orbP' ? '#d48cff' : b.kind === 'shard' ? '#ff5a6a' : b.kind === 'rock' ? '#a08870' : '#d8d0c0');
function updateHazards(dt) {
  const p = G.player;
  for (const h of G.hazards) {
    if (h.warn > 0) {
      h.warn -= dt;
      if (h.warn <= 0) {
        h.t = 0.45; SFX.play('spike'); G.shake = Math.max(G.shake, 3);
        for (let i = 0; i < 10; i++) part(h.x, h.y, rand(-60, 60), rand(-90, -20), 0.4, i % 2 ? '#3b2a3e' : '#c9b8a8', 2, 160);
        if (hyp(p.x - h.x, p.y - h.y) < h.r + p.r - 2) hurtPlayer(1, h.x, h.y);
      }
    } else { h.t -= dt; if (h.t <= 0) h.dead = true; }
  }
  G.hazards = G.hazards.filter((h) => !h.dead);
}
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
    const d = hyp(p.x - k.x, p.y - k.y) || 1;
    if (canTake && d < 56) { const pull = (1 - d / 56) * 600 * dt; k.x += (p.x - k.x) / d * pull; k.y += (p.y - k.y) / d * pull; }
    if (canTake && d < p.r + 6) {
      k.dead = true;
      if (k.type === 'crystal') { p.crystals += 1; SFX.play('crystal'); }
      else if (k.type === 'bigcrystal') { p.crystals += 5; SFX.play('crystal'); G.texts.push({ x: k.x, y: k.y - 14, t: 0.8, text: '+5', color: '#8fe6ff' }); }
      else { p.hp = Math.min(p.maxHp, p.hp + (k.type === 'heart' ? 2 : 1)); SFX.play('heart'); }
      if (p.crystals >= 30) unlockFeat('hoarder');
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
  const luck = G.player.luck;
  if (room.type === 'boss') {
    if (!G.bossHit) unlockFeat('untouched');
    if (G.floor === 3) unlockFeat('twins');
    if (G.floor === FINAL_FLOOR) {
      unlockFeat('victory'); if (G.asc >= 3) unlockFeat('asc3');
      G.victoryT = 3.2; SFX.play('win'); showBanner('The Thornheart Falls', 'The thorns wither. You are free.', true);
      return;
    }
    room.trapdoor = true;
    room.peds.push(makePed('skill', MCX, MCY - 60, 0));
    dropPickup('heart', MCX - 40, MCY + 40); for (let i = 0; i < 4; i++) dropPickup('crystal', MCX + 40, MCY + 40);
    showBanner('Guardian Slain', 'A passage opens below');
  } else {
    const r = Math.random() - luck * 0.04;
    const [x, y] = nearestFree(room, MCX, MCY);
    if (r < 0.22 * Math.max(0.3, 1 - 0.15 * G.asc)) dropPickup('heart', x, y);
    else if (r < 0.52) for (let i = 0; i < 3; i++) dropPickup('crystal', x, y);
    else if (r < 0.66) dropPickup('bigcrystal', x, y);
  }
}
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
    showBanner(G.floor === FINAL_FLOOR ? 'Final Floor' : `Floor ${G.floor}`, theme().name);
    if (G.floor >= 3) unlockFeat('depths');
  }
  if (f.t >= f.dur) G.fade = null;
}
function showBanner(title, sub, boss) { G.banner = { title, sub, t: 0, dur: boss ? 2.6 : 2.4, boss }; }

// ===================================================================== render
function render() {
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
  if (!G) return;
  const sx = G.shake ? rand(-G.shake, G.shake) * 0.5 : 0, sy = G.shake ? rand(-G.shake, G.shake) * 0.5 : 0;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, HUD, RW, RH); ctx.clip();
  if (G.trans) {
    const tr = G.trans, k = ease(Math.min(1, tr.t / tr.dur)), [dx, dy] = DIRS[tr.dir];
    const ox = -dx * RW * k, oy = -dy * RH * k;
    ctx.drawImage(tr.from.bg, ox, HUD + oy, RW, RH); drawDoors(tr.from, ox, HUD + oy);
    ctx.drawImage(tr.to.bg, ox + dx * RW, HUD + oy + dy * RH, RW, RH); drawDoors(tr.to, ox + dx * RW, HUD + oy + dy * RH);
  } else {
    ctx.translate(sx, HUD + sy);
    drawWorld();
  }
  ctx.restore();
  drawHud();
  if (G.bosses.length) drawBossBar();
  if (G.banner) drawBanner(G.banner);
  if (G.toasts.length) drawToast(G.toasts[0]);
  if (G.hurtFlash > 0) { ctx.fillStyle = `rgba(160,0,20,${G.hurtFlash * 0.8})`; ctx.fillRect(0, HUD, RW, RH); }
  if (G.victoryT) { ctx.fillStyle = `rgba(255,240,210,${clamp(1 - G.victoryT / 3.2, 0, 0.6)})`; ctx.fillRect(0, HUD, RW, RH); }
  if (G.fade) { const f = G.fade, a = f.t < f.dur / 2 ? f.t / (f.dur / 2) : 1 - (f.t - f.dur / 2) / (f.dur / 2); ctx.fillStyle = `rgba(0,0,0,${clamp(a, 0, 1)})`; ctx.fillRect(0, 0, VW, VH); }
  if (G.dying) { ctx.fillStyle = `rgba(30,0,0,${clamp(1 - G.dying / 1.4, 0, 0.7)})`; ctx.fillRect(0, 0, VW, VH); }
}
function drawWorld() {
  const room = G.room, p = G.player, th = theme();
  ctx.drawImage(room.bg, 0, 0, RW, RH);
  drawDoors(room, 0, 0);
  if (room.trapdoor) drawTrapdoor();
  for (const h of G.hazards) drawHazard(h);
  for (const ped of room.peds) if (!ped.taken) drawPedestal(ped);
  for (const k of room.pickups) drawPickup(k);
  // lighting: darken the room before the actors so characters stay bright and readable
  lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, lightCv.width, lightCv.height);
  lctx.fillStyle = `rgba(4,5,12,${th.dark})`; lctx.fillRect(0, 0, lightCv.width, lightCv.height);
  lctx.globalCompositeOperation = 'destination-out';
  const L = (x, y, r, a = 1) => { lctx.globalAlpha = a; lctx.drawImage(LIGHT, (x - r) / 2, (y - r) / 2, r, r); };
  L(p.x, p.y - 8, 230); L(MCX, MCY, 460, 0.35);
  for (const t of G.tears) L(t.x, t.y, 50, 0.6);
  for (const b of G.ebul) L(b.x, b.y, 40, 0.5);
  for (const e of G.enemies) if (e.d.flying) L(e.x, e.y - 10, e.d.custom ? 180 : 70, 0.6);
  for (const k of room.pickups) L(k.x, k.y, 40, 0.6);
  for (const ped of room.peds) if (!ped.taken) L(ped.x, ped.y - 14, 70, 0.8);
  for (const h of G.hazards) L(h.x, h.y, 50, 0.6);
  if (room.trapdoor) L(MCX, MCY, 60, 0.7);
  lctx.globalAlpha = 1;
  ctx.drawImage(lightCv, 0, 0, RW, RH);
  const actors = [...G.enemies, p].sort((a, b) => a.y - b.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const a of actors) { ctx.beginPath(); ctx.ellipse(a.x, a.y + 3, a.r + 2, (a.r + 2) * 0.45, 0, 0, TAU); ctx.fill(); }
  for (const a of actors) { if (a === p) drawPlayer(); else if (a.d.custom) drawThornheart(a); else drawEnemy(a); }
  for (const e of G.enemies) if (e.state === 'aim') { ctx.strokeStyle = `rgba(255,70,40,${0.3 + 0.3 * Math.sin(G.time * 30)})`; ctx.lineWidth = e.r * 1.6; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.ca) * 500, e.y + Math.sin(e.ca) * 500); ctx.stroke(); }
  ctx.globalCompositeOperation = 'lighter';
  for (const t of G.tears) ctx.drawImage(t.thorn ? GLOW.green : GLOW.cyan, t.x - 10, t.y - 10, 20, 20);
  for (const b of G.ebul) if (SPECTRAL[b.kind]) ctx.drawImage(b.kind === 'orb' ? GLOW.teal : b.kind === 'shard' ? GLOW.red : GLOW.violet, b.x - 11, b.y - 11, 22, 22);
  ctx.globalCompositeOperation = 'source-over';
  for (const t of G.tears) drawTear(t);
  for (const b of G.ebul) drawBullet(b);
  const orbs = p.skills.orbit || 0;
  for (let i = 0; i < orbs; i++) { const a = p.orbA + i * TAU / orbs; const ox = p.x + Math.cos(a) * 24, oy = p.y - 6 + Math.sin(a) * 24;
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(GLOW.cyan, ox - 12, oy - 12, 24, 24); ctx.globalCompositeOperation = 'source-over';
    if (IMG.c16) ctx.drawImage(IMG.c16, ox - 6, oy - 6, 12, 12); }
  for (const q of G.parts) {
    const a = clamp(q.t / q.max, 0, 1);
    if (q.arc !== undefined) { ctx.strokeStyle = q.color; ctx.globalAlpha = a; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.2 - a * 0.4), q.arc - 1.1, q.arc + 1.1); ctx.stroke(); ctx.globalAlpha = 1; continue; }
    ctx.globalAlpha = a; ctx.fillStyle = q.color; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.font = '600 9px "Alegreya Sans", sans-serif';
  for (const t of G.texts) { ctx.globalAlpha = clamp(t.t * 3, 0, 1); ctx.fillStyle = '#000'; ctx.fillText(t.text, t.x + 1, t.y + 1); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); }
  ctx.globalAlpha = 1;
  for (const ped of room.peds) if (!ped.taken && hyp(p.x - ped.x, p.y - ped.y) < 70) drawPedLabel(ped);
}
function drawDoors(room, ox, oy) {
  const th = theme();
  for (const d in room.doors) {
    const [dx, dy] = DIRS[d], n = roomAt(room.gx + dx, room.gy + dy);
    const special = n.type === 'boss' || room.type === 'boss' ? 'boss' : n.type === 'treasure' ? 'treasure' : n.type === 'shop' ? 'shop' : '';
    const frame = special === 'boss' ? '#7a2a24' : special === 'treasure' ? '#c99a3a' : special === 'shop' ? '#3a8ab0' : '#5c6470';
    const glow = special === 'boss' ? '#ff4a3a' : special === 'treasure' ? '#ffd27a' : th.rune;
    ctx.save(); ctx.translate(ox + (d === 'w' ? WALL / 2 : d === 'e' ? RW - WALL / 2 : MCX), oy + (d === 'n' ? WALL / 2 : d === 's' ? RH - WALL / 2 : MCY));
    ctx.rotate(d === 'n' ? 0 : d === 's' ? Math.PI : d === 'w' ? -Math.PI / 2 : Math.PI / 2);
    ctx.fillStyle = '#0c0d10'; ctx.fillRect(-20, -16, 40, 32);
    ctx.fillStyle = frame; ctx.fillRect(-19, -16, 6, 32); ctx.fillRect(13, -16, 6, 32); ctx.fillRect(-19, -16, 38, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-19, -16, 38, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-13, -10, 1, 26); ctx.fillRect(12, -10, 1, 26);
    if (room.cleared) {
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
function drawHazard(h) {
  if (h.warn > 0) {
    const a = 0.35 + 0.35 * Math.sin(G.time * 20);
    ctx.fillStyle = `rgba(255,40,40,${0.12 + clamp(1 - h.warn, 0, 1) * 0.2})`; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,90,70,${a})`; ctx.lineWidth = 1.5; ctx.stroke();
  } else {
    const len = 14 * Math.min(1, (0.45 - h.t) * 12) * (0.4 + clamp(h.t / 0.45, 0, 1) * 0.6);
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.32, bx = h.x + (i - 3) * 4;
      ctx.strokeStyle = i % 2 ? '#3b2a3e' : '#2f4228'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, h.y + 4); ctx.lineTo(bx + Math.cos(a) * len, h.y + 4 + Math.sin(a) * len); ctx.stroke();
      ctx.fillStyle = '#d8c8b8'; ctx.fillRect(bx + Math.cos(a) * len - 1, h.y + 3 + Math.sin(a) * len, 2, 2);
    }
  }
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
    ctx.fillStyle = ped.kind === 'stat' ? '#ffd88a' : '#bff2ff'; ctx.font = '11px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(info.icon, x, iy + 1); ctx.textBaseline = 'alphabetic';
  }
  if (ped.price) {
    ctx.font = '700 9px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center';
    const can = G.player.crystals >= ped.price;
    if (IMG.c16) ctx.drawImage(IMG.c16, x - 12, y + 7, 9, 9);
    ctx.fillStyle = '#000'; ctx.fillText(ped.price, x + 4, y + 15); ctx.fillStyle = can ? '#bff2ff' : '#ff8a7a'; ctx.fillText(ped.price, x + 3, y + 14);
  }
}
function drawPedLabel(ped) {
  const name = ped.kind === 'heart' ? 'Heart' : (STAT_UPS[ped.id] || SKILL_INFO[ped.id]).name;
  ctx.font = '600 9px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(name).width + 10, y = ped.y - 40;
  const cx = clamp(ped.x, WALL + w / 2, RW - WALL - w / 2);
  ctx.fillStyle = 'rgba(8,9,14,0.8)'; ctx.fillRect(cx - w / 2, y - 9, w, 13);
  ctx.fillStyle = '#e8d6a8'; ctx.fillText(name, cx, y);
}
function drawPickup(k) {
  const bob = k.z + (k.vz ? 0 : Math.sin(G.time * 4 + k.x) * 1.2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(k.x, k.y + 3, 5, 2, 0, 0, TAU); ctx.fill();
  if (k.type === 'crystal' || k.type === 'bigcrystal') {
    const s = k.type === 'bigcrystal' ? 18 : 11;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(GLOW.cyan, k.x - s, k.y - s / 2 - bob - s / 2, s * 2, s * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (IMG.c16) ctx.drawImage(s > 12 ? IMG.c32 : IMG.c16, k.x - s / 2, k.y - s - bob + 2, s, s);
  } else {
    ctx.drawImage(k.type === 'heart' ? HEARTS.full : HEARTS.half, k.x - 5, k.y - 9 - bob, 10, 9);
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
  } else if (b.kind === 'shard') {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = '#3a0810'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(0, -4); ctx.lineTo(-6, 0); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5a6a'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(0, -3); ctx.lineTo(-5, 0); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd0d6'; ctx.fillRect(0, -1, 3, 1); ctx.restore();
  } else {
    ctx.fillStyle = b.kind === 'orb' ? '#2a6a66' : '#5a2a7a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 0.8, 0, TAU); ctx.fill();
    ctx.fillStyle = bulletColor(b); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 1, b.y - 2, 2, 2);
  }
}
function drawPlayer() {
  const p = G.player, S = G.sheet;
  if (p.hp <= 0 && !G.dying) return;
  if (p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0 && !G.dying) return;
  const moving = hyp(p.vx, p.vy) > 8;
  // the casting pose only shows when standing still, so the legs keep walking while shooting
  // only the wizard has a casting pose; sword-and-shield heroes keep their stance when shooting
  const cast = p.castT > 0 && !moving && p.face !== 'up' && S.kind === 'wizard';
  const [name, mirror] = poseFrame(S, p.face, p.flip, p.anim, moving, cast ? 2 : 0);
  const [bob, tilt] = stepMotion(p.anim, moving, S.kind);
  ctx.save();
  if (G.dying) ctx.globalAlpha = clamp(G.dying / 1.4, 0, 1);
  drawFrame(S, name, p.x, p.y + p.r * 0.6 + bob, mirror, 0, tilt);
  ctx.restore();
}
function drawEnemy(e) {
  const S = e.sheet; if (!S) return;
  const moving = e.d.flying || hyp(e.vx, e.vy) > 8;
  const [name, mirror] = poseFrame(S, e.face, e.flip, e.anim, moving, e.pose);
  const [bob, tilt] = e.d.flying || e.pose ? [0, 0] : stepMotion(e.anim, moving, S.kind);
  const fy = e.y + e.r * 0.6 + (e.d.flying ? Math.sin(G.time * 3 + e.phase) * 2 - 3 : bob);
  ctx.save();
  ctx.globalAlpha = (e.d.alpha || 1) * e.alpha;
  drawFrame(S, name, e.x, fy, mirror, e.flash > 0 ? 0.85 : 0, tilt);
  ctx.restore();
  const top = fy - (S.cell - S.foot) * S.ds * 0.8;
  if (e.slow > 0) { ctx.fillStyle = 'rgba(160,220,255,0.9)'; ctx.beginPath(); ctx.arc(e.x, top + 4, 1.5, 0, TAU); ctx.fill(); }
  if (e.state === 'windup' || e.state === 'slamwind') { ctx.fillStyle = '#ff5a3a'; ctx.font = '700 11px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', e.x, top); }
}
// The Thornheart: a giant heart bound in thorns and chains (drawn in code, no sprite sheet)
function drawThornheart(e) {
  const ph = e.ph || 1, cx = e.x, cy = e.y - 16;
  const beat = 1 + 0.07 * Math.max(0, Math.sin(G.time * (ph === 3 ? 9 : 5)));
  const a = e.alpha;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * a; ctx.drawImage(GLOW.red, cx - 44, cy - 44, 88, 88);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
  if (ph === 1) { // chains to the walls
    ctx.strokeStyle = '#6a6f7c'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    for (const [tx, ty] of [[WALL + 6, WALL + 6], [RW - WALL - 6, WALL + 6], [WALL + 6, MCY - 40], [RW - WALL - 6, MCY - 40]]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  ctx.lineCap = 'round';
  const vines = 7, spin = G.time * (ph === 3 ? 1.6 : 0.6);
  for (let i = 0; i < vines; i++) {
    const ang = spin + i * TAU / vines, r0 = 14, r1 = 30 + ph * 4 + Math.sin(G.time * 3 + i) * 3;
    const sx = cx + Math.cos(ang) * r0, sy = cy + Math.sin(ang) * r0 * 0.9, ex = cx + Math.cos(ang + 0.5) * r1, ey = cy + Math.sin(ang + 0.5) * r1 * 0.9;
    ctx.strokeStyle = i % 2 ? '#3b2a3e' : '#2f4228'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx + Math.cos(ang + 0.2) * r1 * 0.8, cy + Math.sin(ang + 0.2) * r1 * 0.8, ex, ey); ctx.stroke();
    ctx.fillStyle = '#d8c8b8'; ctx.fillRect(ex - 1, ey - 1, 2, 2);
  }
  const w = 58 * beat, h = 58 * beat;
  ctx.drawImage(HEARTS.boss, cx - w / 2, cy - h / 2, w, h);
  if (e.flash > 0 || e.state === 'shift') { ctx.globalAlpha = (e.state === 'shift' ? 0.4 + 0.4 * Math.sin(G.time * 30) : 0.8) * a; ctx.drawImage(HEARTS.bossWhite, cx - w / 2, cy - h / 2, w, h); ctx.globalAlpha = a; }
  ctx.strokeStyle = '#1e2a18'; ctx.lineWidth = 2;
  for (const off of [-6, 4]) { ctx.beginPath(); ctx.moveTo(cx - w / 2 + 3, cy + off - 3); ctx.quadraticCurveTo(cx, cy + off + 5, cx + w / 2 - 3, cy + off - 3); ctx.stroke(); }
  const eye = ph === 1 ? '#5ad6ff' : ph === 2 ? '#ffd27a' : '#ff4a3a';
  ctx.fillStyle = '#100306'; ctx.fillRect(cx - 5, cy - 6, 10, 7);
  ctx.fillStyle = eye; ctx.shadowColor = eye; ctx.shadowBlur = 10; ctx.fillRect(cx - 3, cy - 4, 6, 3); ctx.shadowBlur = 0;
  ctx.restore();
}

// ---- HUD
function drawHud() {
  const p = G.player;
  const g = ctx.createLinearGradient(0, 0, 0, HUD); g.addColorStop(0, '#15171d'); g.addColorStop(1, '#0b0c10');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, HUD);
  ctx.fillStyle = '#2a2e38'; ctx.fillRect(0, HUD - 2, VW, 2);
  const hearts = Math.min(16, p.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const hx = 8 + (i % 8) * 11, hy = 5 + Math.floor(i / 8) * 10;
    const v = p.hp - i * 2; ctx.drawImage(v >= 2 ? HEARTS.full : v === 1 ? HEARTS.half : HEARTS.empty, hx - 0.5, hy - 1, 10, 10);
  }
  const need = xpNeed(p.level), fill = clamp(p.xp / need, 0, 1);
  ctx.fillStyle = '#05060a'; ctx.fillRect(8, 29, 78, 5);
  ctx.fillStyle = '#2b6fa0'; ctx.fillRect(9, 30, 76 * fill, 3); ctx.fillStyle = '#7fdcff'; ctx.fillRect(9, 30, 76 * fill, 1);
  ctx.font = '700 9px "Alegreya Sans", sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#7fdcff'; ctx.fillText(`LV ${p.level}`, 90, 35);
  if (IMG.c16) ctx.drawImage(IMG.c16, 116, 6, 13, 13);
  ctx.font = '700 11px "Alegreya Sans", sans-serif'; ctx.fillStyle = '#e9e4d8'; ctx.fillText(p.crystals, 132, 17);
  if (p.revive) { ctx.fillStyle = '#ffd27a'; ctx.font = '700 9px "Alegreya Sans", sans-serif'; ctx.fillText('✦', 118, 35); }
  ctx.textAlign = 'center';
  ctx.font = '600 9px "Alegreya Sans", sans-serif'; ctx.fillStyle = G.floor === FINAL_FLOOR ? '#ff8a7a' : '#a9a3b8'; ctx.fillText(`FLOOR ${G.floor}/${FINAL_FLOOR}`, 205, 16);
  ctx.font = '600 8px "Alegreya Sans", sans-serif'; ctx.fillStyle = '#6b6878'; ctx.fillText(theme().name.toUpperCase(), 205, 30);
  if (G.asc) { ctx.fillStyle = '#ff9a7a'; ctx.font = '700 9px "Alegreya Sans", sans-serif'; ctx.fillText(`A${G.asc}`, 140, 35); }
  ctx.fillStyle = '#20232c'; ctx.fillRect(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h);
  ctx.fillStyle = '#a9a3b8'; ctx.fillRect(PAUSE_BTN.x + 6, PAUSE_BTN.y + 5, 3, 10); ctx.fillRect(PAUSE_BTN.x + 11, PAUSE_BTN.y + 5, 3, 10);
  drawMinimap();
}
function drawMinimap() {
  const cw = 6, ch = 4, ox = VW - GRID_W * cw - 6, oy = 3;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ox - 2, oy - 1, GRID_W * cw + 3, GRID_H * ch + 2);
  for (const r of G.map.values()) {
    if (!r.visited && !r.seen) continue;
    const x = ox + r.gx * cw, y = oy + r.gy * ch;
    ctx.fillStyle = r === G.room ? '#f2ecd8' : r.visited ? '#6a6f7c' : '#2e313a'; ctx.fillRect(x, y, cw - 1, ch - 1);
    const ic = r.type === 'boss' ? '#ff4a3a' : r.type === 'treasure' ? '#ffd27a' : r.type === 'shop' ? '#5ad6ff' : null;
    if (ic && r !== G.room) { ctx.fillStyle = ic; ctx.fillRect(x + 1, y + 1, 3, 1); }
  }
}
function drawBossBar() {
  let hp = 0, max = 0; for (const e of G.bosses) { hp += Math.max(0, e.hp); max += e.maxHp; }
  const w = 220, x = (VW - w) / 2, y = VH - 16;
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 3, y - 11, w + 6, 20);
  ctx.font = '600 8px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8b65a'; ctx.fillText(G.bossName.toUpperCase(), VW / 2, y - 3);
  ctx.fillStyle = '#2a0a0a'; ctx.fillRect(x, y, w, 5);
  const f = clamp(hp / max, 0, 1);
  ctx.fillStyle = '#c2302a'; ctx.fillRect(x, y, w * f, 5); ctx.fillStyle = '#ff7a6a'; ctx.fillRect(x, y, w * f, 1);
  if (G.bosses.some((e) => e.d.custom)) { ctx.fillStyle = '#000'; for (const t of [1 / 3, 2 / 3]) ctx.fillRect(x + w * t, y, 1, 5); }
}
function drawBanner(b) {
  const inT = 0.3, outT = 0.5; const a = b.t < inT ? b.t / inT : b.t > b.dur - outT ? (b.dur - b.t) / outT : 1;
  const y = HUD + 76;
  ctx.globalAlpha = clamp(a, 0, 1);
  const g = ctx.createLinearGradient(0, 0, VW, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y - 22, VW, 40);
  ctx.textAlign = 'center'; ctx.font = '700 17px "Cinzel", serif';
  ctx.fillStyle = '#000'; ctx.fillText(b.title, VW / 2 + 1, y + 1); ctx.fillStyle = b.boss ? '#ff7a5a' : '#e8b65a'; ctx.fillText(b.title, VW / 2, y);
  ctx.font = '600 9px "Alegreya Sans", sans-serif'; ctx.fillStyle = '#b8b2c4'; ctx.fillText(b.sub, VW / 2, y + 12);
  ctx.globalAlpha = 1;
}
function drawToast(t) {
  const a = t.t < 0.25 ? t.t / 0.25 : t.t > 2.6 ? (3 - t.t) / 0.4 : 1;
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.font = '700 10px "Alegreya Sans", sans-serif'; const w1 = ctx.measureText('★ ' + t.text).width;
  ctx.font = '600 8px "Alegreya Sans", sans-serif'; const w2 = ctx.measureText(t.sub).width;
  const w = Math.min(VW - 16, Math.max(w1, w2) + 20), x = (VW - w) / 2, y = HUD + 8;
  ctx.fillStyle = 'rgba(20,14,6,0.92)'; ctx.fillRect(x, y, w, 30); ctx.strokeStyle = '#a8803c'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 29);
  ctx.textAlign = 'center'; ctx.fillStyle = '#e8b65a'; ctx.font = '700 10px "Alegreya Sans", sans-serif'; ctx.fillText('★ ' + t.text, VW / 2, y + 13);
  ctx.fillStyle = '#7fdcff'; ctx.font = '600 8px "Alegreya Sans", sans-serif'; ctx.fillText(t.sub, VW / 2, y + 24);
  ctx.globalAlpha = 1;
}

// ===================================================================== screens
const OVERLAYS = ['title', 'dead', 'pause', 'levelup', 'shrine', 'feats'];
function show(id) { for (const o of OVERLAYS) $(o).classList.toggle('hidden', o !== id); $('touchHint').style.visibility = id ? 'hidden' : ''; }
function startGame() {
  if (!charUnlocked(SAVE.char)) return;
  SFX.init(); newRun(SAVE.char); mode = 'play'; clearSticks();
  show(null);
}
function pauseGame() {
  if (mode !== 'play') return;
  mode = 'pause'; clearSticks(); keys.clear(); input.mouseDown = false;
  const p = G.player;
  const rows = [['Character', CHARS[p.charId].name], ...statRows(p)];
  if (G.asc) rows.push(['Ascension', G.asc]);
  if (p.revive) rows.push(['Second Wind', 'ready']);
  $('pauseStats').innerHTML = rows.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('');
  const owned = Object.entries(p.skills).map(([id, l]) => `${SKILL_INFO[id].name}${l > 1 ? ' Lv' + l : ''}`);
  $('pauseSkills').textContent = owned.length ? owned.join(' · ') : 'No skills yet';
  show('pause');
  $('btnResume').focus();
}
function resumeGame() { mode = 'play'; show(null); last = performance.now(); }
function toggleSound() { SFX.on = !SFX.on; store('thornbound_sound', SFX.on ? 'on' : 'off'); $('btnSound').textContent = `SOUND: ${SFX.on ? 'ON' : 'OFF'}`; }
function statRows(p) {
  return [['Damage', fmt(p.dmg)], ['Fire rate', fmt(1 / p.fireDelay) + '/s'], ['Speed', fmt(p.speed / 100, 2)], ['Range', fmt(p.range / 32)], ['Luck', p.luck], ['Level', p.level]];
}
function endRun(won) {
  if (G.ended) return;
  G.ended = true; G.endShown = true;
  mode = 'dead'; clearSticks();
  const p = G.player, t = Math.floor(G.time);
  // bank the haul
  const parts = [['Crystals carried', p.crystals], ['Foes slain', Math.floor(G.kills / 2)], ['Depth reached', (G.floor - 1) * 10], ['Guardians', G.bossesKilled * 15]];
  if (won) parts.push(['Victory', 60]);
  const base = parts.reduce((s, [, v]) => s + v, 0), mult = 1 + 0.25 * G.asc, total = Math.round(base * mult);
  SAVE.bank += total;
  const st = SAVE.stats; st.runs++; st.kills += G.kills; st.best = Math.max(st.best, G.floor);
  if (won) { st.wins++; if (!st.bestTime || t < st.bestTime) st.bestTime = t; if (G.asc >= SAVE.ascMax && SAVE.ascMax < 5) SAVE.ascMax = G.asc + 1; }
  persist();
  $('endTitle').textContent = won ? 'UNBOUND' : 'YOU HAVE FALLEN';
  $('endTitle').style.color = won ? 'var(--rune)' : '';
  $('endSub').textContent = won ? `The Thornheart is destroyed.${G.asc ? ' Ascension ' + G.asc + ' cleared.' : ''}${SAVE.ascMax > G.asc ? ' A harder Ascension is now open.' : ''}` : `Floor ${G.floor} · ${theme().name}`;
  $('endStats').innerHTML = [['Character', CHARS[p.charId].name], ['Floor', `${G.floor} / ${FINAL_FLOOR}`], ['Level', p.level], ['Foes slain', G.kills], ['Time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`]]
    .map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('');
  $('endBank').innerHTML = parts.map(([k, v]) => `<span>${esc(k)}</span><span>+${v}</span>`).join('')
    + (mult > 1 ? `<span>Ascension bonus</span><span>×${mult}</span>` : '')
    + `<span class="total">Banked at the Shrine</span><span class="total">+${total}</span>`;
  $('endFeats').innerHTML = G.newFeats.map((id) => `<div>★ ${esc(FEATS[id].name)}<small>${esc(FEATS[id].reward)}</small></div>`).join('');
  show('dead'); $('btnRetry').focus();
}
function showTitle() {
  mode = 'title';
  if (!charUnlocked(SAVE.char)) SAVE.char = 'wanderer';
  SAVE.asc = clamp(SAVE.asc, 0, SAVE.ascMax);
  renderTitle();
  show('title');
}
function renderTitle() {
  const st = SAVE.stats;
  $('bestLine').textContent = st.runs ? `${st.runs} run${st.runs > 1 ? 's' : ''} · deepest floor ${st.best}${st.wins ? ` · ${st.wins} win${st.wins > 1 ? 's' : ''}` : ''}` : 'Four floors. A heart of thorns waits at the bottom.';
  $('bankTitle').textContent = SAVE.bank;
  const got = Object.keys(FEATS).filter((k) => SAVE.feats[k]).length;
  $('featCount').textContent = `${got}/${Object.keys(FEATS).length}`;
  const c = CHARS[SAVE.char], ok = charUnlocked(SAVE.char);
  $('charCard').classList.toggle('locked', !ok);
  $('charName').textContent = ok ? c.name : `${c.name} (locked)`;
  $('charDesc').textContent = ok ? c.desc : `${FEATS[c.lock].desc} to unlock.`;
  drawPortrait($('charPortrait'), CHAR_SHEETS[SAVE.char]);
  $('btnStart').disabled = !ok;
  $('ascRow').hidden = SAVE.ascMax < 1;
  $('ascVal').textContent = SAVE.asc;
}
function cycleChar(d) {
  const ids = Object.keys(CHARS); SAVE.char = ids[(ids.indexOf(SAVE.char) + d + ids.length) % ids.length];
  persist(); SFX.play('select'); renderTitle();
  if (charUnlocked(SAVE.char)) demoRoom();
}
function openShrine() { mode = 'menu'; renderShrine(); show('shrine'); }
function renderShrine() {
  $('bankShrine').textContent = SAVE.bank;
  const list = $('shrineList'); list.innerHTML = '';
  for (const m of META) {
    const r = upRank(m.id), max = m.costs.length, cost = m.costs[r];
    const row = document.createElement('div'); row.className = 'item';
    row.innerHTML = `<div><div class="nm">${esc(m.name)} <span class="pips">${'●'.repeat(r)}${'○'.repeat(max - r)}</span></div><div class="ds">${esc(m.desc)}</div></div>`;
    const b = document.createElement('button'); b.className = 'buy' + (r >= max ? ' max' : ''); b.id = 'buy-' + m.id;
    if (r >= max) { b.textContent = 'MAX'; b.disabled = true; }
    else { b.innerHTML = `<img src="assets/crystal32.webp" alt="">${cost}`; b.disabled = SAVE.bank < cost; b.setAttribute('aria-label', `Buy ${m.name} for ${cost} crystals`);
      b.onclick = () => { if (SAVE.bank < cost) return; SAVE.bank -= cost; SAVE.up[m.id] = r + 1; persist(); SFX.init(); SFX.play('buy'); renderShrine(); }; }
    row.appendChild(b); list.appendChild(row);
  }
}
function openFeats() {
  mode = 'menu';
  const st = SAVE.stats;
  $('lifetime').textContent = `Runs ${st.runs} · Foes slain ${st.kills} · Wins ${st.wins}${st.bestTime ? ` · Fastest win ${Math.floor(st.bestTime / 60)}:${String(st.bestTime % 60).padStart(2, '0')}` : ''}`;
  $('featList').innerHTML = Object.entries(FEATS).map(([id, f]) => {
    const done = !!SAVE.feats[id];
    return `<div class="item ${done ? 'done' : 'locked'}"><div><div class="nm">${esc(f.name)}</div><div class="ds">${esc(f.desc)}</div><div class="rw">${esc(f.reward)}</div></div><div class="badge">${done ? '★' : '☆'}</div></div>`;
  }).join('');
  show('feats');
}
function closeMenus() { if (G && G.ended && G.endShown) { mode = 'dead'; show('dead'); } else showTitle(); }

// ---- level-up panel (on the supplied frame art)
let LV = null;
function openLevelUp() {
  mode = 'levelup'; clearSticks(); keys.clear(); input.mouseDown = false;
  G.pendingLv--;
  SFX.play('levelup');
  LV = { choices: rollChoices(3), sel: 0, rerollCost: 3 };
  renderLevelUp();
  show('levelup');
}
function renderLevelUp() {
  const p = G.player;
  $('lvNum').textContent = `LEVEL ${p.level}`;
  const u = upgradeFor(LV.choices[LV.sel]);
  const diffs = new Map(u.diff.map(([k, , b]) => [k, b]));
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
  drawPortrait($('lvPortrait'), G.sheet, true);
}
// a character's front-facing frame, filling a portrait canvas
function drawPortrait(pc, S, glow) {
  const x = pc.getContext('2d'), W = pc.width, H = pc.height, c = S.cell, i = FRAME.down0;
  x.clearRect(0, 0, W, H);
  if (glow) { const g = x.createRadialGradient(W / 2, H * 0.55, 4, W / 2, H * 0.55, W * 0.6); g.addColorStop(0, 'rgba(79,195,255,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  const k = Math.min(W / (c * 0.6), H / (c * 0.8)), w = c * k;
  x.drawImage(S.img, (i % ATLAS.cols) * c, Math.floor(i / ATLAS.cols) * c, c, c, (W - w) / 2, H - w + ATLAS.foot * k * 0.44, w, w);
}
function lvKey(k) {
  if (!LV) return;
  const n = LV.choices.length;
  if (k === 'arrowleft' || k === 'a') { LV.sel = (LV.sel + n - 1) % n; SFX.play('select'); renderLevelUp(); }
  else if (k === 'arrowright' || k === 'd') { LV.sel = (LV.sel + 1) % n; SFX.play('select'); renderLevelUp(); }
  else if (['1', '2', '3'].includes(k) && +k <= n) { LV.sel = +k - 1; SFX.play('select'); renderLevelUp(); }
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
  LV = null; show(null);
  if (G.pendingLv > 0) G.lvDelay = 0.2;
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
$('btnQuit').onclick = () => { G.dying = 0; endRun(false); };
$('charPrev').onclick = () => cycleChar(-1);
$('charNext').onclick = () => cycleChar(1);
$('ascPrev').onclick = () => { SAVE.asc = Math.max(0, SAVE.asc - 1); persist(); SFX.play('select'); renderTitle(); };
$('ascNext').onclick = () => { SAVE.asc = Math.min(SAVE.ascMax, SAVE.asc + 1); persist(); SFX.play('select'); renderTitle(); };
$('btnShrine').onclick = openShrine;
$('btnEndShrine').onclick = openShrine;
$('btnFeats').onclick = openFeats;
$('btnShrineBack').onclick = closeMenus;
$('btnFeatsBack').onclick = closeMenus;
$('btnEndTitle').onclick = () => { demoRoom(); showTitle(); };

// ===================================================================== main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode === 'play' && G) update(dt);
  else if (G && mode !== 'pause' && mode !== 'levelup') G.time += dt;
  render();
  requestAnimationFrame(frame);
}
// a quiet room behind the title screen
function demoRoom() { newRun(charUnlocked(SAVE.char) ? SAVE.char : 'wanderer'); G.banner = null; G.ended = true; }

async function boot() {
  await Promise.all([
    loadImg('goblin', 'assets/goblin@0.44.webp'), loadImg('goblinBig', 'assets/goblin@0.8.webp'),
    loadImg('ghost', 'assets/ghost@0.44.webp'), loadImg('ghostBig', 'assets/ghost@0.8.webp'),
    loadImg('wizard', 'assets/wizard@0.44.webp'), loadImg('knight', 'assets/knight@0.44.webp'), loadImg('skeleton', 'assets/skeleton@0.44.webp'),
    loadImg('c16', 'assets/crystal32.webp'), loadImg('c32', 'assets/crystal64.webp'), loadImg('floor', 'assets/floor.jpg'),
  ]);
  try { await Promise.all(['700 12px "Cinzel"', '400 12px "Alegreya Sans"', '700 12px "Alegreya Sans"'].map((f) => document.fonts.load(f))); } catch (e) {}
  const BOSS = 0.42; // bosses draw larger
  SHEETS.goblin = makeSheet('goblin', 0.44, IMG.goblin);
  SHEETS.goblinP = makeSheet('goblin', 0.44, variant(IMG.goblin, 175, 0.9, 0.95));
  SHEETS.goblinB = makeSheet('goblin', 0.8, variant(IMG.goblinBig, -75, 1.15, 0.95), BOSS);
  SHEETS.skeleton = makeSheet('skeleton', 0.44, IMG.skeleton);
  SHEETS.ghost = makeSheet('ghost', 0.44, IMG.ghost);
  SHEETS.ghostW = makeSheet('ghost', 0.44, variant(IMG.ghost, 85, 1.3, 0.9));
  SHEETS.ghostB = makeSheet('ghost', 0.8, variant(IMG.ghostBig, 140, 1.4, 1), BOSS);
  GLOW.cyan = glowSprite(16, 'rgba(90,200,255,0.9)'); GLOW.teal = glowSprite(16, 'rgba(110,240,210,0.8)'); GLOW.violet = glowSprite(16, 'rgba(200,110,255,0.85)');
  GLOW.green = glowSprite(16, 'rgba(140,220,90,0.7)'); GLOW.red = glowSprite(16, 'rgba(255,80,90,0.8)'); GLOW.gold = glowSprite(16, 'rgba(255,200,100,0.8)');
  for (const id in CHARS) { const c = CHARS[id], img = IMG[c.sheet]; CHAR_SHEETS[id] = makeSheet(c.sheet, 0.44, c.tint ? variant(img, ...c.tint) : img); }
  buildHearts();
  demoRoom(); showTitle();
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
}
boot();

// test hook for automated checks
window.__thornbound = { get G() { return G; }, get mode() { return mode; }, SAVE, startGame, gainXp: (n) => gainXp(n),
  goto: (type) => { const r = [...G.map.values()].find((q) => q.type === type); enterRoom(r, null); }, upgrade: applyUpgrade,
  setFloor: (f) => { G.floor = f; genFloor(); enterRoom(G.start, null); }, layouts: LAYOUTS };
})();
