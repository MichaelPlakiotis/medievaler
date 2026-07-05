import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
// `base` is set for later GitHub Pages deploys (served from /medievaler/).
// It has no effect on local `npm run dev`.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
