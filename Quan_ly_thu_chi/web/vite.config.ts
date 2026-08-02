import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
    plugins: [react()],

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