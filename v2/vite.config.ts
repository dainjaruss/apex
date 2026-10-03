import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: 'strip-file-redirect-from-dist',
      transformIndexHtml(html) {
        return html.replace(/<!-- FILE_REDIRECT_START -->[\s\S]*?<!-- FILE_REDIRECT_END -->/, '');
      },
    },
  ],
  base: './', // Relative base for zero-server deployment (SharePoint/Forge/Local file://)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
