import * as esbuild from 'esbuild';
await esbuild.build({ entryPoints: ['src/proto/main.js'], bundle: true, format: 'iife', outfile: 'app/proto.js', logLevel: 'warning' });
console.log('proto ok');
