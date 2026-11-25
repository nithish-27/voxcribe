import type { Config } from "tailwindcss";

// Dark mode follows the OS (`media` strategy), no toggle needed.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
