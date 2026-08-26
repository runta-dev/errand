import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dist-electron", "out", "release", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: { ...reactHooks.configs.recommended.rules, "react-hooks/set-state-in-effect": "off", "react-refresh/only-export-components": ["warn", { allowConstantExport: true }] }
  },
  { files: ["electron/**/*.ts", "scripts/**/*.mjs"], languageOptions: { globals: globals.node } }
);
