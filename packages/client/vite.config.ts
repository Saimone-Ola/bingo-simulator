import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Three.js and the R3F stack are large and change rarely: pinning them to
    // their own chunks means a gameplay patch does not invalidate the whole
    // vendor bundle in the player's cache.
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          // Keep shared React/Zustand dependencies out of the lazy 3D chunk.
          // Recursively capturing them makes the login preload Three.js too.
          includeDependenciesRecursively: false,
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
            { name: 'r3f', test: /[\\/]node_modules[\\/]@react-three[\\/]/ },
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|react-router[^\\/]*)[\\/]/ },
          ],
        },
      },
    },
    // The 3D vendor chunk is legitimately large and is lazily loaded behind the
    // auth screen; warn only for something genuinely unexpected.
    chunkSizeWarningLimit: 1200,
  },
});
