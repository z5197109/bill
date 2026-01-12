import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vitePluginImp from 'vite-plugin-imp'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    vitePluginImp({
      libList: [
        {
          libName: 'antd',
          style: (name) => `antd/es/${name}/style`,
        },
      ],
    }),
  ],
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  build: {
    outDir: path.resolve(__dirname, '../static/react'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          antd: ['antd', '@ant-design/icons', 'moment'],
        },
      },
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
})
