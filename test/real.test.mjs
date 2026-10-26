import { parseOSM, makeProjection } from '../src/geo.js';
import { fractureBuilding, buildingShell } from '../src/fracture.js';
const g = s => s.map(([lat, lon]) => ({ lat, lon }));
const json = { elements: [
 { type: 'way', id: 108072568, tags: { building: 'university', 'building:levels': '5', name: '인문관' }, geometry: g([[35.231926,129.080552],[35.231808,129.080573],[35.231852,129.080997],[35.231887,129.081088],[35.231931,129.081158],[35.232014,129.081217],[35.232372,129.081414],[35.232421,129.081441],[35.232463,129.081464],[35.232627,129.081555],[35.232601,129.081646],[35.232746,129.08178],[35.232829,129.081791],[35.232864,129.081684],[35.232833,129.081657],[35.232886,129.081523],[35.232518,129.081324],[35.232481,129.081305],[35.232431,129.081277],[35.23204,129.081067],[35.231992,129.081024],[35.23197,129.080954],[35.231926,129.080552]]) },
 { type: 'way', id: 108067609, tags: { building: 'university', name: '대학본부' }, geometry: g([[35.232931,129.082866],[35.232821,129.082821],[35.232833,129.082776],[35.232614,129.082688],[35.232606,129.082719],[35.23233,129.082608],[35.232267,129.08284],[35.232426,129.082904],[35.232416,129.082941],[35.23261,129.083019],[35.232597,129.083068],[35.232649,129.083089],[35.232662,129.083041],[35.232862,129.083122],[35.232931,129.082866]]) },
 { type: 'way', id: 468725942, tags: { highway: 'service', tunnel: 'yes' }, geometry: g([[35.232185,129.083236],[35.232083,129.083193],[35.231785,129.083315]]) },
 { type: 'way', id: 472080405, tags: { leisure: 'park', name: '넉넉한터' }, geometry: g([[35.232263,129.082006],[35.232282,129.081935],[35.231659,129.081667],[35.231348,129.082704],[35.232263,129.082006]]) },
]};
const proj = makeProjection(35.2335, 129.0805);
const d = parseOSM(json, proj, 600);
console.log('buildings', d.buildings.map(b => [b.name, b.pts.length, Math.round(b.area), b.height.toFixed(1)]), 'roads', d.roads.length, d.roads[0].tunnel, 'areas', d.areas.map(a => a.kind));
for (const b of d.buildings) {
  for (const max of [230, 90, 26]) {
    const f = fractureBuilding(b, 60, () => 60 + Math.random() * 3, max);
    const v = f.chunks.reduce((s, c) => s + c.vol, 0);
    console.log(b.name, 'max', max, 'chunks', f.chunks.length, 'nL', f.nL, 'vol ratio', (v / (b.area * b.height)).toFixed(3), 'hull ok', f.chunks.every(c => c.hull.every(Number.isFinite)));
  }
  const s = buildingShell(b, 60); console.log(' shell verts', s.getAttribute('position').count, 'tris', s.index.count / 3);
}
