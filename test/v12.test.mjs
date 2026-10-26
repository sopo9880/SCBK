// v1.2: 물리 코어(워커와 공용) + 핵 위력 스케일 검사
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { PhysCore, STRIDE } from '../src/physics/core.js';
import { nukeYield, nukeRadii, fmtYield } from '../src/weapons/nukes.js';

await RAPIER.init();
const core = new PhysCore(RAPIER);
const n = 9, h = new Float32Array(n * n);
core.exec(['hf', 1, n, h, 200]);
core.exec(['chunk', 2, 0, 20, 0, 0, [1, 1, 1, 0, 0, 0, 1], 0.55, (1 << 16) | 0xffff]);
core.exec(['dyn', 2, 1]);
for (let i = 0; i < 180; i++) core.step(1 / 60, 3);
const s = core.snapshot();
assert.equal(s.ids.length, 1);
assert.equal(s.f.length, STRIDE);
const y = s.f[1];
assert.ok(y > 0.5 && y < 2.5, `상자가 땅 위에 멈춰야 함 (y=${y})`);
// 중력 반전
core.exec(['wgrav', 0, 9.81, 0]);
for (let i = 0; i < 60; i++) core.step(1 / 60, 3);
assert.ok(core.snapshot().f[1] > y + 1, '중력 반전 시 위로 떠올라야 함');
core.exec(['rm', 2]);
assert.equal(core.snapshot().ids.length, 0);
core.free();

// 위력: ×1 ≈ 15kt (히로시마), ×100 ≈ 47Mt (차르 봄바급)
assert.equal(Math.round(nukeYield(1)), 15);
assert.ok(nukeYield(100) > 40000 && nukeYield(100) < 55000);
const a = nukeRadii(nukeYield(1)), b = nukeRadii(nukeYield(100));
assert.ok(a.r5 > 1500 && a.r5 < 1800, '15kt 5psi 반경 약 1.7km');
assert.ok(b.vap > 3000, '×100 은 지도 전체(최대 반경 3km)를 증발');
assert.ok(b.r1 > 50000, '×100 1psi 반경 수십 km');
assert.equal(fmtYield(15), '15kt');
assert.equal(fmtYield(47434), '47Mt');
console.log('v1.2 tests ok');
