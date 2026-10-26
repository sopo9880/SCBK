// Rapier 월드 조작 공통부 (워커와 메인 스레드 폴백이 같이 씀)
// 명령(cmd) 배열 형식:
//   ['hf', id, n, heights(Float32Array, rapier 열 우선), span]
//   ['tri', id, verts(Float32Array), idx(Uint32Array)]
//   ['chunk', id, x, y, z, kind(0 상자 / 1 볼록), data, density, group]
//       상자 data = [hu, hy, hv, ox, oz, qy, qw], 볼록 data = Float32Array 점들
//   ['ball', id, x, y, z, vx, vy, vz, r]
//   ['rm', id]  ['dyn', id, 0|1]  ['imp', id, x, y, z]  ['tor', id, x, y, z]
//   ['vel', id, x, y, z]  ['mulvel', id, kx, ky, kz]  ['grav', id, s]  ['wgrav', gx, gy, gz]
//   ['ang', id, x, y, z]  ['ccd', id, 0|1]
export const STRIDE = 11; // pos3 quat4 vel3 sleeping1

export class PhysCore {
  constructor(R) {
    this.R = R;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.integrationParameters.numSolverIterations = 2;
    this.world.timestep = 1 / 60;
    this.bodies = new Map();   // id → RigidBody
    this.dyn = new Set();      // 동적 body id
    this.stepMs = 0;
  }

  exec(cmd) {
    const R = this.R, w = this.world;
    const id = cmd[1];
    switch (cmd[0]) {
      case 'hf': {
        this._remove(id);
        const b = w.createRigidBody(R.RigidBodyDesc.fixed());
        const n = cmd[2];
        w.createCollider(R.ColliderDesc.heightfield(n - 1, n - 1, cmd[3], { x: cmd[4], y: 1, z: cmd[4] }).setFriction(0.9), b);
        this.bodies.set(id, b);
        break;
      }
      case 'tri': {
        const b = w.createRigidBody(R.RigidBodyDesc.fixed());
        w.createCollider(R.ColliderDesc.trimesh(cmd[2], cmd[3]), b);
        this.bodies.set(id, b);
        break;
      }
      case 'chunk': {
        const [, , x, y, z, kind, data, density, group] = cmd;
        const b = w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z).setCanSleep(true).setLinearDamping(0.05).setAngularDamping(0.25));
        let cd = null;
        if (kind === 0) cd = R.ColliderDesc.cuboid(Math.max(0.2, data[0]), Math.max(0.2, data[1]), Math.max(0.2, data[2])).setTranslation(data[3], 0, data[4]).setRotation({ x: 0, y: data[5], z: 0, w: data[6] });
        else cd = R.ColliderDesc.convexHull(data);
        if (!cd) cd = R.ColliderDesc.cuboid(1, 1, 1);
        cd.setDensity(density).setFriction(0.6).setRestitution(0.05).setCollisionGroups(group);
        w.createCollider(cd, b);
        this.bodies.set(id, b);
        break;
      }
      case 'ball': {
        const [, , x, y, z, vx, vy, vz, r] = cmd;
        const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinvel(vx, vy, vz).setCcdEnabled(true).setAngularDamping(0.3));
        w.createCollider(R.ColliderDesc.ball(r).setDensity(7.8).setFriction(0.6).setRestitution(0.25), b);
        this.bodies.set(id, b); this.dyn.add(id);
        break;
      }
      case 'rm': this._remove(id); break;
      case 'dyn': {
        const b = this.bodies.get(id); if (!b) break;
        if (cmd[2]) { b.setBodyType(R.RigidBodyType.Dynamic, true); this.dyn.add(id); }
        else { b.setBodyType(R.RigidBodyType.Fixed, true); this.dyn.delete(id); }
        break;
      }
      case 'imp': { const b = this.bodies.get(id); if (b) b.applyImpulse({ x: cmd[2], y: cmd[3], z: cmd[4] }, true); break; }
      case 'tor': { const b = this.bodies.get(id); if (b) b.applyTorqueImpulse({ x: cmd[2], y: cmd[3], z: cmd[4] }, true); break; }
      case 'vel': { const b = this.bodies.get(id); if (b) b.setLinvel({ x: cmd[2], y: cmd[3], z: cmd[4] }, true); break; }
      case 'ang': { const b = this.bodies.get(id); if (b) b.setAngvel({ x: cmd[2], y: cmd[3], z: cmd[4] }, true); break; }
      case 'mulvel': {
        const b = this.bodies.get(id); if (!b) break;
        const v = b.linvel(); b.setLinvel({ x: v.x * cmd[2], y: v.y * cmd[3], z: v.z * cmd[4] }, true);
        break;
      }
      case 'grav': { const b = this.bodies.get(id); if (b) b.setGravityScale(cmd[2], true); break; }
      case 'ccd': { const b = this.bodies.get(id); if (b) b.enableCcd(!!cmd[2]); break; }
      case 'wgrav': {
        this.world.gravity = { x: cmd[1], y: cmd[2], z: cmd[3] };
        for (const d of this.dyn) { const b = this.bodies.get(d); if (b) b.wakeUp(); } // 잠든 body 도 새 중력을 받게
        break;
      }
    }
  }

  _remove(id) {
    const b = this.bodies.get(id);
    if (!b) return;
    this.world.removeRigidBody(b);
    this.bodies.delete(id); this.dyn.delete(id);
  }

  // 시간 dt 만큼 진행 (최대 스텝 수 제한)
  step(dt, maxSteps) {
    this._acc = (this._acc || 0) + Math.min(dt, 0.1);
    const step = 1 / 60;
    let n = 0;
    const t0 = performance.now();
    while (this._acc >= step && n < maxSteps) { this.world.step(); this._acc -= step; n++; }
    if (this._acc > step * maxSteps) this._acc = 0;
    const ms = performance.now() - t0;
    if (n) this.stepMs = this.stepMs * 0.8 + (ms / n) * 0.2;
    return { steps: n, ms };
  }

  // 동적 body 상태를 평평한 배열로
  snapshot() {
    const n = this.dyn.size;
    const ids = new Int32Array(n), f = new Float32Array(n * STRIDE);
    let k = 0;
    for (const id of this.dyn) {
      const b = this.bodies.get(id);
      const t = b.translation(), r = b.rotation(), v = b.linvel();
      ids[k] = id;
      const o = k * STRIDE;
      f[o] = t.x; f[o + 1] = t.y; f[o + 2] = t.z;
      f[o + 3] = r.x; f[o + 4] = r.y; f[o + 5] = r.z; f[o + 6] = r.w;
      f[o + 7] = v.x; f[o + 8] = v.y; f[o + 9] = v.z;
      f[o + 10] = b.isSleeping() ? 1 : 0;
      k++;
    }
    return { ids, f };
  }

  free() { this.world.free(); }
}
