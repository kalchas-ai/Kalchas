import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Who may open the dev server: this machine by any of its names, and others on the local network by this machine's
 * addresses there (`npm run dev:lan`). Served on every address, Next.js otherwise blocks its scripts for all of them.
 */
const lan = [
  "localhost",
  "127.0.0.1",
  ...Object.values(networkInterfaces())
    .flat()
    .filter((x) => x && x.family === "IPv4" && !x.internal)
    .map((x) => x!.address),
];

const config: NextConfig = {
  // A second dev server beside the one already running (another database, another port) keeps its own build directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The engine uses a native SQLite module and resolves files relative to itself, so it must not be bundled.
  serverExternalPackages: ["@kalchas/core", "better-sqlite3"],
  allowedDevOrigins: lan,
};

export default config;
