module.exports = {
  extends: [
    'react-native',
    'airbnb', // Airbnb 스타일 가이드 적용
    'plugin:react/recommended', // React 관련 규칙 적용
    'plugin:react-hooks/recommended', // React Hooks 관련 규칙 적용
    'prettier', // Prettier와의 규칙 충돌을 피하기 위해 추가
    'plugin:prettier/recommended', // Prettier 규칙 적용
  ],
  parser: 'babel-eslint', // Babel 파서를 사용
  parserOptions: {
    ecmaVersion: 2020, // 최신 ECMAScript 버전 사용
    sourceType: 'module',
  },
  env: {
    browser: true,
    es2020: true,
    node: true,
  },
  settings: {
    react: {
      version: 'detect', // 자동으로 React 버전 감지
    },
  },
  rules: {
    'react/jsx-filename-extension': [1, { extensions: ['.jsx', '.js'] }], // JSX 파일 확장자 설정
    'react/prop-types': 'off', // PropTypes 검사 끄기 (React 18부터는 타입스크립트를 사용하거나 PropTypes를 자주 사용하지 않음)
    'prettier/prettier': [
      'error',
      {
        semi: true, // 세미콜론 추가
        singleQuote: true, // 작은 따옴표 사용
        trailingComma: 'all', // 후행 쉼표 추가
        printWidth: 80, // 줄 길이 80자 제한
        tabWidth: 2, // 탭 너비 2
        useTabs: false, // 탭 대신 스페이스 사용
      },
    ],
  },
};
