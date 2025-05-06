const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const nodeLibs = require('node-libs-react-native');

nodeLibs.stream = require.resolve('stream-browserify'); // stream polyfill
nodeLibs.net = require.resolve('node-libs-react-native/mock/net'); // net mock
nodeLibs.tls = require.resolve('node-libs-react-native/mock/tls'); // tls mock
nodeLibs.crypto = require.resolve('react-native-quick-crypto'); // crypto polyfill (quick-crypto 설치 필요시) 또는 node-libs-react-native 기본 crypto
nodeLibs.buffer = require.resolve('buffer/'); // Buffer polyfill

const config = {
  resolver: {
    // extraNodeModules 설정을 통해 Node.js 코어 모듈 요청을 polyfill로 리디렉션
    extraNodeModules: nodeLibs,
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
