import proxy from 'http2-proxy';

/** @type {import("snowpack").SnowpackUserConfig } */
export default {
  mount: {
    /* ... */
  },
  plugins: [
    /* ... */
  ],
  routes: [
    /* Enable an SPA Fallback in development: */
    // {"match": "routes", "src": ".*", "dest": "/index.html"},

    {
      src: '/flybot/.*',
      dest: (req, res) => {

        return proxy.web(req, res, {
          hostname: '72.250.142.109',
          port: 3000,
        });
      },
    },

  ],
  optimize: {
    /* Example: Bundle your final build: */
    // "bundle": true,
  },
  packageOptions: {
    polyfillNode: true
    /* ... */
  },
  devOptions: {
    port: 3001,
    open: 'none'
    /* ... */
  },
  buildOptions: {
    /* ... */
  }
}
