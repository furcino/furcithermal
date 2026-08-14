/* What each extra percent of solar fraction costs, on top of the recommended
   system. Reproduces the marginal-cost tables in REPORT.md.
   Run:  node tools/solar-fraction-curve.mjs                                  */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here,'..','index.html'),'utf8');
const sc = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const model = sc.match(/\/\* =+ MODEL START =+ \*\/([\s\S]*?)\/\* =+ MODEL END =+ \*\//)[1];
const ctx = vm.createContext({ Math, console, Array, Object, JSON });
vm.runInContext(model + `
const _c=calibrateUA,_m={}; calibrateUA=(c,w)=>{const k=c.houseClass+c.floorArea+c.occupants; if(!(k in _m))_m[k]=_c(c,w); return _m[k];};
globalThis.API={simulate,makeWeather,COLLECTORS,STORAGES};`, ctx);
const { simulate, makeWeather, COLLECTORS } = ctx.API;
const W = makeWeather();
const crf=(n,i)=>i*Math.pow(1+i,n)/(Math.pow(1+i,n)-1);
const E={rate:.04,gas:.085,elec:.21,elecHP:.17,exp:.05,base:3500,pvCost:1200,pvY:1061};
const storeCost=v=>900+950*Math.pow(v,.80);

function run(area, vol, backup, pvKw, sub) {
  const a = simulate({ collector:'flat', collArea:area, tilt:45, storage:'tankIn', storeVolume:vol,
    houseClass:'A1', floorArea:150, occupants:4, exchangerKW:15, backup, weather:W }).acc;
  const capColl = area>0.5 ? 290*area + 2000 : 0;
  const capStore = storeCost(vol), capBk = backup==='hp'?13000:4500, capPv = pvKw*1200;
  const s = sub ? Math.min(2300,.5*capColl) + (backup==='hp'?Math.min(4370,.5*capBk):0) + Math.min(4025,.5*capPv,pvKw*575) : 0;
  const tot = capColl+capStore+capBk+capPv;
  const nf = tot>0 ? 1-s/tot : 1;
  const ann = nf*(capColl*crf(25,E.rate)+capStore*crf(40,E.rate)+capBk*crf(backup==='hp'?18:20,E.rate)+capPv*crf(25,E.rate))
            + (area>0.5?900*crf(15,E.rate):0);
  const heatElec = backup==='hp'?a.elec:0;
  const price = backup==='hp'?E.elecHP:E.elec;
  const cons = E.base+heatElec;
  const gen = pvKw*E.pvY;
  let pvSav=0;
  if(gen>0){const r=gen/cons;const sr=Math.max(.25,Math.min(.75,.9-.45*r));const su=Math.min(gen*sr,cons);pvSav=su*price+(gen-su)*E.exp;}
  const fuel = backup==='gas' ? (a.backup/0.95)*E.gas : heatElec*price;
  const om = (area>0.5?120:0)+(backup==='hp'?200:160)+.004*capStore+(pvKw?40:0);
  return { area, vol, sf:a.sf=a.solarFraction, tac: ann+fuel+om-pvSav, capex: tot, sub:s,
           cold:a.cold, stag:a.stag, elec:a.elec, backup:a.backup, tMax:a.tMax, col:a.col };
}
const hdr = (t)=>console.log('\n'+t+'\n  area   store      SF     capex    subsidy   TAC €/a   vs best   dumped');
const row = (r, base)=>console.log(
  String(r.area).padStart(5)+'m²'+String(r.vol+'m³').padStart(8)+
  (r.sf*100).toFixed(0).padStart(7)+'%'+r.capex.toFixed(0).padStart(9)+r.sub.toFixed(0).padStart(9)+
  r.tac.toFixed(0).padStart(11)+('+'+(r.tac-base).toFixed(0)).padStart(10)+r.stag.toFixed(0).padStart(9));

hdr('Heat pump + 7 kWp PV, with vouchers — buying solar fraction with flat-plate collectors');
const b1 = run(0,0.3,'hp',7,true).tac;
for (const [a,v] of [[0,0.3],[4,0.3],[6,0.5],[8,0.5],[10,1],[12,1],[15,2],[20,4],[30,8],[40,15],[60,30],[80,50]])
  row(run(a,v,'hp',7,true), b1);

hdr('Gas boiler + 10 kWp PV, with vouchers — same exercise');
const b2 = run(0,0.3,'gas',10,true).tac;
for (const [a,v] of [[0,0.3],[4,0.3],[6,0.5],[8,0.5],[10,1],[15,2],[20,4],[30,8],[45,15],[60,30]])
  row(run(a,v,'gas',10,true), b2);
