import { defineConfig } from 'vitest/config';

// Scoped explicitly to this directory's root: albaroo lives inside the baro-inventory
// repo alongside an unrelated Vite app, and without `root` here Vitest walks up and
// picks up that app's vite.config.js instead of this project's.
export default defineConfig({
  root: __dirname,
  test: {
    environment: 'node'
  }
});
