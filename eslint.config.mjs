import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import rnEslintConfig from "@react-native/eslint-config";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "node_modules/",
      "android/",
      "ios/",
      "build/",
      "coverage/",
      "*.js.map",
    ],
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      react: pluginReact,
    },
    rules: {
      ...rnEslintConfig.rules,
      ...pluginReact.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  eslintConfigPrettier, // 항상 맨 마지막에 위치해야 합니다.
];
