import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Gera /sw.js a partir de src/pwa/sw.js com uma versão nova a cada build:
// o arquivo muda a cada deploy, então o navegador troca o service worker
// e o app instalado se atualiza sozinho (ver src/pwa/registrar.js).
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle() {
      const modelo = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: modelo.replace("'__VERSAO__'", `'${Date.now()}'`) })
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    headers: {
      // Permite que o popup do Google Auth use window.closed sem COOP warning
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
  },
})
