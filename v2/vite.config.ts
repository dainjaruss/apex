import { defineConfig } from 'vitest/config';
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
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: [
        'src/lib/traitAverage.ts',
        'src/lib/forcedDistribution.ts',
        'src/lib/paygrade.ts',
        'src/lib/navyDate.ts',
        'src/lib/permissions.ts',
        'src/lib/summaryGroupEligibility.ts',
        'src/lib/summaryGroupService.ts',
        'src/lib/commentFit.ts',
        'src/lib/validationEngine.ts',
        'src/lib/routingService.ts',
        // newly tested files
        'src/lib/traitStandards.ts',
        'src/lib/formDefinitions.ts',
        'src/lib/sharepointService.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});

