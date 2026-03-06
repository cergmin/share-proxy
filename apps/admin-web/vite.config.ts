import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '')

  return {
    plugins: [TanStackRouterVite(), react()],
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
