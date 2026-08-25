import index from './index.html';

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    '/api/health': () =>
      Response.json({
        ok: true,
        runtime: `bun ${Bun.version}`,
        service: 'nodspice',
      }),
    '/*': index,
  },
});

console.log(`nodspice dev server: ${server.url}`);
