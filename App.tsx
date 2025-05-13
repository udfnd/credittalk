import 'react-native-get-random-values';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import ReportScreen from './src/screens/ReportScreen';
import UnifiedSearchScreen from './src/screens/UnifiedSearchScreen';
import AccountSearchScreen from './src/screens/AccountSearchScreen';
import PhoneSearchScreen from './src/screens/PhoneSearchScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SignUpScreen from './src/screens/SignUpScreen';

const Stack = createNativeStackNavigator();

function App(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator id={undefined} initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: '크레디톡 홈' }}
        />
        <Stack.Screen
          name="Report"
          component={ReportScreen}
          options={{ title: '사기 정보 입력' }}
        />
        <Stack.Screen
          name="UnifiedSearch"
          component={UnifiedSearchScreen}
          options={{ title: '통합 검색' }}
        />
        <Stack.Screen
          name="AccountSearch"
          component={AccountSearchScreen}
          options={{ title: '사기 계좌 검색' }}
        />
        <Stack.Screen
          name="PhoneSearch"
          component={PhoneSearchScreen}
          options={{ title: '사기 번호 검색' }}
        />
        {/* 설정 화면 추가 */}
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: '설정' }}
        />
        <Stack.Screen
          name="SignUp"
          component={SignUpScreen} // 회원가입 화면을 추가
          options={{ title: '회원가입' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default App;
