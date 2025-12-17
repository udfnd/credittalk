import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import {
  NavigationContainer,
  useNavigationContainerRef,
  NavigatorScreenParams,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import NaverLogin from '@react-native-seoul/naver-login';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import notifee from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  wireMessageHandlers,
  openFromPayloadOnce,
  updatePushTokenOnLogin,
  setupTokenRefreshListener,
  requestNotificationPermissionAndroid,
  ensureNotificationChannel,
  drainQueuedTap,
} from './src/lib/push';

import HomeScreen from './src/screens/HomeScreen';
import ReportScreen from './src/screens/ReportScreen';
import UnifiedSearchScreen from './src/screens/UnifiedSearchScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import SignInScreen from './src/screens/SignInScreen';
import NoticeListScreen from './src/screens/NoticeListScreen';
import NoticeDetailScreen from './src/screens/NoticeDetailScreen';
import NoticeEditScreen from './src/screens/NoticeEditScreen';
import ArrestNewsListScreen from './src/screens/ArrestNewsListScreen';
import ArrestNewsCreateScreen from './src/screens/ArrestNewsCreateScreen';
import ArrestNewsDetailScreen from './src/screens/ArrestNewsDetailScreen';
import ArrestNewsEditScreen from './src/screens/ArrestNewsEditScreen';
// import ChatListScreen from './src/screens/ChatListScreen';
// import ChatMessageScreen from './src/screens/ChatMessageScreen';
// import NewChatScreen from './src/screens/NewChatScreen';
import CommunityListScreen from './src/screens/CommunityListScreen';
import CommunityPostDetailScreen from './src/screens/CommunityPostDetailScreen';
import CommunityPostCreateScreen from './src/screens/CommunityPostCreateScreen';
import CommunityPostEditScreen from './src/screens/CommunityPostEditScreen';
import ReviewListScreen from './src/screens/ReviewListScreen';
import ReviewDetailScreen from './src/screens/ReviewDetailScreen';
import ReviewEditScreen from './src/screens/ReviewEditScreen';
import ReviewCreateScreen from './src/screens/ReviewCreateScreen';
import IncidentPhotoListScreen from './src/screens/IncidentPhotoListScreen';
import IncidentPhotoCreateScreen from './src/screens/IncidentPhotoCreateScreen';
import IncidentPhotoDetailScreen from './src/screens/IncidentPhotoDetailScreen';
import IncidentPhotoEditScreen from './src/screens/IncidentPhotoEditScreen';
import MyReportsScreen from './src/screens/MyReportsScreen';
import NewCrimeCaseListScreen from './src/screens/NewCrimeCaseListScreen';
import NewCrimeCaseCreateScreen from './src/screens/NewCrimeCaseCreateScreen';
import NewCrimeCaseDetailScreen from './src/screens/NewCrimeCaseDetailScreen';
import NewCrimeCaseEditScreen from './src/screens/NewCrimeCaseEditScreen';
import VoiceAnalysisScreen from './src/screens/VoiceAnalysisScreen';
import FindEmailScreen from './src/screens/FindEmailScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import UpdatePasswordScreen from './src/screens/UpdatePasswordScreen';
import HelpDeskListScreen from './src/screens/HelpDeskListScreen';
import HelpDeskCreateScreen from './src/screens/HelpDeskCreateScreen';
import HelpDeskDetailScreen from './src/screens/HelpDeskDetailScreen';
import HelpDeskEditScreen from './src/screens/HelpDeskEditScreen';
import HelpDeskNoticeDetailScreen from './src/screens/HelpDeskNoticeDetailScreen';
import AdditionalInfoScreen from './src/screens/AdditionalInfoScreen';
import DeleteAccountScreen from './src/screens/DeleteAccountScreen';
import SafetyPolicyScreen from './src/screens/SafetyPolicyScreen';
import SafetyAgreementModal from './src/components/SafetyAgreementModal';
import { SAFETY_AGREEMENT_STORAGE_KEY } from './src/lib/contentSafety';

const LOG = (...args: any[]) => console.log(...args);
const L_APP = (...a: any[]) => LOG('[APP]', ...a);
const L_PUSH = (...a: any[]) => LOG('[PUSH→APP]', ...a);
const L_NAV = (...a: any[]) => LOG('[NAV]', ...a);
const L_INTENT = (...a: any[]) => LOG('[NAV:INTENT]', ...a);
const L_AUTH = (...a: any[]) => LOG('[AUTH]', ...a);

const linking = {
  prefixes: ['credittalk://'],
  config: {
    screens: {
      UpdatePassword: 'update-password',
      // UnifiedSearch는 수동 Deep Link 처리로 인증 로직과 통합됨 (App 컴포넌트의 useEffect에서 처리)
    },
  },
};

const PROTECTED_SCREENS = new Set([
  'MainApp',
  'CommunityPostDetail',
  'HelpDeskDetail',
  'ArrestNewsDetail',
  'ReviewDetail',
  'IncidentPhotoDetail',
  'NewCrimeCaseDetail',
  'NoticeDetail',
  'UnifiedSearch', // Deep Link로 접근 시에도 인증 필요
]);

function needsAuth(screen: string) {
  return PROTECTED_SCREENS.has(screen);
}

export type CommunityStackParamList = {
  CommunityList: undefined;
  CommunityPostDetail: { postId: number; postTitle?: string };
  CommunityPostCreate: undefined;
  CommunityPostEdit: { postId: number };
};

export type HelpDeskStackParamList = {
  HelpDeskList: undefined;
  HelpDeskCreate: undefined;
  HelpDeskDetail: { questionId: number };
  HelpDeskEdit: { questionId: number };
  HelpDeskNoticeDetail: { noticeId: number; noticeTitle: string };
};

export type MainTabsParamList = {
  SearchTab: undefined;
  ChatTab: undefined;
  CommunityTab: NavigatorScreenParams<CommunityStackParamList>;
  MyTab: undefined;
  HelpCenterTab: NavigatorScreenParams<HelpDeskStackParamList>;
};

export type RootStackParamList = {
  MainApp: NavigatorScreenParams<MainTabsParamList>;
  Report: undefined;
  MyReports: undefined;
  UnifiedSearch: {
    searchType?: string;
    title?: string;
    initialSearchTerm?: string;
    phoneNumber?: string; // Deep Link에서 전달되는 전화번호
  };
  NoticeList: undefined;
  NoticeDetail: { noticeId: number; noticeTitle: string };
  NoticeEdit: { noticeId: number };
  ArrestNewsList: undefined;
  ArrestNewsCreate: undefined;
  ArrestNewsDetail: { newsId: number; newsTitle: string };
  ArrestNewsEdit: { newsId: number };
  ChatList: undefined;
  ChatMessageScreen: { roomId: string; roomName: string };
  NewChatScreen: undefined;
  SignIn: undefined;
  SignUp: undefined;
  ReviewList: undefined;
  ReviewDetail: { reviewId: number; reviewTitle: string };
  ReviewCreate: undefined;
  ReviewEdit: { reviewId: number };
  IncidentPhotoList: undefined;
  IncidentPhotoCreate: undefined;
  IncidentPhotoDetail: { photoId: number; photoTitle: string };
  IncidentPhotoEdit: { photoId: number };
  NewCrimeCaseList: undefined;
  NewCrimeCaseDetail: { caseId: number };
  NewCrimeCaseEdit: { caseId: number };
  NewCrimeCaseCreate: undefined;
  VoiceAnalysis: undefined;
  FindEmail: undefined;
  ResetPassword: undefined;
  UpdatePassword: undefined;
  AdditionalInfo: undefined;
  DeleteAccount: undefined;
  SafetyPolicy: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const CommunityNativeStack =
  createNativeStackNavigator<CommunityStackParamList>();
const Tab = createBottomTabNavigator<MainTabsParamList>();
const HelpDeskNativeStack =
  createNativeStackNavigator<HelpDeskStackParamList>();

function CommunityStack() {
  return (
    <CommunityNativeStack.Navigator
      id={undefined}
      initialRouteName="CommunityList">
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
      <CommunityNativeStack.Screen
        name="CommunityPostEdit"
        component={CommunityPostEditScreen}
        options={{ title: '글 수정' }}
      />
    </CommunityNativeStack.Navigator>
  );
}

function HelpDeskStack() {
  return (
    <HelpDeskNativeStack.Navigator
      id={undefined}
      initialRouteName="HelpDeskList">
      <HelpDeskNativeStack.Screen
        name="HelpDeskList"
        component={HelpDeskListScreen}
        options={{ title: '1:1 문의' }}
      />
      <HelpDeskNativeStack.Screen
        name="HelpDeskCreate"
        component={HelpDeskCreateScreen}
        options={{ title: '문의 작성' }}
      />
      <HelpDeskNativeStack.Screen
        name="HelpDeskDetail"
        component={HelpDeskDetailScreen}
        options={{ title: '문의 상세' }}
      />
      <HelpDeskNativeStack.Screen
        name="HelpDeskEdit"
        component={HelpDeskEditScreen}
        options={{ title: '문의 수정' }}
      />
      <HelpDeskNativeStack.Screen
        name="HelpDeskNoticeDetail"
        component={HelpDeskNoticeDetailScreen}
        options={{ title: '공지 상세' }}
      />
    </HelpDeskNativeStack.Navigator>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      id={undefined}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = '';
          if (route.name === 'SearchTab')
            iconName = focused ? 'magnify' : 'magnify';
          else if (route.name === 'ChatTab')
            iconName = focused ? 'chat-processing' : 'chat-processing-outline';
          else if (route.name === 'CommunityTab')
            iconName = focused ? 'forum' : 'forum-outline';
          else if (route.name === 'MyTab')
            iconName = focused ? 'account-circle' : 'account-circle-outline';
          else if (route.name === 'HelpCenterTab')
            iconName = focused ? 'help-circle' : 'help-circle-outline';
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#3d5afe',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          height: Platform.OS === 'android' ? 65 + insets.bottom : 90,
          paddingBottom: Platform.OS === 'android' ? insets.bottom + 5 : 30,
          paddingTop: 5,
        },
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 11,
          paddingBottom: Platform.OS === 'ios' ? 0 : 5,
        },
      })}>
      <Tab.Screen
        name="SearchTab"
        component={HomeScreen}
        options={{ title: '검색' }}
      />
      {/*<Tab.Screen*/}
      {/*  name="ChatTab"*/}
      {/*  component={ChatListScreen}*/}
      {/*  options={{ title: '채팅', headerShown: true }}*/}
      {/*/>*/}
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
        component={HelpDeskStack}
        options={{ title: '헬프센터' }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, profile, isLoading } = useAuth();

  useEffect(() => {
    if (user?.id) {
      L_AUTH('user detected, updating token & binding refresh', {
        uid: user.id,
      });
      updatePushTokenOnLogin(user.id);
      const unsubscribe = setupTokenRefreshListener(user.id);
      return () => unsubscribe();
    } else {
      L_AUTH('no user, skip token update');
    }
  }, [user?.id]);

  if (isLoading) {
    L_AUTH('auth loading...');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3d5afe" />
        <Text style={{ marginTop: 10 }}>
          세션 및 프로필 정보를 확인 중입니다...
        </Text>
      </View>
    );
  }

  L_AUTH('auth resolved', { hasUser: !!user, hasProfile: !!profile });

  return (
    <RootStack.Navigator id={undefined}>
      {!user ? (
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
          <RootStack.Screen
            name="FindEmail"
            component={FindEmailScreen}
            options={{ title: '아이디 찾기' }}
          />
          <RootStack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ title: '비밀번호 찾기' }}
          />
          <RootStack.Screen
            name="UpdatePassword"
            component={UpdatePasswordScreen}
            options={{ title: '새 비밀번호 설정' }}
          />
          <RootStack.Screen
            name="SafetyPolicy"
            component={SafetyPolicyScreen}
            options={{ title: '커뮤니티 안전 약관' }}
          />
        </>
      ) : !profile ? (
        <>
          <RootStack.Screen
            name="AdditionalInfo"
            component={AdditionalInfoScreen}
            options={{ title: '추가 정보 입력', headerShown: false }}
          />
        </>
      ) : (
        <>
          <RootStack.Screen
            name="MainApp"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="NewCrimeCaseList"
            component={NewCrimeCaseListScreen}
            options={{ title: '신종범죄 피해사례' }}
          />
          <RootStack.Screen
            name="NewCrimeCaseDetail"
            component={NewCrimeCaseDetailScreen}
            options={{ title: '신종범죄 사례 상세' }}
          />
          <RootStack.Screen
            name="NewCrimeCaseEdit"
            component={NewCrimeCaseEditScreen}
            options={{ title: '신종범죄 사례 수정' }}
          />
          <RootStack.Screen
            name="NewCrimeCaseCreate"
            component={NewCrimeCaseCreateScreen}
            options={{ title: '사례 등록' }}
          />
          <RootStack.Screen
            name="MyReports"
            component={MyReportsScreen}
            options={{ title: '나의 피해사례' }}
          />
          <RootStack.Screen
            name="Report"
            component={ReportScreen}
            options={{ title: '사기 정보 입력' }}
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
            name="NoticeEdit"
            component={NoticeEditScreen}
            options={{ title: '공지사항 수정' }}
          />
          <RootStack.Screen
            name="ArrestNewsList"
            component={ArrestNewsListScreen}
            options={{ title: '검거소식' }}
          />
          <RootStack.Screen
            name="ArrestNewsCreate"
            component={ArrestNewsCreateScreen}
            options={{ title: '검거소식 작성' }}
          />
          <RootStack.Screen
            name="ArrestNewsEdit"
            component={ArrestNewsEditScreen}
            options={{ title: '검거소식 수정' }}
          />
          <RootStack.Screen
            name="ArrestNewsDetail"
            component={ArrestNewsDetailScreen}
          />
          <RootStack.Screen
            name="ReviewList"
            component={ReviewListScreen}
            options={{ title: '크레딧톡 후기' }}
          />
          <RootStack.Screen
            name="ReviewDetail"
            component={ReviewDetailScreen}
          />
          <RootStack.Screen
            name="ReviewEdit"
            component={ReviewEditScreen}
            options={{ title: '후기 수정' }}
          />
          <RootStack.Screen
            name="ReviewCreate"
            component={ReviewCreateScreen}
            options={{ title: '후기 작성' }}
          />
          <RootStack.Screen
            name="IncidentPhotoList"
            component={IncidentPhotoListScreen}
            options={{ title: '사건 사진자료' }}
          />
          <RootStack.Screen
            name="IncidentPhotoCreate"
            component={IncidentPhotoCreateScreen}
            options={{ title: '사진자료 작성' }}
          />
          <RootStack.Screen
            name="IncidentPhotoDetail"
            component={IncidentPhotoDetailScreen}
          />
          <RootStack.Screen
            name="IncidentPhotoEdit"
            component={IncidentPhotoEditScreen}
            options={{ title: '사진자료 수정' }}
          />
          {/*<RootStack.Screen*/}
          {/*  name="ChatList"*/}
          {/*  component={ChatListScreen}*/}
          {/*  options={{ title: '채팅 목록' }}*/}
          {/*/>*/}
          {/*<RootStack.Screen*/}
          {/*  name="ChatMessageScreen"*/}
          {/*  component={ChatMessageScreen}*/}
          {/*/>*/}
          {/*<RootStack.Screen*/}
          {/*  name="NewChatScreen"*/}
          {/*  component={NewChatScreen}*/}
          {/*  options={{ title: '새 채팅 시작' }}*/}
          {/*/>*/}
          <RootStack.Screen
            name="VoiceAnalysis"
            component={VoiceAnalysisScreen}
            options={{ title: '통화 녹음 파일 분석' }}
          />
          <RootStack.Screen
            name="UpdatePassword"
            component={UpdatePasswordScreen}
            options={{ title: '새 비밀번호 설정' }}
          />
          <RootStack.Screen
            name="DeleteAccount"
            component={DeleteAccountScreen}
            options={{ title: '회원 탈퇴' }}
          />
          <RootStack.Screen
            name="SafetyPolicy"
            component={SafetyPolicyScreen}
            options={{ title: '커뮤니티 안전 약관' }}
          />
        </>
      )}
    </RootStack.Navigator>
  );
}

function NavIntentReplayer({
  navRef,
  pendingNavRef,
  navigateToScreen,
  onAuthReadyChange,
}: {
  navRef: NavigationContainerRefWithCurrent<RootStackParamList>;
  pendingNavRef: React.MutableRefObject<{
    screen: string;
    params?: any;
  } | null>;
  navigateToScreen: (screen: string, params?: any) => void;
  onAuthReadyChange: (ready: boolean) => void;
}) {
  const { user, profile } = useAuth();

  useEffect(() => {
    const ready = Boolean(user && profile);
    L_AUTH('auth ready change', {
      ready,
      uid: user?.id,
      hasProfile: !!profile,
    });
    onAuthReadyChange(ready);
  }, [user, profile, onAuthReadyChange]);

  useEffect(() => {
    if (!navRef.isReady()) {
      L_INTENT('nav not ready in replayer; skip flush');
      return;
    }
    const pending = pendingNavRef.current;
    if (!pending) {
      L_INTENT('no pending intent to flush');
      return;
    }
    if (user && profile) {
      L_INTENT('flushing pending (auth ready)', pending);
      pendingNavRef.current = null;
      navigateToScreen(pending.screen, pending.params);
    } else {
      L_INTENT('pending exists, but auth not ready yet');
    }
  }, [user, profile, navRef, navigateToScreen, pendingNavRef]);

  return null;
}

function App(): React.JSX.Element {
  const navRef = useNavigationContainerRef<RootStackParamList>();
  const pendingNavRef = useRef<{ screen: string; params?: any } | null>(null);
  const authReadyRef = useRef(false);

  const [hasAcceptedSafety, setHasAcceptedSafety] = useState(false);
  const [isCheckingSafety, setIsCheckingSafety] = useState(true);

  const navigateToScreen = useCallback(
    (screen: string, params?: any) => {
      L_NAV('navigateToScreen called', { screen, params });

      if (!navRef.isReady()) {
        L_INTENT('nav not ready → queue', { screen, params });
        pendingNavRef.current = { screen, params };
        return;
      }

      if (needsAuth(screen) && !authReadyRef.current) {
        L_INTENT('protected & auth not ready → queue', { screen, params });
        pendingNavRef.current = { screen, params };
        return;
      }

      const castAndNavigate = (targetScreen: string, targetParams?: any) => {
        const casted: Record<string, any> = {};
        Object.keys(targetParams || {}).forEach(k => {
          const v = targetParams[k];
          const num = Number(v);
          casted[k] =
            Number.isFinite(num) && String(num) === String(v) ? num : v;
        });
        L_NAV('nav.navigate()', { targetScreen, casted });
        navRef.navigate(targetScreen as never, casted as never);
      };

      if (screen === 'CommunityPostDetail' && params?.postId) {
        L_NAV('branch → CommunityTab nested detail', { postId: params.postId });
        navRef.navigate('MainApp', {
          screen: 'CommunityTab',
          params: {
            screen: 'CommunityPostDetail',
            params: { postId: Number(params.postId) },
          },
        } as never);
      } else if (screen === 'HelpDeskDetail' && params?.questionId) {
        L_NAV('branch → HelpCenterTab nested detail', {
          questionId: params.questionId,
        });
        navRef.navigate('MainApp', {
          screen: 'HelpCenterTab',
          params: {
            screen: 'HelpDeskDetail',
            params: { questionId: Number(params.questionId) },
          },
        } as never);
      } else {
        castAndNavigate(screen, params);
      }
    },
    [navRef],
  );

  const navigateToMaybeQueue = useCallback(
    (screen: string, params?: any) => {
      L_INTENT('navigateToMaybeQueue', {
        screen,
        params,
        navReady: navRef.isReady(),
      });
      if (navRef.isReady()) {
        navigateToScreen(screen, params);
      } else {
        L_INTENT('queue (nav not ready)', { screen, params });
        pendingNavRef.current = { screen, params };
      }
    },
    [navRef, navigateToScreen],
  );

  const onAuthReadyChange = useCallback(
    (ready: boolean) => {
      L_AUTH('onAuthReadyChange', { ready });
      authReadyRef.current = ready;
      if (ready && navRef.isReady() && pendingNavRef.current) {
        const { screen, params } = pendingNavRef.current;
        L_INTENT('auth ready & nav ready → flush pending', { screen, params });
        pendingNavRef.current = null;
        navigateToScreen(screen, params);
      }
    },
    [navRef, navigateToScreen],
  );

  useEffect(() => {
    L_APP('NaverLogin.initialize');
    NaverLogin.initialize({
      appName: '크레딧톡',
      consumerKey: 'QWU6hRfI6lQMlQ5QIZN1',
      consumerSecret: 'VtyqGV8HHb',
      serviceUrlSchemeIOS: 'naverQWU6hRfI6lQMlQ5QIZN1',
      disableNaverAppAuthIOS: false,
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const acceptedAt = await AsyncStorage.getItem(
          SAFETY_AGREEMENT_STORAGE_KEY,
        );
        L_APP('SafetyAgreement loaded', { acceptedAt });
        setHasAcceptedSafety(Boolean(acceptedAt));
      } catch (error) {
        L_APP('SafetyAgreement load failed', error);
      } finally {
        setIsCheckingSafety(false);
      }
    })();
  }, []);

  const handleAcceptSafety = useCallback(async () => {
    try {
      const now = new Date().toISOString();
      await AsyncStorage.setItem(SAFETY_AGREEMENT_STORAGE_KEY, now);
      L_APP('SafetyAgreement accepted', { at: now });
      setHasAcceptedSafety(true);
    } catch (error) {
      L_APP('SafetyAgreement persist failed', error);
    }
  }, []);

  useEffect(() => {
    // 1) 앱이 OS 배너 탭으로 열렸을 때(FG/BG 상태에서) FCM가 직접 주는 콜백
    const unsubscribeNotificationOpened = messaging().onNotificationOpenedApp(
      remoteMessage => {
        L_PUSH('onNotificationOpenedApp', {
          hasMsg: !!remoteMessage,
          data: remoteMessage?.data,
        });
        if (remoteMessage?.data) {
          openFromPayloadOnce(navigateToMaybeQueue, remoteMessage.data);
        }
      },
    );

    // ⚠️ App.tsx에서는 notifee.onForegroundEvent 등록 금지!
    //    (중복 네비게이션 방지: 포그라운드 탭 핸들러는 push.js: wireMessageHandlers에서만 등록)

    (async () => {
      // 2) 권한/채널 준비
      await requestNotificationPermissionAndroid().then(() =>
        L_APP('Android notification permission requested'),
      );
      await ensureNotificationChannel().then(() =>
        L_APP('ensureNotificationChannel done'),
      );

      // 3) 포그라운드 핸들러 및 AppState 복귀 drain을 "정확히 한 번"만 바인딩
      await wireMessageHandlers(navigateToMaybeQueue).then(() =>
        L_PUSH('wireMessageHandlers bound (foreground listeners)'),
      );

      // 4) 콜드/웜 스타트: 초기 알림(배너 탭으로 진입) 처리
      const initialNotifee = await notifee.getInitialNotification();
      L_PUSH('notifee.getInitialNotification', {
        exists: !!initialNotifee,
        data: initialNotifee?.notification?.data,
      });
      if (initialNotifee?.notification?.data) {
        await openFromPayloadOnce(
          navigateToMaybeQueue,
          initialNotifee.notification.data,
        );
      }

      const initialRemote = await messaging().getInitialNotification();
      L_PUSH('messaging.getInitialNotification', {
        exists: !!initialRemote,
        data: initialRemote?.data,
      });
      if (initialRemote?.data) {
        await openFromPayloadOnce(navigateToMaybeQueue, initialRemote.data);
      }

      // 5) BG 컨텍스트에서 큐에 적재해 둔 탭을 한 번만 소진
      await drainQueuedTap(navigateToMaybeQueue);
    })();

    return () => {
      L_PUSH('unsubscribe onNotificationOpenedApp');
      unsubscribeNotificationOpened();
    };
  }, [navigateToMaybeQueue]);

  // Deep Link 처리 (알림 클릭 시 credittalk://search?phoneNumber=xxx 형태)
  useEffect(() => {
    const parseDeepLink = (url: string | null) => {
      if (!url) return null;
      try {
        // credittalk://search?phoneNumber=xxx 형태의 URL 파싱
        const parsed = new URL(url);
        if (parsed.protocol === 'credittalk:') {
          const path = parsed.host || parsed.pathname?.replace(/^\//, '');
          if (path === 'search') {
            const phoneNumber = parsed.searchParams.get('phoneNumber');
            return {
              screen: 'UnifiedSearch',
              params: { phoneNumber },
            };
          }
        }
      } catch (e) {
        L_NAV('Deep link parse error:', e);
      }
      return null;
    };

    // 앱이 실행 중일 때 들어오는 Deep Link 처리
    const handleDeepLink = (event: { url: string }) => {
      L_NAV('Deep link received (foreground):', event.url);
      const parsed = parseDeepLink(event.url);
      if (parsed) {
        navigateToMaybeQueue(parsed.screen, parsed.params);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // 초기 Deep Link (앱이 꺼진 상태에서 열릴 때)
    (async () => {
      const initialUrl = await Linking.getInitialURL();
      L_NAV('Initial deep link URL:', initialUrl);
      const parsed = parseDeepLink(initialUrl);
      if (parsed) {
        navigateToMaybeQueue(parsed.screen, parsed.params);
      }
    })();

    return () => {
      subscription.remove();
    };
  }, [navigateToMaybeQueue]);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer
          ref={navRef}
          onReady={() => {
            L_NAV('NavigationContainer onReady');
            if (pendingNavRef.current) {
              const { screen, params } = pendingNavRef.current;
              L_INTENT('onReady pending found', {
                screen,
                params,
                authReady: authReadyRef.current,
              });
              if (!needsAuth(screen) || authReadyRef.current) {
                L_INTENT('onReady → flushing pending');
                pendingNavRef.current = null;
                navigateToScreen(screen, params);
              } else {
                L_INTENT('onReady → keep pending (auth not ready)');
              }
            } else {
              L_INTENT('onReady no pending');
            }
          }}
          onStateChange={state => {
            const routeNames = state?.routes?.map(r => r.name);
            L_NAV('state change', routeNames);
          }}
          linking={linking}
          fallback={<Text>Loading...</Text>}>
          <AppNavigator />
        </NavigationContainer>

        <NavIntentReplayer
          navRef={
            navRef as NavigationContainerRefWithCurrent<RootStackParamList>
          }
          pendingNavRef={pendingNavRef}
          navigateToScreen={navigateToScreen}
          onAuthReadyChange={onAuthReadyChange}
        />

        {!isCheckingSafety && (
          <SafetyAgreementModal
            visible={!hasAcceptedSafety}
            onAccept={handleAcceptSafety}
          />
        )}
      </AuthProvider>
    </SafeAreaProvider>
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
