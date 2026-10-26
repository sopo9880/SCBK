import { generateDemoCity } from '../src/demo.js';
import { parseOSM, makeProjection } from '../src/geo.js';
import { fractureBuilding, buildingShell } from '../src/fracture.js';
const { center, json } = generateDemoCity(600);
const proj = makeProjection(center.lat, center.lon);
const d = parseOSM(json, proj, 600);
console.log('buildings', d.buildings.length, 'roads', d.roads.length, 'areas', d.areas.length);
let tot = 0, maxc = 0, t0 = performance.now();
for (const b of d.buildings) {
  const f = fractureBuilding(b, 0, () => 0, 220);
  tot += f.chunks.length; maxc = Math.max(maxc, f.chunks.length);
  // sanity: volume conservation
  const v = f.chunks.reduce((s, c) => s + c.vol, 0);
  const expect = b.area * b.height;
  if (Math.abs(v - expect) / expect > 0.02 && !b.holes.length) { console.log('VOL MISMATCH', b.name, v, expect); break; }
  // normals check: walls kinds
  for (const c of f.chunks) { const k = c.geo.getAttribute('aKind').array; if (k.some(x => x !== 0 && x !== 1 && x !== 2)) throw 'bad kind'; }
  buildingShell(b, 0);
}
console.log('chunks total', tot, 'max/bldg', maxc, 'ms', (performance.now() - t0).toFixed(0));
const tall = d.buildings.sort((a, b) => b.height - a.height)[0];
console.log('tallest', tall.name, tall.height.toFixed(0), fractureBuilding(tall, 0, () => 0, 220).chunks.length, fractureBuilding(tall, 0, () => 0, 30).chunks.length);
