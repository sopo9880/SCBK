// 가벼운 구간별 프로파일러 (F3 오버레이와 벤치마크용)
export const PROF = {
  cur: Object.create(null),
  last: Object.create(null),
  avg: Object.create(null),
  peak: Object.create(null),
  add(name, ms) { this.cur[name] = (this.cur[name] || 0) + ms; },
  time(name, fn) { const t = performance.now(); try { return fn(); } finally { this.add(name, performance.now() - t); } },
  endFrame() {
    for (const k in this.avg) if (!(k in this.cur)) this.cur[k] = 0;
    for (const k in this.cur) {
      const v = this.cur[k];
      this.avg[k] = this.avg[k] === undefined ? v : this.avg[k] * 0.9 + v * 0.1;
      this.peak[k] = Math.max((this.peak[k] || 0) * 0.995, v);
    }
    this.last = this.cur; this.cur = Object.create(null);
  },
  reset() { this.cur = Object.create(null); this.last = Object.create(null); this.avg = Object.create(null); this.peak = Object.create(null); },
};
