import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Public origin (e.g. https://flashpass.in) so share-preview image URLs are absolute; '' keeps them relative
  const siteUrl = (env.VITE_SITE_URL || '').replace(/\/+$/, '')

  return {
    plugins: [
      react(),
      {
        name: 'flashpass-site-url',
        transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl)
      },
      {
        name: 'flashpass-build-version',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ buildId: String(Date.now()) })
          })
        }
      }
    ],
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:5000',
          ws: true,
        }
      }
    }
  }
})
