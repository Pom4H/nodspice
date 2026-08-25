import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const result = await Bun.build({
  entrypoints: ['./index.html'],
  outdir: './dist',
  minify: true,
  sourcemap: 'linked',
  target: 'browser',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

await cp('public/favicon.svg', 'dist/favicon.svg');

for (const output of result.outputs) {
  console.log(`${output.path}  ${(output.size / 1024).toFixed(1)} KB`);
}
