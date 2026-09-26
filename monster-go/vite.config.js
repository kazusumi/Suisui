import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

// 開発時だけ /api/* を Netlify Function (netlify/functions/api.mjs) に流す。
// netlify-cli が無くても `npm run dev` でゲーム・管理画面・API が一通り動く。
function netlifyFunctionsDev() {
  return {
    name: 'netlify-functions-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        try {
          const mod = await server.ssrLoadModule('/netlify/functions/api.mjs');
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          });
          const response = await mod.default(request, {});
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['LOCAL_DATABASE_URL', 'ADMIN_PASSWORD']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [netlifyFunctionsDev()],
    build: {
      target: 'es2020',
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          admin: resolve(import.meta.dirname, 'admin/index.html'),
          db: resolve(import.meta.dirname, 'admin/db.html'),
        },
      },
    },
    server: { host: true },
  };
});
