import globals from "globals";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";
import rnEslintConfig from "@react-native/eslint-config";

export default [
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    ...rnEslintConfig, // React Native 기본 설정 적용
    languageOptions: {
      ...rnEslintConfig.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2020,
      },
    },
    plugins: {
      ...rnEslintConfig.plugins,
      react: pluginReact,
      "react-hooks": pluginReactHooks,
    },
    rules: {
      ...rnEslintConfig.rules,
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      "react/jsx-filename-extension": [1, { extensions: [".tsx", ".jsx", ".js"] }],
      "react/prop-types": "off",
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
