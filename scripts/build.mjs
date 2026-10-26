// 번들: 물리 워커를 먼저 문자열로 빌드해 메인 번들에 넣는다 (Blob 워커 → file:// 에서도 동작)
import * as esbuild from 'esbuild';
const minify = !process.argv.includes('--dev');
const w = await esbuild.build({ entryPoints: ['src/physics/worker.js'], bundle: true, format: 'iife', write: false, minify, logLevel: 'warning' });
const workerSrc = w.outputFiles[0].text;
await esbuild.build({
  entryPoints: ['src/app.js'], bundle: true, format: 'iife', outfile: 'app/bundle.js', minify, logLevel: 'warning',
  define: { __PHYS_WORKER_SRC__: JSON.stringify(workerSrc) },
});
console.log(`bundle ok (worker ${(workerSrc.length / 1e6).toFixed(1)} MB)`);
