// 시네마틱 카메라: 컷(샷) 목록을 재생하며 카메라·시간 배속을 제어
import * as THREE from 'three';

export const ease = {
  inOut: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  out: t => 1 - (1 - t) ** 3,
  in: t => t * t * t,
  lin: t => t,
};
const clamp01 = t => Math.max(0, Math.min(1, t));

export class Cinematic {
  constructor(game) {
    this.game = game;
    this.shots = null;
    this.i = 0; this.t = 0;
    this.timeScale = 1;
    this._pos = new THREE.Vector3(); this._look = new THREE.Vector3();
    this._smoothPos = new THREE.Vector3(); this._smoothLook = new THREE.Vector3();
    this._snap = true;
    this.capEl = document.getElementById('cineCap');
  }
  get active() { return !!this.shots; }

  /**
   * shots: [{ dur, caption?, enter?(), update(t, u, out) }]
   *   out.pos / out.look (Vector3) 를 채우면 카메라가 따라감. out.fov, out.timeScale, out.smooth(0~1, 0=즉시) 선택.
   * onEnd(skipped): 끝나거나 건너뛸 때 호출
   */
  play(shots, { onEnd, onSkip } = {}) {
    if (this.shots) this.stop(false);
    this.shots = shots; this.i = 0; this.t = 0; this._snap = true;
    this.onEnd = onEnd; this.onSkip = onSkip;
    this._fov0 = this.game.camera.fov;
    document.body.classList.add('cine');
    this._enter();
  }
  _enter() {
    const s = this.shots[this.i];
    if (!s) return;
    this._snap = s.cut !== false;
    if (s.enter) s.enter();
    this._solveOcclusion(s);
    if (this.capEl) { this.capEl.textContent = s.caption || ''; this.capEl.classList.toggle('show', !!s.caption); }
  }
  skip() {
    if (!this.shots) return;
    const cb = this.onSkip;
    this.stop(true);
    if (cb) cb();
  }
  stop(skipped) {
    if (!this.shots) return;
    const cb = this.onEnd;
    this.shots = null; this.timeScale = 1;
    document.body.classList.remove('cine');
    if (this.capEl) this.capEl.classList.remove('show');
    const cam = this.game.camera;
    cam.fov = this._fov0 || 50; cam.updateProjectionMatrix();
    // 컨트롤로 자연스럽게 넘김: 마지막 시선 방향 기준으로 타깃 설정
    const c = this.game.controls;
    const look = this._smoothLook.clone();
    const g = this.game.grid.sample(look.x, look.z);
    c.target.set(look.x, g, look.z);
    c.update();
    if (cb) cb(skipped);
  }

  // 시선이 막히지 않는지 (보는 대상 바로 옆의 충돌은 대상 자체로 보고 무시)
  // 움직이는 파편은 금방 지나가므로 무시하고, 건물·남은 조각·지형(지도 밖 포함)만 봄
  _clear(look, pos) {
    const D = this.game.D;
    const dir = new THREE.Vector3().subVectors(pos, look);
    const len = dir.length();
    if (len < 8) return true;
    dir.divideScalar(len);
    const near = Math.min(len * 0.12, 60);
    const h = D.raycast(look, dir, len);
    if (h && h.dist > near && h.dist < len - 2) {
      const inf = h.info || {};
      if (inf.terrain || inf.b || (inf.chunk && inf.chunk.state === 0)) return false;
    }
    // 지도 밖 산: 선분을 따라 지면 높이 확인
    const g = this.game;
    if (g.groundAt) for (let i = 1; i < 12; i++) {
      const t = near + (len - near) * (i / 12);
      const x = look.x + dir.x * t, y = look.y + dir.y * t, z = look.z + dir.z * t;
      if (y < g.groundAt(x, z) - 1) return false;
    }
    return true;
  }
  // 샷을 시작할 때: 처음·중간·끝 시점의 카메라 위치가 건물·언덕에 가리면
  // 대상을 중심으로 돌리거나, 대상 쪽으로 당기거나, 위로 올려 가리지 않는 자리를 찾아 샷 전체에 적용
  _solveOcclusion(s) {
    this._rot = 0; this._lift = 0; this._pull = 0;
    if (!this.game.D || !this.game.D.raycast || s.noAvoid) return;
    const smp = [];
    for (const u of [0.02, 0.5, 0.95]) {
      const o = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: null, timeScale: 1, smooth: 0, fade: 0 };
      try { s.update(u * s.dur, u, o); } catch (e) { return; }
      smp.push(o);
    }
    if (!Cinematic._cands) {
      const c = [];
      const rots = [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1, 2.7, -2.7, Math.PI];
      for (const rot of rots) for (const pull of [0, 0.3, 0.55]) for (const lift of [0, 10, 25, 50, 90, 150, 240, 380])
        c.push({ rot, pull, lift, cost: Math.abs(rot) * 1.2 + pull * 2.2 + lift / 110 });
      c.sort((a, b) => a.cost - b.cost);
      Cinematic._cands = c;
    }
    const p = new THREE.Vector3();
    let tries = 0;
    for (const cd of Cinematic._cands) {
      if (++tries > 140) break;
      let ok = true;
      for (const o of smp) { this._apply(o.pos, o.look, cd.rot, cd.lift, p, cd.pull); if (!this._clear(o.look, p)) { ok = false; break; } }
      if (ok) { this._rot = cd.rot; this._lift = cd.lift; this._pull = cd.pull; return; }
    }
  }
  _apply(pos, look, rot, lift, out, pull = 0) {
    out.copy(pos);
    if (pull) out.lerp(look, pull);
    if (rot) { const dx = out.x - look.x, dz = out.z - look.z, c = Math.cos(rot), sn = Math.sin(rot); out.x = look.x + dx * c - dz * sn; out.z = look.z + dx * sn + dz * c; }
    out.y += lift;
    return out;
  }

  _fixTarget(pos, look) {
    const D = this.game.D;
    const out = this._tmpFix || (this._tmpFix = new THREE.Vector3());
    out.copy(pos);
    if (!D || !D.raycast) return out;
    const dir = this._tmpDir || (this._tmpDir = new THREE.Vector3());
    dir.subVectors(pos, look);
    const len = dir.length();
    if (len < 12) return out;
    dir.divideScalar(len);
    const h = D.raycast(look, dir, len);
    // 표적 바로 옆(보려는 건물 자체)은 무시, 중간을 가리는 건물만
    const solid = h && h.info && (h.info.b || (h.info.chunk && h.info.chunk.state === 0));
    if (solid && h.dist > Math.min(len * 0.12, 60) && h.dist < len - 2) out.copy(look).addScaledVector(dir, h.dist - 4);
    return out;
  }

  // dt: 실제 시간(카메라 부드럽게 따라가기), tdt: 게임 시간(샷 진행).
  // 샷 진행을 무기·물리와 같은 시간으로 돌려야 슬로모션 중에도 연출과 사건이 어긋나지 않음
  update(dt, tdt = dt) {
    if (!this.shots) return;
    let s = this.shots[this.i];
    this.t += tdt;
    while (s && this.t >= s.dur) {
      this.t -= s.dur; this.i++;
      s = this.shots[this.i];
      if (s) this._enter();
    }
    if (!s) { this.stop(false); return; }
    const out = { pos: this._pos, look: this._look, fov: null, timeScale: 1, smooth: 0, fade: 0 };
    s.update(this.t, clamp01(this.t / s.dur), out);
    if (this._rot || this._lift || this._pull) this._apply(out.pos, out.look, this._rot, this._lift, out.pos, this._pull);
    this.timeScale = out.timeScale; this.fade = out.fade;
    const cam = this.game.camera;
    const k = this._snap ? 1 : out.smooth > 0 ? 1 - Math.exp(-dt * (1 / out.smooth)) : 1;
    const cut = this._snap;
    this._snap = false;
    this._smoothPos.lerp(out.pos, k);
    this._smoothLook.lerp(out.look, k);
    if (k === 1) { this._smoothPos.copy(out.pos); this._smoothLook.copy(out.look); }
    // 지면 아래로 들어가지 않게
    const gy = this.game.groundAt ? this.game.groundAt(this._smoothPos.x, this._smoothPos.z) : this.game.grid.sample(this._smoothPos.x, this._smoothPos.z);
    if (this._smoothPos.y < gy + 2) this._smoothPos.y = gy + 2;
    // 건물에 가려지면 가린 건물 앞으로 당겨옴 (부드럽게)
    const fix = this._fixTarget(this._smoothPos, this._smoothLook);
    // 언덕(지도 밖 산 포함)이 시선을 가리면 카메라를 그만큼 올림
    if (this.game.groundAt) {
      const L = this._smoothLook, gA = this.game;
      let need = 0;
      for (let i = 1; i < 10; i++) {
        const t = i / 10;
        const x = L.x + (fix.x - L.x) * t, z = L.z + (fix.z - L.z) * t, y = L.y + (fix.y - L.y) * t;
        const d = gA.groundAt(x, z) + 3 - y;
        if (d > 0 && t > 0.15) need = Math.max(need, d / t);
      }
      if (need > 0) fix.y += Math.min(need, 600);
    }
    if (cut || !this._fix) this._fix = fix.clone();
    else this._fix.lerp(fix, 1 - Math.exp(-dt * 5));
    cam.position.copy(this._fix);
    cam.lookAt(this._smoothLook);
    if (out.fov && Math.abs(cam.fov - out.fov) > 0.01) { cam.fov = out.fov; cam.updateProjectionMatrix(); }
  }
}
