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
  drainNativeNotificationTap,
  runExclusivePushOp,
  extractTapData,
  queueTapIntent,
} from './src/lib/push';
import { logPushTap } from './src/lib/pushTapLog';

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
import EventListScreen from './src/screens/EventListScreen';
import EventDetailScreen from './src/screens/EventDetailScreen';
import MyEventsScreen from './src/screens/MyEventsScreen';
import SafetyAgreementModal from './src/components/SafetyAgreementModal';
import { SAFETY_AGREEMENT_STORAGE_KEY } from './src/lib/contentSafety';
import { checkForAppUpdate } from './src/lib/inAppUpdate';

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
  'EventDetail',
  'MyReports', // 신고 분석 완료 푸시 타깃
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
  EventList: undefined;
  EventDetail: { eventId: number };
  MyEvents: undefined;
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
          <RootStack.Screen
            name="EventList"
            component={EventListScreen}
            options={{ title: '이벤트' }}
          />
          <RootStack.Screen
            name="EventDetail"
            component={EventDetailScreen}
            options={{ title: '이벤트 상세' }}
          />
          <RootStack.Screen
            name="MyEvents"
            component={MyEventsScreen}
            options={{ title: '나의 응모 현황' }}
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
  pendingNavRef: React.MutableRefObject<Array<{
    screen: string;
    params?: any;
    ts: number;
  }>>;
  navigateToScreen: (screen: string, params?: any) => boolean;
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
    if (!pending.length) {
      L_INTENT('no pending intent to flush');
      return;
    }
    if (user && profile) {
      let fresh = takePendingNav();
      while (fresh) {
        L_INTENT('flushing pending (auth ready)', fresh);
        if (!navigateToScreen(fresh.screen, fresh.params)) {
          setPendingNav(fresh.screen, fresh.params);
          break;
        }
        fresh = takePendingNav();
      }
    } else {
      L_INTENT('pending exists, but auth not ready yet');
    }
  }, [user, profile, navRef, navigateToScreen, pendingNavRef]);

  return null;
}

// 미처리 네비게이션 인텐트는 모듈 스코프에 보관한다. 액티비티 재생성으로
// App이 리마운트돼도(프로세스/JS 컨텍스트 유지) 인증 대기 중이던 알림 탭이
// 유실되지 않도록 useRef(마운트 수명) 대신 모듈 수명 홀더를 쓴다.
const pendingNavHolder: React.MutableRefObject<Array<{
  screen: string;
  params?: any;
  ts: number;
}>> = { current: [] };

// 홀더가 프로세스 수명 동안 살아있으므로 TTL을 둔다: 인증 미준비로 큐잉된
// 탭이 한참 뒤 로그인 시점에 유령 이동하는 것 방지.
const PENDING_NAV_TTL_MS = 5 * 60 * 1000;
const PENDING_NAV_MAX = 20;

function setPendingNav(screen: string, params?: any) {
  const queue = pendingNavHolder.current;
  const last = queue[queue.length - 1];
  if (last && last.screen === screen && JSON.stringify(last.params) === JSON.stringify(params)) {
    return;
  }
  queue.push({ screen, params, ts: Date.now() });
  if (queue.length > PENDING_NAV_MAX) {
    const dropped = queue.shift();
    logPushTap({
      source: 'nav_intent',
      outcome: 'pending_queue_overflow',
      data: { screen: dropped?.screen },
      detail: { max: PENDING_NAV_MAX },
    });
  }
}

/** 가장 오래된 유효 인텐트를 꺼낸다. 만료분은 기록 후 계속 건너뛴다. */
function takePendingNav(): { screen: string; params?: any } | null {
  let pending = pendingNavHolder.current.shift();
  while (pending && Date.now() - pending.ts > PENDING_NAV_TTL_MS) {
    L_INTENT('pending expired, dropping', { screen: pending.screen });
    logPushTap({
      source: 'nav_intent',
      outcome: 'pending_expired',
      data: { screen: pending.screen },
      detail: { params: pending.params ?? null, ageMs: Date.now() - pending.ts },
    });
    pending = pendingNavHolder.current.shift();
  }
  return pending ? { screen: pending.screen, params: pending.params } : null;
}

function App(): React.JSX.Element {
  const navRef = useNavigationContainerRef<RootStackParamList>();
  const pendingNavRef = pendingNavHolder;
  const authReadyRef = useRef(false);

  const [hasAcceptedSafety, setHasAcceptedSafety] = useState(false);
  const [isCheckingSafety, setIsCheckingSafety] = useState(true);

  // 네비게이션 "실제 도달" 검증: navigate 호출이 조용히 실패해도(죽은 navRef,
  // 리듀서 무시, 인증 리다이렉트 등) 기존 텔레메트리는 성공(navigate_screen)으로
  // 기록됐다. 호출 1.5초 뒤 현재 라우트를 비교해 불일치면 원격 로그를 남긴다.
  const verifyNavOutcome = useCallback(
    (expectedScreen: string, context?: Record<string, any>) => {
      setTimeout(() => {
        try {
          const actual = navRef.isReady()
            ? navRef.getCurrentRoute()?.name ?? null
            : null;
          if (actual !== expectedScreen) {
            L_NAV('nav verification FAILED', {
              expectedScreen,
              actual,
              context,
            });
            logPushTap({
              source: 'nav_verify',
              outcome: 'nav_verify_failed',
              data: { screen: expectedScreen },
              detail: { expected: expectedScreen, actual, ...(context ?? {}) },
            });
          }
        } catch {}
      }, 1500);
    },
    [navRef],
  );

  const navigateToScreen = useCallback(
    (screen: string, params?: any): boolean => {
      L_NAV('navigateToScreen called', { screen, params });

      if (!navRef.isReady()) {
        L_INTENT('nav not ready → queue', { screen, params });
        setPendingNav(screen, params);
        return true;
      }

      if (needsAuth(screen) && !authReadyRef.current) {
        L_INTENT('protected & auth not ready → queue', { screen, params });
        setPendingNav(screen, params);
        return true;
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
        verifyNavOutcome(targetScreen, { params: casted });
      };

      try {
        // CommunityPostDetail과 HelpDeskDetail은 탭 내부의 중첩 스택에 있으므로 별도 처리 필요
        if (screen === 'CommunityPostDetail') {
          // postId 추출: params에서 직접 또는 다양한 키 이름으로 시도
          const postId = params?.postId ?? params?.id ?? params?.post_id;
          if (postId) {
            L_NAV('branch → CommunityTab nested detail', { postId });
            navRef.navigate('MainApp', {
              screen: 'CommunityTab',
              params: {
                screen: 'CommunityPostDetail',
                params: { postId: Number(postId) },
              },
            } as never);
            verifyNavOutcome('CommunityPostDetail', { postId });
          } else {
            L_NAV('CommunityPostDetail missing postId, fallback to list', params);
            // 글 상세로 못 가고 리스트로 폴백 = 사용자 입장에선 "이동 실패" → 기록
            logPushTap({
              source: 'nav_intent',
              outcome: 'nav_fallback_list',
              data: { screen },
              detail: { reason: 'missing postId', params: params ?? null },
            });
            navRef.navigate('MainApp', {
              screen: 'CommunityTab',
              params: { screen: 'CommunityList' },
            } as never);
          }
        } else if (screen === 'HelpDeskDetail') {
          // questionId 추출: params에서 직접 또는 다양한 키 이름으로 시도
          const questionId =
            params?.questionId ?? params?.id ?? params?.question_id;
          if (questionId) {
            L_NAV('branch → HelpCenterTab nested detail', { questionId });
            navRef.navigate('MainApp', {
              screen: 'HelpCenterTab',
              params: {
                screen: 'HelpDeskDetail',
                params: { questionId: Number(questionId) },
              },
            } as never);
            verifyNavOutcome('HelpDeskDetail', { questionId });
          } else {
            L_NAV('HelpDeskDetail missing questionId, fallback to list', params);
            logPushTap({
              source: 'nav_intent',
              outcome: 'nav_fallback_list',
              data: { screen },
              detail: { reason: 'missing questionId', params: params ?? null },
            });
            navRef.navigate('MainApp', {
              screen: 'HelpCenterTab',
              params: { screen: 'HelpDeskList' },
            } as never);
          }
        } else {
          castAndNavigate(screen, params);
        }
      } catch (e: any) {
        // navigate 호출 자체가 던진 경우 — 탭이 유실됨 → 반드시 기록
        L_NAV('navigate threw', { screen, message: e?.message });
        logPushTap({
          source: 'nav_intent',
          outcome: 'nav_error',
          data: { screen },
          detail: { message: String(e?.message || e), params: params ?? null },
        });
        return false;
      }
      return true;
    },
    [navRef, verifyNavOutcome],
  );

  const navigateToMaybeQueue = useCallback(
    (screen: string, params?: any): boolean => {
      L_INTENT('navigateToMaybeQueue', {
        screen,
        params,
        navReady: navRef.isReady(),
      });
      if (navRef.isReady()) {
        return navigateToScreen(screen, params);
      } else {
        L_INTENT('queue (nav not ready)', { screen, params });
        setPendingNav(screen, params);
        return true;
      }
    },
    [navRef, navigateToScreen],
  );

  // 푸시 탭은 Navigation/Auth가 아직 준비되지 않았을 때 성공으로 소비하지 않는다.
  // 호출자가 영속 AsyncStorage 큐에 남겼다가 onReady/authReady에서 재시도한다.
  const navigatePushIntent = useCallback(
    (screen: string, params?: any): boolean => {
      if (!navRef.isReady()) {
        L_INTENT('push nav not ready → keep persistent queue', { screen });
        return false;
      }
      if (needsAuth(screen) && !authReadyRef.current) {
        L_INTENT('push auth not ready → keep persistent queue', { screen });
        return false;
      }
      return navigateToScreen(screen, params);
    },
    [navRef, navigateToScreen],
  );

  const onAuthReadyChange = useCallback(
    (ready: boolean) => {
      L_AUTH('onAuthReadyChange', { ready });
      authReadyRef.current = ready;
      if (ready && navRef.isReady() && pendingNavRef.current.length) {
        let fresh = takePendingNav();
        while (fresh) {
          L_INTENT('auth ready & nav ready → flush pending', fresh);
          if (!navigateToScreen(fresh.screen, fresh.params)) {
            setPendingNav(fresh.screen, fresh.params);
            break;
          }
          fresh = takePendingNav();
        }
      }
      if (ready && navRef.isReady()) {
        runExclusivePushOp('auth-ready-tap-drain', () =>
          drainQueuedTap(navigatePushIntent),
        );
      }
    },
    [navRef, navigateToScreen, navigatePushIntent, pendingNavRef],
  );

  useEffect(() => {
    // 스토어 자동 업데이트 적용률 정체 대응: 실행 시 Play In-App Update 확인
    checkForAppUpdate();
  }, []);

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
      async remoteMessage => {
        L_PUSH('onNotificationOpenedApp', {
          hasMsg: !!remoteMessage,
          data: remoteMessage?.data,
        });
        if (remoteMessage?.data) {
          // _mid(FCM message id): consume 마커 키 — 이후 콜드스타트 캐시가
          // 같은 메시지를 재반환해도 stale 재생으로 차단된다.
          const data = remoteMessage.messageId
            ? { ...remoteMessage.data, _mid: String(remoteMessage.messageId) }
            : remoteMessage.data;
          // 먼저 영속 큐에 기록한다. nav/auth 준비 전이거나 링크 앱 실행이
          // 일시 실패해도 다음 onReady/AppState에서 같은 탭을 재시도한다.
          const stored = await queueTapIntent(data);
          if (!stored) {
            // 저장소가 일시 실패해도 현재 프로세스에서 즉시 한 번은 처리한다.
            // navigatePushIntent가 false를 반환하면 성공/소비 로그를 남기지 않는다.
            await openFromPayloadOnce(
              navigatePushIntent,
              data,
              'fcm_opened_app_storage_fallback',
            );
          }
        }
      },
    );

    // ⚠️ App.tsx에서는 notifee.onForegroundEvent 등록 금지!
    //    (중복 네비게이션 방지: 포그라운드 탭 핸들러는 push.js: wireMessageHandlers에서만 등록)

    (async () => {
      // 2) 탭/포그라운드 핸들러를 권한 다이얼로그보다 먼저 바인딩한다.
      // 알림으로 콜드스타트한 사용자가 다른 권한 요청을 처리하는 동안 탭이
      // 유실되던 순서 의존성을 없앤다.
      await wireMessageHandlers(navigatePushIntent).then(() =>
        L_PUSH('wireMessageHandlers bound (foreground listeners)'),
      );

      // 3) 콜드/웜 스타트 초기 알림 처리.
      //  - 전체를 직렬화 체인에서 실행: AppState 'active' 드레인과 인터리빙되면
      //    실제 탭이 stale 재생에게 마지막-네비게이션을 빼앗기는 레이스 실측(7/17).
      //  - 순서: 네이티브 캡처(실제 런치 인텐트, 가장 신뢰) → notifee 초기 →
      //    FCM 초기(삼성에서 이전 탭을 재반환하는 stale 캐시 실측 → consume 마커로 차단).
      await runExclusivePushOp('coldstart-init', async () => {
        // 4) 네이티브 인텐트 캡처 최우선: MainActivity가 실제 런치 인텐트에서
        //    직접 읽은 값이라 RNFirebase 캐시보다 신뢰할 수 있다.
        const nativeHandled = await drainNativeNotificationTap(
          navigatePushIntent,
        );
        let coldStartHandled = nativeHandled;

        if (!coldStartHandled) {
          const initialNotifee = await notifee.getInitialNotification();
          L_PUSH('notifee.getInitialNotification', {
            exists: !!initialNotifee,
            data: initialNotifee?.notification?.data,
          });
          if (initialNotifee?.notification) {
            // 삼성에서 초기 알림의 data가 비어 오는 사례 대비: 표시 시점 백업에서 복원
            // (blind restore는 금지: getInitialNotification은 탭 없는 일반 실행에서도
            //  stale 알림을 재반환할 수 있어 오발동 위험 — PRESS 경로가 큐로 커버)
            const tapData = await extractTapData(initialNotifee.notification);
            // 빈 탭({})으로 콜드스타트를 "처리됨" 판정하면 뒤의 FCM 초기 경로까지
            // 건너뛰어 탭이 유실되므로, 내용 있는 data만 처리한다.
            // 조용한 스킵은 유실 규모를 숨기므로 텔레메트리는 남긴다(가드 자체는 유지).
            if (Object.keys(tapData).length === 0) {
              // no_target(실패 지표)과 섞이지 않게 별도 outcome으로 기록:
              // 이 가드는 "정상 방어"(빈 초기 알림 무시, 실제 탭은 큐가 처리)와
              // "유실"(큐도 비었던 경우)이 섞여 있어 원격 판별용 로그만 남긴다.
              logPushTap({
                source: 'notifee_initial',
                outcome: 'empty_initial_skip',
                detail: {
                  hasId: !!initialNotifee.notification?.id,
                },
              });
            }
            if (Object.keys(tapData).length > 0) {
              coldStartHandled = true;
              const result = await openFromPayloadOnce(
                navigatePushIntent,
                tapData,
                'notifee_initial',
                { fromInitialCache: true },
              );
              if (!result?.handled) {
                await queueTapIntent(tapData, { notifyListener: false });
              }
            }
          }
        }

        if (!coldStartHandled) {
          const initialRemote = await messaging().getInitialNotification();
          L_PUSH('messaging.getInitialNotification', {
            exists: !!initialRemote,
            data: initialRemote?.data,
          });
          if (initialRemote?.data) {
            coldStartHandled = true;
            const data = initialRemote.messageId
              ? {
                  ...initialRemote.data,
                  _mid: String(initialRemote.messageId),
                }
              : initialRemote.data;
            const result = await openFromPayloadOnce(
              navigatePushIntent,
              data,
              'fcm_initial',
              { fromInitialCache: true },
            );
            if (!result?.handled) {
              await queueTapIntent(data, { notifyListener: false });
            }
          }
        }

        // 5) BG 컨텍스트에서 큐에 적재해 둔 탭을 한 번만 소진
        await drainQueuedTap(navigatePushIntent);

        if (!coldStartHandled) {
          L_PUSH(
            'coldStart: no initial notification found (native & notifee & FCM all null)',
          );
        }
      });

      // 4) 탭 복구가 끝난 뒤 표시 채널과 Android 알림 권한을 준비한다.
      // Manifest에 선언하지 않은 전화/마이크 권한은 여기서 요청하지 않는다.
      await ensureNotificationChannel().then(() =>
        L_APP('ensureNotificationChannel done'),
      );
      await requestNotificationPermissionAndroid().then(result =>
        L_APP('Android notification permission checked', result),
      );
    })();

    return () => {
      L_PUSH('unsubscribe onNotificationOpenedApp');
      unsubscribeNotificationOpened();
    };
  }, [navigatePushIntent]);

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
            runExclusivePushOp('navigation-ready-tap-drain', () =>
              drainQueuedTap(navigatePushIntent),
            );
            if (pendingNavRef.current.length) {
              const { screen, params } = pendingNavRef.current[0];
              L_INTENT('onReady pending found', {
                screen,
                params,
                authReady: authReadyRef.current,
              });
              if (!needsAuth(screen) || authReadyRef.current) {
                let fresh = takePendingNav();
                while (fresh) {
                  L_INTENT('onReady → flushing pending');
                  if (!navigateToScreen(fresh.screen, fresh.params)) {
                    setPendingNav(fresh.screen, fresh.params);
                    break;
                  }
                  fresh = takePendingNav();
                }
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
