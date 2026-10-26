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
    if (h && h.info && h.info.b && h.dist > len * 0.3 && h.dist < len - 2) out.copy(look).addScaledVector(dir, h.dist - 4);
    return out;
  }

  update(dt) {
    if (!this.shots) return;
    let s = this.shots[this.i];
    this.t += dt;
    while (s && this.t >= s.dur) {
      this.t -= s.dur; this.i++;
      s = this.shots[this.i];
      if (s) this._enter();
    }
    if (!s) { this.stop(false); return; }
    const out = { pos: this._pos, look: this._look, fov: null, timeScale: 1, smooth: 0, fade: 0 };
    s.update(this.t, clamp01(this.t / s.dur), out);
    this.timeScale = out.timeScale; this.fade = out.fade;
    const cam = this.game.camera;
    const k = this._snap ? 1 : out.smooth > 0 ? 1 - Math.exp(-dt * (1 / out.smooth)) : 1;
    const cut = this._snap;
    this._snap = false;
    this._smoothPos.lerp(out.pos, k);
    this._smoothLook.lerp(out.look, k);
    if (k === 1) { this._smoothPos.copy(out.pos); this._smoothLook.copy(out.look); }
    // 지면 아래로 들어가지 않게
    const gy = this.game.grid.sample(this._smoothPos.x, this._smoothPos.z);
    if (this._smoothPos.y < gy + 2) this._smoothPos.y = gy + 2;
    // 건물에 가려지면 가린 건물 앞으로 당겨옴 (부드럽게)
    const fix = this._fixTarget(this._smoothPos, this._smoothLook);
    if (cut || !this._fix) this._fix = fix.clone();
    else this._fix.lerp(fix, 1 - Math.exp(-dt * 5));
    cam.position.copy(this._fix);
    cam.lookAt(this._smoothLook);
    if (out.fov && Math.abs(cam.fov - out.fov) > 0.01) { cam.fov = out.fov; cam.updateProjectionMatrix(); }
  }
}
