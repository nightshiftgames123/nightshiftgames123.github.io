#!/usr/bin/env node
// Checks SafePlate's recipe and swap data for mistakes that would break a recipe page
// or hide an allergen. Run with:  node tools/check-safeplate.js
// It runs automatically on GitHub for every change to safeplate/ (see .github/workflows).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'safeplate');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

function block(name, open, close) {
  const start = html.indexOf('var ' + name + ' = ' + open);
  if (start === -1) throw new Error('Could not find ' + name + ' in index.html');
  const from = html.indexOf(open, start);
  const end = html.indexOf('\n  ' + close + ';', from);
  return html.slice(from, end + 3 + close.length);
}
global.window = {};
require(path.join(dir, 'recipes-more.js'));
const ALLERGENS = ['milk', 'egg', 'peanut', 'treenut', 'soy', 'wheat', 'fish', 'shellfish', 'sesame'];
global.SRC = eval('(' + block('SRC', '{', '}') + ')');
const TESTED = eval('(' + block('TESTED', '{', '}') + ')');
const LIB = eval('(' + block('LIB', '{', '}') + ')');
const builtIn = eval(html.slice(html.indexOf('var RECIPES = [') + 14, html.indexOf('].concat(window.MORE_RECIPES') + 1));
const RECIPES = builtIn.concat(window.MORE_RECIPES);

const errors = [];
const okUrl = (s) => s && typeof s.n === 'string' && s.n && /^https:\/\//.test(s.u || '');
const okAllergens = (list) => Array.isArray(list) && list.every((a) => ALLERGENS.includes(a));

// Swap library
for (const [id, lib] of Object.entries(LIB)) {
  const p = 'library "' + id + '": ';
  if (!okAllergens(lib.a)) errors.push(p + 'unknown allergen in a');
  if (lib.m && !okAllergens(lib.m)) errors.push(p + 'unknown allergen in m');
  if (!lib.ar || !lib.ar.n || !lib.ar.s) errors.push(p + 'missing Arabic name');
  (lib.swaps || []).forEach((o) => {
    const q = p + 'swap "' + o.n + '": ';
    if (!okAllergens(o.a)) errors.push(q + 'unknown allergen');
    if (!o.ar || !o.ar.n || !o.ar.s) errors.push(q + 'missing Arabic name');
    if (!!o.tip !== !!(o.ar && o.ar.tip)) errors.push(q + 'tip missing in one language');
    if (o.src && !(Array.isArray(o.src) && o.src.length && o.src.every(okUrl))) errors.push(q + 'bad source link');
    // A swap must remove at least one of the allergens it replaces, or it is pointless.
    if (lib.a.length && lib.a.every((a) => o.a.includes(a))) errors.push(q + 'still contains every allergen it replaces');
  });
}

// Recipes
const seen = new Set();
for (const r of RECIPES) {
  const p = 'recipe "' + r.id + '": ';
  if (seen.has(r.id)) errors.push(p + 'duplicate id');
  seen.add(r.id);
  if (!r.src || !r.src.length || !r.src.every(okUrl)) errors.push(p + 'missing or bad source link');
  if (!r.ar || !r.ar.t || !r.ar.time || !r.ar.serves) errors.push(p + 'missing Arabic title, time or servings');
  const used = new Set();
  r.ing.forEach((i) => {
    if (i.length !== 5) errors.push(p + 'ingredient "' + i[1] + '" should have 5 parts');
    if (i[2]) { used.add(i[2]); if (!LIB[i[2]]) errors.push(p + 'unknown library id "' + i[2] + '"'); }
  });
  if (!r.ar.steps || r.steps.length !== r.ar.steps.length) errors.push(p + 'English and Arabic step counts differ');
  for (const [lg, steps] of [['English', r.steps], ['Arabic', (r.ar && r.ar.steps) || []]]) {
    const text = steps.join(' ');
    (text.match(/\{(\w+)\}/g) || []).forEach((tok) => {
      const id = tok.slice(1, -1);
      if (!LIB[id]) errors.push(p + lg + ' steps use unknown {' + id + '}');
      else if (!used.has(id)) errors.push(p + lg + ' steps use {' + id + '} but no ingredient is linked to it');
    });
    if (/بـ\{/.test(text)) errors.push(p + 'Arabic step joins بـ to a {token}, which reads badly once filled in');
    // Every swappable ingredient must appear in the steps, so the swap shows where it is used.
    used.forEach((id) => {
      if (LIB[id] && LIB[id].swaps.length && !text.includes('{' + id + '}')) errors.push(p + lg + ' steps never mention {' + id + '}');
    });
  }
  const en = Object.keys(r.notes || {}).sort().join(), ar = Object.keys((r.ar && r.ar.notes) || {}).sort().join();
  if (en !== ar) errors.push(p + 'notes differ between English and Arabic');
  if (!okAllergens(Object.keys(r.notes || {}))) errors.push(p + 'note for an unknown allergen');
}

// Tested allergy-free versions
for (const [id, list] of Object.entries(TESTED)) {
  if (!seen.has(id)) errors.push('tested version for unknown recipe "' + id + '"');
  list.forEach((v) => { if (!okAllergens(v.a) || !okUrl(v.s)) errors.push('tested version for "' + id + '" has a bad allergen or link'); });
}

// Service worker must cache the recipe file
const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
if (!sw.includes('./recipes-more.js')) errors.push('sw.js does not cache recipes-more.js');

const swaps = Object.values(LIB).reduce((n, l) => n + l.swaps.length, 0);
console.log(RECIPES.length + ' recipes, ' + Object.keys(LIB).length + ' library ingredients, ' + swaps + ' swaps checked.');
if (errors.length) {
  console.error('\n' + errors.length + ' problem(s):\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('All checks passed.');
