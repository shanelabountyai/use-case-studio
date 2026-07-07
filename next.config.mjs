/** @type {import('next').NextConfig} */
export default {
  webpack: (config, { isServer, webpack }) => {
    // pptxgenjs is isomorphic: it references node:fs / node:https / node:os /
    // node:path behind runtime Node guards, and its `exports` map bypasses its
    // own `browser` field, so webpack tries to bundle those built-ins for the
    // browser and errors. Stub them out of the CLIENT bundle only — the app
    // (server) is unaffected, and pptxgenjs takes its browser code paths at
    // runtime (Blob download), never touching fs/https there.
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:(fs|https|os|path)$/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, https: false, os: false, path: false,
      };
    }
    return config;
  },
};
