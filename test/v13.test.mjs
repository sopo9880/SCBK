// v1.3: 가벼운 파편(간이 물리), 중력 반전, 설정 기본값
import assert from 'node:assert/strict';
import { Physics } from '../src/physics/physics.js';
import { defaultCfg, SCHEMA } from '../src/settings.js';

const ph = await Physics.create({ useWorker: false });
assert.equal(ph.mode, 'inline');
ph.lightEnv = { collide(b) { if (b.p.y - b.r < 0) { b.p.y = b.r; if (b.v.y < 0) b.v.y = -b.v.y * 0.25; b.v.x *= 0.8; b.v.z *= 0.8; return true; } return false; } };
const lb = ph.light(0, 30, 0, null, 10, 1);
lb.setDynamic(true);
lb.setLinvel({ x: 5, y: 0, z: 0 });
assert.equal(ph.lightCount, 1);
for (let i = 0; i < 400 && !lb.isSleeping(); i++) ph.step(1 / 60);
assert.ok(lb.isSleeping(), '땅에 닿아 멈춰야 함');
assert.ok(Math.abs(lb.translation().y - 1) < 0.2, `반지름 높이에서 멈춤 (y=${lb.translation().y})`);
// 중력 반전 → 다시 움직이며 위로
ph.setGravity(0, 9.81, 0);
for (let i = 0; i < 60; i++) ph.step(1 / 60);
assert.ok(lb.translation().y > 3, '중력 반전 시 떠올라야 함');
ph.remove(lb);
assert.equal(ph.lightCount, 0);
ph.dispose();

const cfg = defaultCfg();
for (const s of SCHEMA) if (!s.root) assert.ok(s.key in cfg, s.key);
assert.equal(cfg.k_slow, 'KeyT');
console.log('v1.3 tests ok');
