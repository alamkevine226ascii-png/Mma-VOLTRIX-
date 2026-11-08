import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Application 100 % frontend : export statique (dossier out/) — aucun
  // serveur, aucune route API. Hébergeable sur GitHub Pages, Netlify, etc.
  output: "export",
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
