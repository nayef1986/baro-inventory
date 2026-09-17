import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        // تطبيق باروو الحالي — بدون تغيير
        main: resolve(import.meta.dirname, 'index.html'),
        // SWEET COST — تطبيق مستقل على /sweet-cost.html
        sweetcost: resolve(import.meta.dirname, 'sweet-cost/index.html'),
      },
    },
  },
})
