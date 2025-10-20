import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [cesium()],
  // In vite.config.js

  server: {
    proxy: {
      // This rule now points to your Python server!
      '/api': {
        target: 'http://localhost:8001', // <-- THE NEW PYTHON SERVER PORT
        changeOrigin: true,
        // This rewrite is simpler and better.
        // It removes '/api' before sending to the backend.
        // So a frontend call to '/api/czml/101955'
        // becomes a request to '/czml/101955' on the Python server.
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // LEAVE THESE OTHER PROXIES AS-IS! They are for external data.
      '/nasa-api': {
        target: 'https://ssd-api.jpl.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nasa-api/, ''),
      },
      '/usgs-api': {
        target: 'https://earthquake.usgs.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/usgs-api/, ''),
      },
    },
  },
});