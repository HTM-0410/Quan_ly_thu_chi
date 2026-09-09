import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

function devOcrProxyPlugin(env: Record<string, string>): Plugin {
  const handler = async (req: any, res: any, next: any) => {
    const url = req.url?.split('?')[0];
    if (req.method === 'POST' && (url === '/api/ocr' || url === '/api/bill-ocr')) {
      const startTime = Date.now();
      try {
        const contentLength = req.headers['content-length']
          ? `${(Number(req.headers['content-length']) / 1024).toFixed(1)} KB`
          : 'unknown size';
        console.log(`[dev-ocr-proxy] ──> ${req.method} ${url} (${contentLength})`);

        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          console.warn('[dev-ocr-proxy] ✗ Thiếu header Authorization Bearer');
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Authentication required' }));
          return;
        }

        // Prefer a server-only variable. Keep the VITE_ name only as a local
        // compatibility fallback because VITE_ variables are client-visible.
        const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          console.warn('[dev-ocr-proxy] ✗ Thiếu VITE_GEMINI_API_KEY trong .env.local');
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'OCR service is not configured (missing VITE_GEMINI_API_KEY in .env.local)',
              code: 'OCR_SERVICE_UNCONFIGURED',
            }),
          );
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const bodyBuffer = Buffer.concat(chunks);
        console.log(`[dev-ocr-proxy] Body đọc xong: ${(bodyBuffer.length / 1024).toFixed(1)} KB`);

        const defaultModel = 'gemini-3.5-flash-lite';
        const allowedModels = new Set([defaultModel, 'gemini-3.6-flash', 'gemini-2.5-flash']);
        const rawModel = env.VITE_OCR_MODEL || env.OCR_MODEL || defaultModel;
        const model = allowedModels.has(rawModel) ? rawModel : defaultModel;
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

        console.log(`[dev-ocr-proxy] Đang gọi Gemini model "${model}"...`);

        // Timeout 45s bảo vệ để tránh treo proxy vô thời hạn
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          abortController.abort();
        }, 45_000);

        let upstreamRes: Response;
        try {
          upstreamRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: bodyBuffer,
            signal: abortController.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const duration = Date.now() - startTime;
        const upstreamBody = await upstreamRes.text();
        console.log(`[dev-ocr-proxy] <── Gemini phản hồi status ${upstreamRes.status} sau ${duration}ms`);

        res.statusCode = upstreamRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(upstreamBody);
      } catch (err: any) {
        const duration = Date.now() - startTime;
        const isTimeout = err?.name === 'AbortError';
        console.error(`[dev-ocr-proxy] ✗ Lỗi OCR proxy sau ${duration}ms:`, isTimeout ? 'Timeout 45s khi gọi Gemini' : (err?.message || err));
        res.statusCode = isTimeout ? 504 : 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: isTimeout
              ? 'Hết thời gian chờ phản hồi từ Gemini (timeout 45s). Vui lòng thử lại.'
              : 'OCR provider error: ' + (err?.message || String(err)),
          }),
        );
      }
      return;
    }
    next();
  };

  return {
    name: 'dev-ocr-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const env = loadEnv(mode, __dirname, '');

  return {
    plugins: [react(), devOcrProxyPlugin(env)],

    // Cho phép deploy dưới sub-path, ví dụ https://example.com/app/
    // Override bằng VITE_BASE_PATH=./
    base: process.env.VITE_BASE_PATH || './',

    server: {
      port: 8080,
      host: true,
      strictPort: false,
    },
    preview: {
      port: 8080,
      host: true,
      strictPort: true,
    },

    build: {
      // Source map giúp debug production mà không leak code nguồn (chỉ map line)
      sourcemap: isProd ? 'hidden' : true,

      // Tăng ngưỡng warning — chunk 1MB vẫn OK cho web app này.
      // Tách chunk vendor/recharts thành file riêng để browser cache tốt hơn.
      chunkSizeWarningLimit: 1000,

      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-charts': ['recharts'],
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },

      // Minify mặc định (esbuild). Có thể thay terser nếu cần nhỏ hơn nữa.
      minify: 'esbuild',
      target: 'es2020',
      cssMinify: true,
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },

    // Optimize deps để pre-bundle các lib lớn (Supabase).
    optimizeDeps: {
      include: ['@supabase/supabase-js', 'recharts', 'react-router-dom'],
    },
  };
});
