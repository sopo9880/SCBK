// 무기 엔진: 투사체, 지속 효과, 위력 스케일, 공통 폭발/크레이터
import * as THREE from 'three';
import { WEAPONS, DEFAULT_OPTS, powerScale } from './defs.js';
import { CLASSIC } from './classic.js';
import { EXTRA } from './extra.js';
import { STORMS } from './storms.js';
import { NUKES, detonate } from './nukes.js';
import { AIR } from './air.js';
import { SKY2 } from './sky2.js';
import { NATURE2 } from './nature2.js';
import { FUN } from './fun.js';
import { SPECIAL2 } from './special2.js';
import { runEnding, ENDINGS } from './endings.js';
import { NEW1, NEW1_ENDINGS } from './new1.js';
import { NEW2, NEW2_ENDINGS } from './new2.js';
import { NEW3, NEW3_ENDINGS } from './new3.js';
import { MOVIE, MOVIE_ENDINGS } from './movie.js';
import { NEW4, NEW4_ENDINGS } from './new4.js';
import { NEW5, NEW5_ENDINGS } from './new5.js';
import { NEW6, NEW6_ENDINGS } from './new6.js';
import { MOVIE2, MOVIE2_ENDINGS } from './movie2.js';
Object.assign(ENDINGS, NEW1_ENDINGS, NEW2_ENDINGS, NEW3_ENDINGS, MOVIE_ENDINGS, NEW4_ENDINGS, NEW5_ENDINGS, NEW6_ENDINGS, MOVIE2_ENDINGS);

const HANDLERS = { ...CLASSIC, ...EXTRA, ...STORMS, ...NUKES, ...AIR, ...SKY2, ...NATURE2, ...FUN, ...SPECIAL2, ...NEW1, ...NEW2, ...NEW3, ...MOVIE, ...NEW4, ...NEW5, ...NEW6, ...MOVIE2 };
export const HANDLER_IDS = Object.keys(HANDLERS);
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _up = v3(0, 1, 0), _down = v3(0, -1, 0), _fwd = v3(0, 0, 1);

export class Arsenal {
  constructor(ctx) {
    this.ctx = ctx; // { scene, D, fx, audio, world, grid, camera, quality, game, onCrater }
    this.projectiles = [];
    this.active = [];
    this.power = 3;
    this.current = 'bomb';
    this.opts = { ...DEFAULT_OPTS };
    this._hold = null;
    this._crater = [];
    this._tmp = v3();
  }

  get S() { return powerScale(this.power); }
  def(id = this.current) { return WEAPONS.find(w => w.id === id); }
  isHold(id = this.current) { return !!(this.def(id) || {}).hold; }

  fire(hit, cameraPos) {
    this.ctx.audio.resume();
    const h = HANDLERS[this.current];
    if (h && h.fire) h.fire(this, hit, cameraPos.clone());
    if (hit) runEnding(this, this.current, hit.point);
  }
  // 다른 무기를 지금 위력으로 한 번 쏘기 (세계 멸망 결말에서 여러 번 쓸 때)
  fireAs(id, hit) {
    const h = HANDLERS[id];
    if (h && h.fire) h.fire(this, hit, this.ctx.camera.position.clone());
  }
  holdStart(hit) {
    const h = HANDLERS[this.current];
    this.ctx.audio.resume();
    if (h && h.holdStart) this._hold = { id: this.current, state: h.holdStart(this, hit) || {} };
  }
  holdEnd() {
    if (!this._hold) return;
    const h = HANDLERS[this._hold.id];
    if (h && h.holdEnd) h.holdEnd(this, this._hold.state);
    if (this._holdAim) runEnding(this, this._hold.id, this._holdAim);
    this._hold = null; this._holdAim = null;
  }

  spawn(obj, scale = 1) { obj.scale.setScalar(scale); this.ctx.scene.add(obj); return obj; }
  remove(obj) {
    if (!obj) return;
    this.ctx.scene.remove(obj);
    obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose && !o.material.userData?.shared) o.material.dispose(); });
  }

  /**
   * p: { mesh, pos, vel, g=0, drag=0, align: 'down'|'fwd'|null, trail: {size, fire, every}, spin, onHit(point, info), onUpdate(p, dt) => false 이면 제거, ignoreHits }
   */
  addProjectile(p) { p.g = p.g || 0; p.drag = p.drag || 0; this.projectiles.push(p); if (p.mesh) p.mesh.position.copy(p.pos); return p; }
  addActive(a) { this.active.push(a); return a; }

  // 표준 폭발: 물리 + 연출 + 소리 + 그을음 + 나무
  blast(q, r, power, o = {}) {
    const { D, fx, audio, world, grid } = this.ctx;
    D.explode({ x: q.x, y: q.y + r * 0.15, z: q.z, r, power, vaporize: o.vap || 0, lift: o.lift ?? 0.4, scorch: o.scorch ?? 0.5, lod: o.lod });
    if (!o.noFx) fx.explosion(q, r * 0.75, { ring: q.y - grid.sample(q.x, q.z) < 6, smokeColumn: o.smokeColumn });
    world.paintScorch(q.x, q.z, r * 0.9, 0.85);
    world.blastTrees(q.x, q.z, r * 1.1, r * 0.4);
    if (o.crater) this.crater(q.x, q.z, o.crater[0], o.crater[1]);
    if (!o.silent) audio.boom(Math.min(3, r / 15), this.ctx.camera.position.distanceTo(this._tmp.set(q.x, q.y, q.z)));
  }
  crater(x, z, r, d) { this._crater.push([x, z, r, d]); }
  nukeHit(q, o) { return detonate(this, q, o); }

  update(dt, aim) {
    const { D, fx, grid } = this.ctx;
    // 투사체
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.onUpdate && pr.onUpdate(pr, dt) === false) { this.remove(pr.mesh); this.projectiles.splice(i, 1); continue; }
      pr.vel.y -= pr.g * dt;
      if (pr.drag) pr.vel.multiplyScalar(Math.exp(-pr.drag * dt));
      const step = this._tmp.copy(pr.vel).multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().divideScalar(len || 1);
      const hit = pr.ignoreHits ? null : D.raycast(pr.pos, dir, len + 0.5);
      const ground = grid.sample(pr.pos.x, pr.pos.z);
      if (hit || (!pr.ignoreHits && pr.pos.y + step.y < ground)) {
        const q = hit ? hit.point : { x: pr.pos.x, y: ground, z: pr.pos.z };
        this.remove(pr.mesh);
        this.projectiles.splice(i, 1);
        if (pr.onHit) pr.onHit(q, hit && hit.info, pr);
        continue;
      }
      pr.pos.add(step);
      if (pr.mesh) {
        pr.mesh.position.copy(pr.pos);
        if (pr.align === 'down') pr.mesh.quaternion.setFromUnitVectors(_down, dir);
        else if (pr.align === 'fwd') pr.mesh.quaternion.setFromUnitVectors(_fwd, dir);
        else if (pr.align === 'up') pr.mesh.quaternion.setFromUnitVectors(_up, dir);
        if (pr.spin) { pr.mesh.rotation.x += dt * 3; pr.mesh.rotation.z += dt * 2; }
      }
      if (pr.trail) {
        const every = pr.trail.every || 0.012;
        pr.tAcc = (pr.tAcc || 0) + dt;
        while (pr.tAcc > every) { pr.tAcc -= every; fx.trail(pr.pos.clone().addScaledVector(dir, -pr.trail.size * 1.5 * Math.random()), pr.trail.size, pr.trail.fire); }
      }
    }
    // 누르고 있는 무기
    if (this._hold) {
      const h = HANDLERS[this._hold.id];
      if (h && h.holdUpdate) h.holdUpdate(this, this._hold.state, dt, aim);
      if (aim) this._holdAim = { x: aim.x, y: aim.y, z: aim.z };
    }
    // 지속 효과
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (a.update(dt, aim) === false) { if (a.dispose) a.dispose(); this.active.splice(i, 1); }
    }
    // 크레이터 (프레임당 한 번)
    if (this._crater.length) {
      const ranges = [];
      let deep = 0;
      const list = this._crater;
      for (const [x, z, r, d] of list) { ranges.push(grid.crater(x, z, r, d)); deep = Math.max(deep, Math.abs(d)); }
      this._crater = [];
      this.ctx.onCrater(ranges, deep, list);
    }
  }

  clear() {
    for (const p of this.projectiles) this.remove(p.mesh);
    for (const a of this.active) if (a.dispose) a.dispose();
    this.projectiles = []; this.active = [];
    this.holdEnd();
  }
}
