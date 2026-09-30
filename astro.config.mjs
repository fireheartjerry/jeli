import { defineConfig } from "astro/config";
import svgPrecision from "./integrations/svg-precision.mjs";

export default defineConfig({
  site: "https://yuzeli.ca",
  trailingSlash: "never",
  build: { inlineStylesheets: "always" },
  devToolbar: { enabled: false },
  integrations: [svgPrecision()],
});
