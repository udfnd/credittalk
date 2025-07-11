import "react-native-get-random-values";
import "react-native-url-polyfill/auto";

import React, { useEffect } from "react";
import {
  Platform,
  View,
  StyleSheet,
  Text,
  ActivityIndicator, PermissionsAndroid
} from "react-native";
import {
  NavigationContainer,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import NaverLogin from "@react-native-seoul/naver-login";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { syncBlacklist } from "./src/native_modules/CallDetection";

// Screens
import HomeScreen from "./src/screens/HomeScreen";
import ReportScreen from "./src/screens/ReportScreen";
import UnifiedSearchScreen from "./src/screens/UnifiedSearchScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import SignUpScreen from "./src/screens/SignUpScreen";
import SignInScreen from "./src/screens/SignInScreen";
import NoticeListScreen from "./src/screens/NoticeListScreen";
import NoticeDetailScreen from "./src/screens/NoticeDetailScreen";
import ArrestNewsListScreen from "./src/screens/ArrestNewsListScreen";
import ArrestNewsDetailScreen from "./src/screens/ArrestNewsDetailScreen";
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatMessageScreen from "./src/screens/ChatMessageScreen";
import NewChatScreen from "./src/screens/NewChatScreen";
import CommunityListScreen from "./src/screens/CommunityListScreen";
import CommunityPostDetailScreen from "./src/screens/CommunityPostDetailScreen";
import CommunityPostCreateScreen from "./src/screens/CommunityPostCreateScreen";
import ReviewListScreen from "./src/screens/ReviewListScreen";
import ReviewDetailScreen from "./src/screens/ReviewDetailScreen";
import ReviewCreateScreen from "./src/screens/ReviewCreateScreen";
import IncidentPhotoListScreen from "./src/screens/IncidentPhotoListScreen";
import IncidentPhotoDetailScreen from "./src/screens/IncidentPhotoDetailScreen";
import MyReportsScreen from "./src/screens/MyReportsScreen";
import NewCrimeCaseListScreen from "./src/screens/NewCrimeCaseListScreen";
import NewCrimeCaseCreateScreen from "./src/screens/NewCrimeCaseCreateScreen";
import VoiceAnalysisScreen from "./src/screens/VoiceAnalysisScreen";
import FindEmailScreen from "./src/screens/FindEmailScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import UpdatePasswordScreen from "./src/screens/UpdatePasswordScreen";
import HelpDeskListScreen from "./src/screens/HelpDeskListScreen";
import HelpDeskCreateScreen from "./src/screens/HelpDeskCreateScreen";
import HelpDeskDetailScreen from "./src/screens/HelpDeskDetailScreen";
import AdditionalInfoScreen from "./src/screens/AdditionalInfoScreen";
import NewCrimeCaseDetailScreen from "./src/screens/NewCrimeCaseDetailScreen";

const linking = {
  prefixes: ["credittalk://"],
  config: {
    screens: {
      UpdatePassword: "update-password",
    },
  },
};

export type HelpDeskStackParamList = {
  HelpDeskList: undefined;
  HelpDeskCreate: undefined;
  HelpDeskDetail: { questionId: number };
};

export type RootStackParamList = {
  MainApp: undefined;
  Report: undefined;
  MyReports: undefined;
  UnifiedSearch: {
    searchType: string;
    title: string;
    initialSearchTerm?: string;
  };
  NoticeList: undefined;
  NoticeDetail: { noticeId: number; noticeTitle: string };
  ArrestNewsList: undefined;
  ArrestNewsDetail: { newsId: number; newsTitle: string };
  ChatList: undefined;
  ChatMessageScreen: { roomId: string; roomName: string };
  NewChatScreen: undefined;
  SignIn: undefined;
  SignUp: undefined;
  ReviewList: undefined;
  ReviewDetail: { reviewId: number; reviewTitle: string };
  ReviewCreate: undefined;
  IncidentPhotoList: undefined;
  IncidentPhotoDetail: { photoId: number; photoTitle: string };
  NewCrimeCaseList: undefined;
  NewCrimeCaseDetail: { caseId: number };
  NewCrimeCaseCreate: undefined;
  VoiceAnalysis: undefined;
  FindEmail: undefined;
  ResetPassword: undefined;
  UpdatePassword: undefined;
  AdditionalInfo: undefined;
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
const HelpDeskNativeStack = createNativeStackNavigator<HelpDeskStackParamList>();

function CommunityStack() {
  return (
    <CommunityNativeStack.Navigator
      id={undefined}
      initialRouteName="CommunityList"
    >
      <CommunityNativeStack.Screen
        name="CommunityList"
        component={CommunityListScreen}
        options={{ title: "커뮤니티" }}
      />
      <CommunityNativeStack.Screen
        name="CommunityPostDetail"
        component={CommunityPostDetailScreen}
      />
      <CommunityNativeStack.Screen
        name="CommunityPostCreate"
        component={CommunityPostCreateScreen}
        options={{ title: "새 글 작성" }}
      />
    </CommunityNativeStack.Navigator>
  );
}

function HelpDeskStack() {
  return (
    <HelpDeskNativeStack.Navigator id={undefined} initialRouteName="HelpDeskList">
      <HelpDeskNativeStack.Screen
        name="HelpDeskList"
        component={HelpDeskListScreen}
        options={{ title: "1:1 문의" }}
      />
      <HelpDeskNativeStack.Screen
        name="HelpDeskCreate"
        component={HelpDeskCreateScreen}
        options={{ title: "문의 작성" }}
      />
      <HelpDeskNativeStack.Screen
        name="HelpDeskDetail"
        component={HelpDeskDetailScreen}
        options={{ title: "문의 상세" }}
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
          let iconName = "";
          if (route.name === "SearchTab") {
            iconName = focused ? "magnify" : "magnify";
          } else if (route.name === "ChatTab") {
            iconName = focused ? "chat-processing" : "chat-processing-outline";
          } else if (route.name === "CommunityTab") {
            iconName = focused ? "forum" : "forum-outline";
          } else if (route.name === "MyTab") {
            iconName = focused ? "account-circle" : "account-circle-outline";
          } else if (route.name === "HelpCenterTab") {
            iconName = focused ? "help-circle" : "help-circle-outline";
          }
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#3d5afe",
        tabBarInactiveTintColor: "gray",
        tabBarStyle: {
          height: Platform.OS === "android" ? 65 + insets.bottom : 90,
          paddingBottom: Platform.OS === "android" ? insets.bottom + 5 : 30,
          paddingTop: 5,
        },
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 11,
          paddingBottom: Platform.OS === "ios" ? 0 : 5,
        },
      })}
    >
      <Tab.Screen
        name="SearchTab"
        component={HomeScreen}
        options={{ title: "검색" }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatListScreen}
        options={{ title: "채팅", headerShown: true }}
      />
      <Tab.Screen
        name="CommunityTab"
        component={CommunityStack}
        options={{ title: "커뮤니티" }}
      />
      <Tab.Screen
        name="MyTab"
        component={SettingsScreen}
        options={{ title: "MY" }}
      />
      <Tab.Screen
        name="HelpCenterTab"
        component={HelpDeskStack} // listener 방식 대신 스택 컴포넌트를 직접 연결
        options={{ title: "헬프센터" }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3d5afe" />
        <Text style={{ marginTop: 10 }}>
          세션 및 프로필 정보를 확인 중입니다...
        </Text>
      </View>
    );
  }

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
            options={{ title: "아이디 찾기" }}
          />
          <RootStack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ title: "비밀번호 찾기" }}
          />
          <RootStack.Screen
            name="UpdatePassword"
            component={UpdatePasswordScreen}
            options={{ title: "새 비밀번호 설정" }}
          />
        </>
      ) : !profile ? (
        <>
          <RootStack.Screen
            name="AdditionalInfo"
            component={AdditionalInfoScreen}
            options={{ title: "추가 정보 입력", headerShown: false }}
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
            options={{ title: "신종범죄 피해사례" }}
          />
          <RootStack.Screen
            name="NewCrimeCaseDetail"
            component={NewCrimeCaseDetailScreen}
            options={{ title: "신종범죄 사례 상세" }}
          />
          <RootStack.Screen
            name="NewCrimeCaseCreate"
            component={NewCrimeCaseCreateScreen}
            options={{ title: "사례 등록" }}
          />
          <RootStack.Screen
            name="MyReports"
            component={MyReportsScreen}
            options={{ title: "나의 피해사례" }}
          />
          <RootStack.Screen
            name="Report"
            component={ReportScreen}
            options={{ title: "사기 정보 입력" }}
          />
          <RootStack.Screen
            name="UnifiedSearch"
            component={UnifiedSearchScreen}
            options={{ title: "통합 검색" }}
          />
          <RootStack.Screen
            name="NoticeList"
            component={NoticeListScreen}
            options={{ title: "공지사항" }}
          />
          <RootStack.Screen
            name="NoticeDetail"
            component={NoticeDetailScreen}
          />
          <RootStack.Screen
            name="ArrestNewsList"
            component={ArrestNewsListScreen}
            options={{ title: "검거소식" }}
          />
          <RootStack.Screen
            name="ArrestNewsDetail"
            component={ArrestNewsDetailScreen}
            options={({ route }) => ({ title: route.params.newsTitle })}
          />
          <RootStack.Screen
            name="ReviewList"
            component={ReviewListScreen}
            options={{ title: "크레디톡 후기" }}
          />
          <RootStack.Screen
            name="ReviewDetail"
            component={ReviewDetailScreen}
          />
          <RootStack.Screen
            name="ReviewCreate"
            component={ReviewCreateScreen}
            options={{ title: "후기 작성" }}
          />
          <RootStack.Screen
            name="IncidentPhotoList"
            component={IncidentPhotoListScreen}
            options={{ title: "사건 사진자료" }}
          />
          <RootStack.Screen
            name="IncidentPhotoDetail"
            component={IncidentPhotoDetailScreen}
          />
          <RootStack.Screen
            name="ChatList"
            component={ChatListScreen}
            options={{ title: "채팅 목록" }}
          />
          <RootStack.Screen
            name="ChatMessageScreen"
            component={ChatMessageScreen}
          />
          <RootStack.Screen
            name="NewChatScreen"
            component={NewChatScreen}
            options={{ title: "새 채팅 시작" }}
          />
          <RootStack.Screen
            name="VoiceAnalysis"
            component={VoiceAnalysisScreen}
            options={{ title: "통화 녹음 파일 분석" }}
          />
          <RootStack.Screen
            name="UpdatePassword"
            component={UpdatePasswordScreen}
            options={{ title: "새 비밀번호 설정" }}
          />
        </>
      )}
    </RootStack.Navigator>
  );
}

function App(): React.JSX.Element {
  useEffect(() => {
    NaverLogin.initialize({
      appName: "크레디톡",
      consumerKey: "QWU6hRfI6lQMlQ5QIZN1",
      consumerSecret: "VtyqGV8HHb",
      serviceUrlSchemeIOS: "credittalk",
      disableNaverAppAuthIOS: false,
    });
  }, []);

  const setupCallDetection = async () => {
    // 안드로이드 플랫폼에서만 실행
    if (Platform.OS === 'android') {
      try {
        // 사용자에게 전화 및 연락처 관련 권한을 요청합니다.
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
          PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        ]);

        if (
          granted[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.READ_CONTACTS] === PermissionsAndroid.RESULTS.GRANTED
        ) {
          console.log('Call detection permissions granted.');
          // 권한이 모두 부여되면, Supabase에서 블랙리스트를 가져와 네이티브 모듈에 동기화합니다.
          await syncBlacklist();
        } else {
          console.log('One or more call detection permissions were denied.');
        }
      } catch (err) {
        console.warn('Error requesting call detection permissions:', err);
      }
    }
  };

  setupCallDetection();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer
          linking={linking}
          fallback={<Text>Loading...</Text>}
        >
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
});

export default App;
