// 무기 연출용 카메라 샷 도우미
import * as THREE from 'three';
import { ease } from '../cinematic.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const val = (x) => (typeof x === 'function' ? x() : x);

// 연출 카메라를 쓸 수 있으면 game 반환
export function cineGame(A) {
  const g = A.ctx.game;
  return g && A.opts.cinematic ? g : null;
}

// 중심을 돌며 바라보기
export function orbit(center, { dist = 300, h = 80, a0 = 0, a1 = 0.6, dur = 4, fov = 50, look = 0, caption = '', ts = 1, smooth = 0.15, cut = true } = {}) {
  return { dur, caption, cut, update: (t, u, out) => {
    const c = val(center); const a = a0 + (a1 - a0) * ease.inOut(u);
    out.pos.set(c.x + Math.cos(a) * val(dist), c.y + val(h), c.z + Math.sin(a) * val(dist));
    out.look.set(c.x, c.y + val(look), c.z); out.fov = fov; out.timeScale = val(ts); out.smooth = smooth;
  } };
}

// 움직이는 대상을 뒤에서 따라가기 (dir: 진행 방향)
export function chase(getPos, getDir, { back = 40, up = 12, side = 0, ahead = 40, dur = 3, fov = 58, caption = '', ts = 1, smooth = 0.08, cut = true } = {}) {
  const s = v3(), d = v3();
  return { dur, caption, cut, update: (t, u, out) => {
    const p = getPos(); d.copy(getDir()); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
    s.set(-d.z, 0, d.x); if (s.lengthSq() < 1e-6) s.set(1, 0, 0); s.normalize();
    out.pos.copy(p).addScaledVector(d, -back).addScaledVector(s, side); out.pos.y += up;
    out.look.copy(p).addScaledVector(d, ahead); out.fov = fov; out.timeScale = val(ts); out.smooth = smooth;
  } };
}

// 고정 위치에서 대상 바라보기
export function watch(pos, look, { dur = 3, fov = 50, caption = '', ts = 1, smooth = 0.12, fade = 0, cut = true } = {}) {
  return { dur, caption, cut, update: (t, u, out) => {
    out.pos.copy(val(pos)); out.look.copy(val(look)); out.fov = typeof fov === 'function' ? fov(u) : fov; out.timeScale = typeof ts === 'function' ? ts(u) : ts; out.smooth = smooth;
    out.fade = typeof fade === 'function' ? fade(u) : fade;
  } };
}

// 카메라 → 대상 수평 방향
export function camDir(cam, p) { const f = v3().subVectors(p, cam.position); f.y = 0; return f.lengthSq() > 1e-6 ? f.normalize() : v3(0, 0, -1); }
