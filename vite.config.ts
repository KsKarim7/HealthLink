import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig(async ({ command }) => {
  // Nitro turns the SSR build into a deployable server bundle. It is a
  // build-time concern only, and the package is a devDependency, so it is
  // imported lazily and never touches the dev server.
  const buildPlugins = [];
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    // Zero-config target detection still wins (NITRO_PRESET, Vercel, Netlify,
    // Cloudflare Pages); this is only the fallback when nothing is detected.
    buildPlugins.push(nitro({ defaultPreset: "cloudflare-module" }));
  }

  return {
    server: {
      // Kept explicit so the dev URL stays stable at http://localhost:8080,
      // and still reachable from a phone on the same network for testing the
      // mobile layouts — both of which the previous config provided.
      host: true,
      port: 8080,
    },
    resolve: {
      alias: {
        "@": srcDir,
      },
      // A second copy of React (or of the query client) breaks hooks and
      // context across the SSR/client boundary.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      // Pre-bundle the always-present client deps so a mid-session
      // re-optimization does not rotate the dep hash and 504 open tabs.
      // React core only: pulling in @tanstack/react-start would drag its
      // node:async_hooks server entry into the client bundle.
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Fail the build if client code imports server-only modules.
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
        // Route TanStack Start's server entry through src/server.ts, our SSR
        // error wrapper. nitro builds from this.
        server: { entry: "server" },
      }),
      ...buildPlugins,
      viteReact(),
    ],
  };
});
