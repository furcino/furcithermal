/* Extracts the physics model out of index.html and checks it against known-good values.
   Run with:  node test/model.test.mjs                                                   */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

/* ---- 1. the whole page script must at least parse ---- */
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length !== 1) throw new Error('expected exactly one inline script, found ' + scripts.length);
new vm.Script(scripts[0], { filename: 'index.html#script' });   // throws on a syntax error

/* ---- 2. run the model half in isolation ---- */
const model = scripts[0].match(/\/\* =+ MODEL START =+ \*\/([\s\S]*?)\/\* =+ MODEL END =+ \*\//);
if (!model) throw new Error('MODEL START/END markers not found');
const ctx = vm.createContext({ Math, console, Array, Object, JSON });
vm.runInContext(model[1] + '\nglobalThis.API = { simulate, makeWeather, SITE, COLLECTORS, STORAGES, CLASSES, transpose, dayLength, monthOfDay, MONTH_LEN, MONTH_START, D2R };', ctx);
const { simulate, makeWeather, SITE, COLLECTORS, STORAGES, CLASSES, transpose, dayLength, monthOfDay, MONTH_LEN, D2R } = ctx.API;

let failed = 0, checks = 0;
function check(label, actual, lo, hi) {
  checks++;
  const ok = actual >= lo && actual <= hi;
  if (!ok) failed++;
  const n = typeof actual === 'number' ? actual.toFixed(2) : actual;
  console.log((ok ? '  ok   ' : '  FAIL ') + label.padEnd(46) + String(n).padStart(10) +
    (ok ? '' : '   expected ' + lo + '…' + hi));
}

/* ---- climate ---- */
const W = makeWeather();
const mt = Array(12).fill(0), mg = Array(12).fill(0);
W.forEach((x, d) => { const m = monthOfDay(d); mt[m] += x.tAmb / MONTH_LEN[m]; mg[m] += x.ghi; });
console.log('\nClimate — the synthetic year must reproduce the Bratislava normals');
for (let m = 0; m < 12; m++) check('mean air temp month ' + (m + 1), mt[m], SITE.temp[m] - 0.05, SITE.temp[m] + 0.05);
check('annual GHI (kWh/m²)', mg.reduce((a, b) => a + b, 0), 1181, 1183);
check('annual mean temp (°C)', W.reduce((a, x) => a + x.tAmb, 0) / 365, 10.8, 11.0);
const sd = Math.sqrt(W.reduce((a, x, d) => a + Math.pow(x.tAmb - mt[monthOfDay(d)], 2), 0) / 365);
check('day-to-day temp scatter (K)', sd, 2.5, 4.5);
check('coldest day (°C)', Math.min(...W.map(x => x.tAmb)), -16, -5);
check('warmest day (°C)', Math.max(...W.map(x => x.tAmb)), 26, 34);

console.log('\nSolar geometry at 48.15 °N');
const phi = SITE.lat * D2R;
check('day length 21 Jun (h)', dayLength(171, phi), 15.7, 16.1);
check('day length 21 Dec (h)', dayLength(354, phi), 8.0, 8.3);
let hFlat = 0, hOpt = 0, hSteep = 0;
W.forEach((x, d) => {
  const alb = x.snow > 2 ? 0.6 : 0.2;
  hFlat += transpose(x.ghi, d, phi, 0, alb);
  hOpt += transpose(x.ghi, d, phi, 35 * D2R, alb);
  hSteep += transpose(x.ghi, d, phi, 70 * D2R, alb);
});
check('irradiation on the flat (kWh/m²a)', hFlat, 1178, 1186);
check('irradiation at 35° tilt', hOpt, 1240, 1330);
check('irradiation at 70° tilt', hSteep, 1020, 1150);
check('35° beats flat by (%)', (hOpt / hFlat - 1) * 100, 5, 14);

/* ---- system cases ---- */
const base = { collector:'flat', collArea:35, tilt:50, storage:'tankIn', storeVolume:30,
               houseClass:'A1', floorArea:150, occupants:4, backup:'gas', exchangerKW:15, weather:W };
const run = o => simulate(Object.assign({}, base, o)).acc;

console.log('\nHouse — the loss coefficient is solved to hit the certificate class');
for (const k of Object.keys(CLASSES)) {
  const a = run({ houseClass: k });
  check('class ' + k + ' specific demand', a.specDemand, CLASSES[k].target - 0.3, CLASSES[k].target + 0.3);
  check('class ' + k + ' within legal limit', a.specDemand, 0, CLASSES[k].limit);
}
const a150 = run({}), a300 = run({ floorArea: 300 });
check('doubling floor area keeps kWh/m²', a300.specDemand, a150.specDemand - 1, a150.specDemand + 1);
check('doubling floor area raises UA', a300.UAh / a150.UAh, 1.6, 2.4);

console.log('\nBase system: 35 m² flat plate, 30 m³ indoor tank, A1 house');
const b = run({});
check('solar fraction (%)', b.solarFraction * 100, 45, 65);
check('collector yield (kWh/m²a)', b.yieldPerM2, 180, 300);
check('store minimum (°C)', b.tMin, 25, 45);
check('store maximum (°C)', b.tMax, 88, 95);
check('store losses / collected (%)', b.loss / b.col * 100, 20, 50);
check('cold days indoors', b.cold, 0, 0);
check('hot water demand (kWh/a)', b.dhw, 3300, 4000);

console.log('\nMonotonicity — better inputs must give better outputs');
check('60 m² > 35 m² collector SF', run({ collArea: 60 }).solarFraction - b.solarFraction, 0.001, 1);
check('100 m³ > 30 m³ store SF', run({ storeVolume: 100 }).solarFraction - b.solarFraction, 0.001, 1);
check('A0 house > A1 house SF', run({ houseClass: 'A0' }).solarFraction - b.solarFraction, 0.001, 1);
check('B house < A1 house SF', b.solarFraction - run({ houseClass: 'B' }).solarFraction, 0.001, 1);
check('evacuated tube > flat plate yield', run({ collector: 'etHp' }).yieldPerM2 - b.yieldPerM2, 1, 400);
check('heat pump backup > gas backup SF', run({ backup: 'hp' }).solarFraction - b.solarFraction, 0.05, 1);

console.log('\nPhysical bounds no configuration may break');
for (const c of Object.keys(COLLECTORS)) {
  const a = run({ collector: c });
  check(c + ': yield below optical maximum', a.yieldPerM2, 20, hOpt * COLLECTORS[c].eta0);
  check(c + ': solar fraction in range', a.solarFraction, 0, 1);
}
for (const s of Object.keys(STORAGES)) {
  const st = STORAGES[s];
  const a = run({ storage: s, storeVolume: st.vDef, collArea: 60 });
  check(s + ': store never exceeds tMax', a.tMax, -50, st.tMax + 0.5);
  check(s + ': store never freezes', a.tMin, 0, 200);
  check(s + ': energy balance closes', Math.abs(a.solar + a.backup + a.elec - a.deliver) / Math.max(1, a.deliver), 0, 0.02);
}

console.log('\nKnown physical behaviours the model should reproduce');
check('unglazed collector is useless seasonally (SF %)', run({ collector: 'unglazed' }).solarFraction * 100, 0, 35);
check('a 2 m² field cannot heat a house (SF %)', run({ collArea: 2 }).solarFraction * 100, 0, 20);
check('small BTES bleeds out (loss/collected)', run({ storage: 'btes', storeVolume: 500, collArea: 60 }).loss /
      run({ storage: 'btes', storeVolume: 500, collArea: 60 }).col, 0.7, 1.05);
check('large PTES works (SF %)', run({ storage: 'ptesG', storeVolume: 1500, collArea: 60 }).solarFraction * 100, 70, 100);
check('no backup leaves the house cold (days)', run({ backup: 'none' }).cold, 20, 200);
check('oversized field on a small store stagnates', run({ collector: 'etCpc' }).stag /
      run({ collector: 'etCpc' }).col, 0.3, 1.2);
check('PVT also makes electricity (kWh/a)', run({ collector: 'pvt' }).pv, 1500, 9000);

/* ---- determinism ---- */
console.log('\nReproducibility');
check('same inputs give the same answer', Math.abs(run({}).solarFraction - run({}).solarFraction), 0, 1e-12);

console.log('\n' + (failed ? '✗ ' + failed + ' of ' + checks + ' checks FAILED' : '✓ all ' + checks + ' checks passed'));
process.exit(failed ? 1 : 0);
