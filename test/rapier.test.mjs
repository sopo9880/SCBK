import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const n = 5; // 5x5 verts => 4 rows/cols
const h = new Float32Array(n * n);
// height = 10 at vertex with x index 4 (x=+50), z index 0 (z=-50): our idx j*n+i, i=x
// rapier column-major: index = row + col*(nrows+1). Hypothesis: row=z(j), col=x(i) -> index = j + i*n
h[0 + 4 * n] = 10;
const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
w.createCollider(RAPIER.ColliderDesc.heightfield(n - 1, n - 1, h, { x: 100, y: 1, z: 100 }), body);
w.step();
const cast = (x, z) => { const r = new RAPIER.Ray({ x, y: 50, z }, { x: 0, y: -1, z: 0 }); const hit = w.castRay(r, 100, true); return hit ? (50 - hit.timeOfImpact).toFixed(2) : 'miss'; };
console.log('x+50,z-50 (expect 10):', cast(49.9, -49.9), ' x-50,z+50:', cast(-49.9, 49.9), ' x+50,z+50:', cast(49.9, 49.9), ' x-50,z-50:', cast(-49.9, -49.9));
const hull = RAPIER.ColliderDesc.convexHull(new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,1, 1,1,1]));
console.log('hull ok', !!hull);
const b2 = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 20, 0));
w.createCollider(RAPIER.ColliderDesc.cuboid(1,1,1).setDensity(0.6), b2);
b2.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
for (let i = 0; i < 60; i++) w.step();
console.log('dyn y after 1s', b2.translation().y.toFixed(2), 'mass', b2.mass().toFixed(2));
