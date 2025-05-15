import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import React from 'react';
import {
  Linking,
  Platform,
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
} from 'react-native';
import {
  NavigationContainer,
  EventArg,
  useNavigation,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { AuthProvider, useAuth } from './src/context/AuthContext';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import ReportScreen from './src/screens/ReportScreen';
import UnifiedSearchScreen from './src/screens/UnifiedSearchScreen';
import SearchBaseScreen from './src/screens/SearchBaseScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import SignInScreen from './src/screens/SignInScreen';
import NoticeListScreen from './src/screens/NoticeListScreen';
import NoticeDetailScreen from './src/screens/NoticeDetailScreen';
import ArrestNewsScreen from './src/screens/ArrestNewsScreen';
import ChatScreen from './src/screens/ChatScreen';
import CommunityListScreen from './src/screens/CommunityListScreen';
import CommunityPostDetailScreen from './src/screens/CommunityPostDetailScreen';
import CommunityPostCreateScreen from './src/screens/CommunityPostCreateScreen';

export type RootStackParamList = {
  MainApp: undefined;
  Report: undefined;
  NumericUnifiedSearch: {
    searchTerm: string;
    searchType: string;
    title: string;
  };
  UnifiedSearch: {
    searchType: string;
    title: string;
    initialSearchTerm?: string;
  };
  NoticeList: undefined;
  NoticeDetail: { noticeId: number; noticeTitle: string };
  ArrestNews: undefined;
  SignIn: undefined;
  SignUp: undefined;
};

export type CommunityStackParamList = {
  CommunityList: undefined;
  CommunityPostDetail: { postId: number; postTitle: string };
  CommunityPostCreate: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const CommunityNativeStack =
  createNativeStackNavigator<CommunityStackParamList>();
const Tab = createBottomTabNavigator();

const KOREA_FINANCIAL_CRIME_PREVENTION_CENTER_URL =
  'https://open.kakao.com/o/gKmnz1Ae';

function CommunityStack() {
  return (
    <CommunityNativeStack.Navigator
      id={undefined}
      initialRouteName="CommunityList"
    >
      <CommunityNativeStack.Screen
        name="CommunityList"
        component={CommunityListScreen}
        options={{ title: '커뮤니티' }}
      />
      <CommunityNativeStack.Screen
        name="CommunityPostDetail"
        component={CommunityPostDetailScreen}
      />
      <CommunityNativeStack.Screen
        name="CommunityPostCreate"
        component={CommunityPostCreateScreen}
        options={{ title: '새 글 작성' }}
      />
    </CommunityNativeStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      id={undefined}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = '';
          if (route.name === 'SearchTab') {
            iconName = focused ? 'magnify' : 'magnify';
          } else if (route.name === 'ChatTab') {
            iconName = focused ? 'chat-processing' : 'chat-processing-outline';
          } else if (route.name === 'CommunityTab') {
            iconName = focused ? 'forum' : 'forum-outline';
          } else if (route.name === 'MyTab') {
            iconName = focused ? 'account-circle' : 'account-circle-outline';
          } else if (route.name === 'HelpCenterTab') {
            iconName = focused ? 'help-circle' : 'help-circle-outline';
          }
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#3d5afe',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 90 : 65,
          paddingBottom: Platform.OS === 'ios' ? 30 : 10,
          paddingTop: 5,
        },
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 11,
          paddingBottom: Platform.OS === 'ios' ? 0 : 5,
        },
      })}
    >
      <Tab.Screen
        name="SearchTab"
        component={HomeScreen}
        options={{ title: '검색' }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatScreen}
        options={{ title: '채팅' }}
      />
      <Tab.Screen
        name="CommunityTab"
        component={CommunityStack}
        options={{ title: '커뮤니티' }}
      />
      <Tab.Screen
        name="MyTab"
        component={SettingsScreen}
        options={{ title: 'MY' }}
      />
      <Tab.Screen
        name="HelpCenterTab"
        component={View} // Dummy
        options={{ title: '헬프센터' }}
        listeners={{
          tabPress: (e: EventArg<'tabPress', true, undefined>) => {
            e.preventDefault();
            Linking.openURL(KOREA_FINANCIAL_CRIME_PREVENTION_CENTER_URL).catch(
              (err) => console.error("Couldn't open link", err),
            );
          },
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3d5afe" />
        <Text>세션 확인 중...</Text>
      </View>
    );
  }

  return (
    <RootStack.Navigator id={undefined}>
      {user ? (
        <>
          <RootStack.Screen
            name="MainApp"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="Report"
            component={ReportScreen}
            options={{ title: '사기 정보 입력' }}
          />
          <RootStack.Screen
            name="NumericUnifiedSearch"
            component={SearchBaseScreen}
          />
          <RootStack.Screen
            name="UnifiedSearch"
            component={UnifiedSearchScreen}
            options={{ title: '통합 검색' }}
          />
          <RootStack.Screen
            name="NoticeList"
            component={NoticeListScreen}
            options={{ title: '공지사항' }}
          />
          <RootStack.Screen
            name="NoticeDetail"
            component={NoticeDetailScreen}
          />
          <RootStack.Screen
            name="ArrestNews"
            component={ArrestNewsScreen}
            options={{ title: '검거소식' }}
          />
        </>
      ) : (
        <>
          <RootStack.Screen
            name="SignIn"
            component={SignInScreen}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="SignUp"
            component={SignUpScreen}
            options={{ headerShown: false }}
          />
        </>
      )}
    </RootStack.Navigator>
  );
}

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
});

export default App;
