import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // React itself barely ever changes between app deploys, but it was bundled inside the
        // same chunk as every game rule and every screen — so a one-line copy edit invalidated
        // the browser's cache of react/react-dom right along with it. Splitting it out means a
        // returning player's cache of the (much larger, unchanged) framework code survives an
        // app update; only the smaller app chunk needs re-downloading.
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
