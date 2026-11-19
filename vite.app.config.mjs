import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./src/web/app/", import.meta.url)), publicDir: false,
  build: { outDir: fileURLToPath(new URL("./dist/app/", import.meta.url)), emptyOutDir: true },
  server: { host: "127.0.0.1", port: 5174, strictPort: true, proxy: {
    "/api": { target: "http://127.0.0.1:8787", changeOrigin: true, configure(proxy) {
      proxy.on("proxyReq", (outgoing, incoming) => {
        if (incoming.headers.origin === "http://127.0.0.1:5174") outgoing.setHeader("origin", "http://127.0.0.1:8787");
      });
    } },
  } },
});
