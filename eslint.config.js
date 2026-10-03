import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `backend/` is the mirror of the API that runs on the VPS (see
  // backend/API-DEPLOY.md). It is Node code, not frontend code, and linting it
  // with the browser/react config only produces noise. (The folder is called
  // `backend/`, not `server/`, to stay clear of TanStack Start's SSR entry —
  // see API-DEPLOY.md.) `backend-patches/` holds one-shot server scripts kept
  // byte-identical to the copies that ran on the VPS, so they are not
  // reformatted either.
  { ignores: ["dist", ".output", ".vinxi", "backend", "backend-patches"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
