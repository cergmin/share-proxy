import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

function createAdminPanelBannerPlugin(adminOrigin: string): Plugin {
  return {
    name: 'admin-panel-banner',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const resolvedOrigin = adminOrigin
          || server.resolvedUrls?.local[0]
          || server.resolvedUrls?.network[0]

        if (resolvedOrigin) {
          server.config.logger.info(`Admin panel URL: ${resolvedOrigin}`, {
            clear: false,
            timestamp: true,
          })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '')
  const adminOrigin = env.ADMIN_FRONTEND_ORIGIN || 'http://localhost:5173'

  return {
    plugins: [TanStackRouterVite(), react(), createAdminPanelBannerPlugin(adminOrigin)],
    envDir: '../../',
    envPrefix: ['VITE_', 'ADMIN_'],
    server: {
      proxy: {
        '/api': {
          target: env.ADMIN_API_ORIGIN || 'http://localhost:3000',
          changeOrigin: true,
        }
      }
    }
  }
})
