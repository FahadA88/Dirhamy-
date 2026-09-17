import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
  A build that fits in one file.

  The normal build is a page plus assets, served by a web server. An Artifact is a single HTML
  document on a host that will not fetch anything from anywhere else, so everything has to be
  inside it: the script, the stylesheet, the two lazily-loaded chunks and all three fonts.

  This config exists alongside the real one rather than replacing it — the site that ships is
  still code-split, because there is a server there to serve the pieces.
*/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-artifact',
    // Fonts and icons become data: URIs instead of files. The largest is 46KB and base64 costs
    // a third on top, which is nothing against the budget.
    assetsInlineLimit: 10 * 1024 * 1024,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Create and the online lobby are dynamic imports. On a server that is the right call;
        // here there is nothing to fetch them from, so they get folded into the one bundle.
        inlineDynamicImports: true,
      },
    },
  },
});
