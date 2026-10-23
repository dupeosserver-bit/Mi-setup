// Configuración de lint compartida por todo el monorepo.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/dist-demo/**", "**/node_modules/**", "**/drizzle/**", ".claude/**", "docs/disenos-*/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "error"
    }
  }
);
