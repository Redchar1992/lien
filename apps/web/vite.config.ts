import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Project-site assets must remain under /lien/. Local development keeps /.
  base: process.env.GITHUB_PAGES === 'true' ? '/lien/' : '/',
})
