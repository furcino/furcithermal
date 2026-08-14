/* Least-cost search for heating an A1 family house in Bratislava.

   Drives the physics model out of index.html across the design space
   (collector type and area, store concept and volume, backup source, PV size),
   costs every design over its life, and ranks by total annualised cost.
   Reproduces the tables in REPORT.md.   Run:  node tools/optimise.mjs        */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const model = script.match(/\/\* =+ MODEL START =+ \*\/([\s\S]*?)\/\* =+ MODEL END =+ \*\//)[1];
const ctx = vm.createContext({ Math, console, Array, Object, JSON });
vm.runInContext(model + `
const _calRaw = calibrateUA, _memo = {};
calibrateUA = function (c, w) { const k = c.houseClass+'|'+c.floorArea+'|'+c.occupants;
  if (!(k in _memo)) _memo[k] = _calRaw(c, w); return _memo[k]; };
globalThis.API = { simulate, makeWeather, COLLECTORS, STORAGES, transpose, SITE, D2R, monthOfDay, MONTH_LEN };
`, ctx);
const { simulate, makeWeather, COLLECTORS, STORAGES, transpose, SITE, D2R } = ctx.API;
const W = makeWeather();

/* -------- corrected installed store costs (€), Slovak market 2026 --------
   A 300–500 L domestic cylinder is a different product from a seasonal buffer;
   the single curve used in the global sweep overpriced the small end.        */
const STORE_COST = {
  tankIn:  v => 900 + 950 * Math.pow(v, 0.80),
  tankBur: v => 9000 + 620 * Math.pow(v, 0.80),
  ptesW:   v => 25000 + 230 * Math.pow(v, 0.72),
  ptesG:   v => 22000 + 260 * Math.pow(v, 0.72),
  sand:    v => 7000 + 320 * Math.pow(v, 0.75),
  btes:    v => 15000 + 60 * Math.pow(v, 0.72),
  pcm:     v => 4000 + 4200 * Math.pow(v, 0.80),
};

const ECON = {
  rate: 0.04, gas: 0.085, elec: 0.210, elecHP: 0.170, export: 0.05,
  baseLoad: 3500,                       // household electricity excluding heating, kWh/a
  pvCost: 1200, pvYieldPerKw: null,     // €/kWp installed; yield computed below
  life: { coll: 25, store: 40, storeGround: 30, loop: 15, gas: 20, el: 20, hp: 18, pv: 25 },
  capex: { solarLoop: 2000, gas: 4500, el: 1800, hp: 13000, none: 0 },
  om: { solar: 120, gas: 160, el: 40, hp: 200, none: 0, storePct: 0.004, pv: 40 },
};
const crf = (n, i) => i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1);

// PV yield for Bratislava from the same transposition model, 35° south
{
  let h = 0;
  W.forEach((x, d) => h += transpose(x.ghi, d, SITE.lat * D2R, 35 * D2R, x.snow > 2 ? 0.6 : 0.2));
  ECON.pvYieldPerKw = 5.5 * 0.182 * h * 0.84;   // 5.5 m²/kWp, 18.2 % modules, PR 0.84
  console.log('PV yield at 35° south: ' + ECON.pvYieldPerKw.toFixed(0) + ' kWh/kWp·a  (plane ' + h.toFixed(0) + ' kWh/m²·a)\n');
}

const HOUSE = { houseClass: 'A1', floorArea: 150, occupants: 4, exchangerKW: 15, weather: W };
const PV_SIZES = [0, 3, 5, 7, 10];

function physics(cfg) {
  const a = simulate(Object.assign({}, HOUSE, cfg)).acc;
  return { cfg, sf: a.solarFraction, cold: a.cold, coverage: a.coverage, deliver: a.deliver,
    col: a.col, stag: a.stag, loss: a.loss, credit: a.credit, backup: a.backup, elec: a.elec,
    pv: a.pv, sh: a.sh, dhw: a.dhw, tMin: a.tMin, tMax: a.tMax, spec: a.specDemand,
    UAh: a.UAh, capacity: a.capacity, UAst: a.UAst, Aenv: a.Aenv, yieldPerM2: a.yieldPerM2 };
}

function cost(p, E, pvKw) {
  const cfg = p.cfg, col = COLLECTORS[cfg.collector], st = STORAGES[cfg.storage];
  const hasSolar = cfg.collArea > 0.5;
  const capColl = hasSolar ? col.cost * cfg.collArea + E.capex.solarLoop : 0;
  const capStore = STORE_COST[cfg.storage](cfg.storeVolume);
  const capBk = E.capex[cfg.backup];
  const capPv = pvKw * E.pvCost;
  // Zelená domácnostiam vouchers: capped per technology and at 50 % of eligible cost
  const sub = E.subsidy
    ? Math.min(2300, 0.5 * capColl)
      + (cfg.backup === 'hp' ? Math.min(4370, 0.5 * capBk) : 0)
      + Math.min(4025, 0.5 * capPv, pvKw * 575)
    : 0;
  const storeLife = st.buried ? E.life.storeGround : E.life.store;

  const netFactor = (capColl + capStore + capBk + capPv) > 0
    ? 1 - sub / (capColl + capStore + capBk + capPv) : 1;
  const annCapex = netFactor * (capColl * crf(E.life.coll, E.rate)
    + capStore * crf(storeLife, E.rate)
    + capBk * crf(E.life[cfg.backup] || 20, E.rate)
    + capPv * crf(E.life.pv, E.rate))
    + (hasSolar ? 900 * crf(E.life.loop, E.rate) : 0);

  // grid electricity the dwelling needs, before PV
  const heatElec = cfg.backup === 'hp' ? p.elec : (cfg.backup === 'el' ? p.backup : 0);
  const elecPrice = cfg.backup === 'hp' ? E.elecHP : E.elec;
  const consumption = E.baseLoad + heatElec;

  const pvGen = pvKw * E.pvYieldPerKw + (col.pvEff ? p.pv : 0);
  let pvSaving = 0;
  if (pvGen > 0) {
    const ratio = pvGen / consumption;
    const scRate = Math.max(0.25, Math.min(0.75, 0.90 - 0.45 * ratio));
    const selfUse = Math.min(pvGen * scRate, consumption);
    pvSaving = selfUse * elecPrice + (pvGen - selfUse) * E.export;
  }

  let fuel = 0;
  if (cfg.backup === 'gas') fuel = (p.backup / 0.95) * E.gas;
  else fuel = heatElec * elecPrice;
  const gridBase = E.baseLoad * E.elec;      // the same for every design, kept for transparency

  const om = (hasSolar ? E.om.solar : 0) + E.om[cfg.backup] + E.om.storePct * capStore + (pvKw ? E.om.pv : 0);
  const tac = annCapex + fuel + om - pvSaving;
  return Object.assign({}, p, { tac, annCapex, fuel, om, pvSaving, pvKw, pvGen, gridBase, sub,
    capex: capColl + capStore + capBk + capPv, capColl, capStore, capBk, capPv,
    lcoh: tac / Math.max(1, p.deliver) });
}
const bestPv = (p, E, allow) => (allow ? PV_SIZES : [0]).map(k => cost(p, E, k))
  .sort((a, b) => a.tac - b.tac)[0];

/* ---------------- focused design space ---------------- */
const AREAS = [0, 3, 4, 6, 8, 10, 12, 15, 20, 30, 45, 60];
const VOLS = {
  tankIn: [0.3, 0.5, 1, 2, 4, 8, 15, 25, 40, 70, 120],
  tankBur: [10, 30, 80, 200], sand: [20, 50, 120, 300, 700],
  ptesG: [150, 500, 1500], ptesW: [150, 500, 1500], btes: [1000, 5000], pcm: [3, 10, 30],
};
const BACKUPS = ['gas', 'el', 'hp', 'none'];

const PHYS = [];
const t0 = Date.now();
for (const storage of Object.keys(VOLS))
  for (const storeVolume of VOLS[storage])
    for (const backup of BACKUPS)
      for (const collector of Object.keys(COLLECTORS))
        for (const collArea of AREAS) {
          if (collArea === 0 && collector !== 'flat') continue;
          PHYS.push(physics({ collector, collArea, tilt: 45, storage, storeVolume, backup }));
        }
console.log(PHYS.length + ' designs simulated in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');

const feas = PHYS.filter(p => p.cold === 0 && p.coverage > 0.999);
console.log(feas.length + ' meet comfort\n');

const line = r => {
  const c = r.cfg;
  return (c.collArea ? c.collector + ' ' + c.collArea + 'm²' : 'no solar').padEnd(17) +
    (c.storage + ' ' + c.storeVolume + 'm³').padEnd(19) + c.backup.padEnd(5) +
    (r.pvKw ? r.pvKw + 'kWp' : '   —  ').padEnd(7) +
    ('TAC ' + r.tac.toFixed(0)).padStart(10) +
    ('capex ' + (r.capex / 1000).toFixed(1) + 'k').padStart(14) +
    ('fuel ' + r.fuel.toFixed(0)).padStart(11) +
    ('SF ' + (r.sf * 100).toFixed(0) + '%').padStart(8) +
    ('LCOH ' + (r.lcoh * 100).toFixed(1)).padStart(11);
};
const rank = (arr, E, allowPv, n) => arr.map(p => bestPv(p, E, allowPv)).sort((a, b) => a.tac - b.tac).slice(0, n);

console.log('=== LEAST COST, NO PV ALLOWED ===');
rank(feas, ECON, false, 10).forEach(r => console.log(line(r)));

console.log('\n=== LEAST COST, PV ALLOWED ===');
rank(feas, ECON, true, 10).forEach(r => console.log(line(r)));

console.log('\n=== LEAST COST, NO FOSSIL FUEL (PV allowed) ===');
rank(feas.filter(p => p.cfg.backup !== 'gas'), ECON, true, 10).forEach(r => console.log(line(r)));

console.log('\n=== BEST SOLAR-THERMAL SYSTEM AT EACH SOLAR FRACTION ===');
for (const band of [[0.2,0.3],[0.3,0.4],[0.4,0.5],[0.5,0.6],[0.6,0.7],[0.7,0.8],[0.8,0.9],[0.9,1.01]]) {
  const s = feas.filter(p => p.sf >= band[0] && p.sf < band[1] && p.cfg.collArea > 0);
  if (s.length) console.log(('SF ' + (band[0]*100) + '–' + (band[1]*100) + '%').padEnd(12) + line(rank(s, ECON, true, 1)[0]));
}

console.log('\n=== BEST PER STORAGE CONCEPT (PV allowed) ===');
for (const st of Object.keys(VOLS)) {
  const s = feas.filter(p => p.cfg.storage === st && p.cfg.collArea > 0);
  if (s.length) console.log(st.padEnd(9) + line(rank(s, ECON, true, 1)[0]));
}

console.log('\n=== REFERENCE POINTS (no PV) ===');
const refs = {
  'gas boiler':  { collector:'flat', collArea:0, tilt:45, storage:'tankIn', storeVolume:0.3, backup:'gas' },
  'direct electric': { collector:'flat', collArea:0, tilt:45, storage:'tankIn', storeVolume:0.3, backup:'el' },
  'heat pump':   { collector:'flat', collArea:0, tilt:45, storage:'tankIn', storeVolume:0.3, backup:'hp' },
};
const refOut = {};
for (const k of Object.keys(refs)) {
  const p = physics(refs[k]); refOut[k] = { noPv: cost(p, ECON, 0), withPv: bestPv(p, ECON, true) };
  console.log(k.padEnd(18) + line(refOut[k].noPv));
  console.log(''.padEnd(18) + line(refOut[k].withPv) + '   <- with PV');
}

console.log('\n=== SENSITIVITY (PV allowed) ===');
const vars = { 'base': {}, 'gas +50%': { gas: 0.1275 }, 'gas -30%': { gas: 0.0595 },
  'elec +30%': { elec: 0.273, elecHP: 0.221 }, 'elec -25%': { elec: 0.158, elecHP: 0.128 },
  'discount 2%': { rate: 0.02 }, 'discount 7%': { rate: 0.07 },
  'HP capex -30%': null, 'solar capex -40%': null };
for (const [name, patch] of Object.entries(vars)) {
  const E = JSON.parse(JSON.stringify(ECON));
  if (name === 'HP capex -30%') E.capex.hp = 9100;
  else if (name === 'solar capex -40%') { E.capex.solarLoop = 1200; }
  else Object.assign(E, patch);
  const src = name === 'solar capex -40%'
    ? feas.map(p => { const q = JSON.parse(JSON.stringify(p)); return q; }) : feas;
  let best;
  if (name === 'solar capex -40%') {
    const E2 = E, C2 = {};
    for (const k of Object.keys(COLLECTORS)) C2[k] = COLLECTORS[k].cost;
    for (const k of Object.keys(COLLECTORS)) COLLECTORS[k].cost = C2[k] * 0.6;
    best = rank(feas, E2, true, 1)[0];
    for (const k of Object.keys(COLLECTORS)) COLLECTORS[k].cost = C2[k];
  } else best = rank(feas, E, true, 1)[0];
  console.log(name.padEnd(18) + line(best));
}

const SUB = Object.assign(JSON.parse(JSON.stringify(ECON)), { subsidy: true });
console.log('\n=== WITH ZELENÁ DOMÁCNOSTIAM VOUCHERS ===');
rank(feas, SUB, true, 10).forEach(r => console.log(line(r) + ('  sub ' + r.sub.toFixed(0) + '€').padStart(12)));
console.log('\n--- subsidised, no fossil fuel ---');
rank(feas.filter(p => p.cfg.backup !== 'gas'), SUB, true, 6).forEach(r => console.log(line(r) + ('  sub ' + r.sub.toFixed(0) + '€').padStart(12)));
console.log('\n--- subsidised reference points ---');
for (const k of Object.keys(refs)) {
  const pp = physics(refs[k]);
  console.log(k.padEnd(18) + line(bestPv(pp, SUB, true)));
}
console.log('\n--- subsidised, best solar-thermal per band ---');
for (const band of [[0.2,0.4],[0.4,0.6],[0.6,0.8],[0.8,1.01]]) {
  const sset = feas.filter(p => p.sf >= band[0] && p.sf < band[1] && p.cfg.collArea > 0);
  if (sset.length) console.log(('SF ' + (band[0]*100) + '-' + (band[1]*100) + '%').padEnd(12) + line(rank(sset, SUB, true, 1)[0]));
}

writeFileSync(join(here, 'optimise-result.json'),
  JSON.stringify({ econ: ECON, refs: refOut,
    topNoPv: rank(feas, ECON, false, 15), topPv: rank(feas, ECON, true, 15),
    topNoFossil: rank(feas.filter(p => p.cfg.backup !== 'gas'), ECON, true, 10),
    topSub: rank(feas, SUB, true, 12),
    topSubNoFossil: rank(feas.filter(p => p.cfg.backup !== 'gas'), SUB, true, 8),
    refsSub: Object.fromEntries(Object.keys(refs).map(k => [k, bestPv(physics(refs[k]), SUB, true)])) }, null, 1));
console.log('\nwrote tools/optimise-result.json');
