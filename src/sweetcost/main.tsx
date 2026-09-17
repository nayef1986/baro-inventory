import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.tsx'
import { registerServiceWorker } from './lib/pwa.ts'
import './styles.css'

const root = document.getElementById('sweet-cost-root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

registerServiceWorker()
