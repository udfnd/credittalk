module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [ // plugins 배열이 없다면 새로 추가
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env', // import 시 사용할 이름 (예: import { SUPABASE_URL } from '@env';)
        path: '.env', // .env 파일 경로
        blacklist: null,
        whitelist: null,
        safe: false,
        allowUndefined: true,
      },
    ],
  ],
};
