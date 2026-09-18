import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { rm } from 'node:fs/promises'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = import.meta.dirname

// بناء الجذر لتطبيق باروو وحده.
//
// COCO CAKE يُنشر من مشروع Vercel مستقل جذره deploy/coco-cake، ولا
// يدخل هنا: قاعدته مفتوحة بلا بوابة دخول، فكل رابط إضافي يفتحه توسيع
// للكشف. البناء هنا لا يحمل صفحته ولا حزمته، وهذا المكوّن يمسح أصول
// الـPWA التي ينسخها Vite تلقائياً من public/ — وإلا بقيت أيقوناته
// وملف manifest على روابط باروو، ومعها service worker قديم قد يخدم
// نسخة مخبّأة لمن سبق أن فتحه من هناك.
const excludeSweetCost = {
  name: 'exclude-sweet-cost',
  apply: 'build',
  closeBundle: () => rm(resolve(root, 'dist/sweet-cost'), { recursive: true, force: true }),
}

export default defineConfig({
  plugins: [react(), tailwindcss(), excludeSweetCost],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
      },
    },
  },
})
