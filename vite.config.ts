import { defineConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

export default defineConfig({
  plugins: [
    tanstackStart({
      server: { 
        preset: 'vercel',
        entry: 'server'
      }
    }),
    viteReact(),
    tailwindcss(),
    tsConfigPaths(),
  ],
});
