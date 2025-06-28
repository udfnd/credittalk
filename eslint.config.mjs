// eslint.config.mjs

import globals from "globals";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";
import rnEslintConfig from "@react-native/eslint-config";

export default [
  rnEslintConfig,

  pluginReact.configs.recommended,

  pluginReactHooks.configs.recommended,

  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },

    rules: {
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/jsx-filename-extension": [
        "warn",
        { extensions: [".tsx", ".jsx", ".js"] },
      ],
      "prettier/prettier": [
        "error",
        {
          semi: true,
          singleQuote: true,
          trailingComma: "all",
          printWidth: 80,
          tabWidth: 2,
          useTabs: false,
        },
      ],
    },

    settings: {
      react: {
        version: "detect",
      },
    },
  },

  eslintConfigPrettier,
];
