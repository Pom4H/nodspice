import { exists, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = normalize(join(import.meta.dir, '..', 'dist'));
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let file = normalize(join(root, relative || 'index.html'));
    if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 });
    if (!(await exists(file)) || (await stat(file)).isDirectory()) file = join(root, 'index.html');
    return new Response(Bun.file(file), {
      headers: { 'content-type': mime[extname(file)] ?? 'application/octet-stream' },
    });
  },
});

console.log(`nodspice production server: http://localhost:${process.env.PORT ?? 3000}`);
