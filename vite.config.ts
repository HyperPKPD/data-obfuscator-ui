import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { brand, dev, server } from './app.config';

// In development the API server (server/index.ts) runs on its own port and Vite proxies /api to it.
const apiPort = process.env.PORT ?? String(server.port);

// Puts the name and description from app.config.ts into index.html.
const fromConfig = {
  name: 'app-config-html',
  transformIndexHtml: (html: string) => html.replaceAll('%APP_NAME%', brand.name).replaceAll('%APP_DESCRIPTION%', brand.description),
};

export default defineConfig({
  // Relative asset paths: the built page works at the root of a host name and in a sub-folder
  // such as https://example.org/data-obfuscator/ without rebuilding. The address must end in a slash.
  base: './',
  plugins: [react(), tailwindcss(), fromConfig],
  server: {
    port: dev.webPort,
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
