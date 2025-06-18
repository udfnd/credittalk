import "react-native-get-random-values";
import "react-native-url-polyfill/auto";

import React, { useEffect } from "react";
import {
  Linking,
  Platform,
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  NavigationContainer,
  EventArg,
  useNavigation,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import NaverLogin from "@react-native-seoul/naver-login";
import { AuthProvider, useAuth } from "./src/context/AuthContext";

// Screens
import HomeScreen from "./src/screens/HomeScreen";
import ReportScreen from "./src/screens/ReportScreen";
import UnifiedSearchScreen from "./src/screens/UnifiedSearchScreen";
import SearchBaseScreen from "./src/screens/SearchBaseScreen";
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

const linking = {
  prefixes: ["credittalk://"],
  config: {
    screens: {
      UpdatePassword: "update-password",
    },
  },
};

export type RootStackParamList = {
  MainApp: undefined;
  Report: undefined;
  MyReports: undefined;
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
  NewCrimeCaseCreate: undefined;
  VoiceAnalysis: undefined;
  FindEmail: undefined;
  ResetPassword: undefined;
  UpdatePassword: undefined;
  HelpDeskList: undefined;
  HelpDeskCreate: undefined;
  HelpDeskDetail: { ticketId: number; ticketTitle: string };
  AdditionalInfo: undefined;
};

export type CommunityStackParamList = {
  CommunityList: undefined;
  CommunityPostDetail: { postId: number; postTitle: string };
  CommunityPostCreate: undefined;
};

export type ReviewStackParamList = {
  ReviewList: undefined;
  ReviewDetail: { reviewId: number; reviewTitle: string };
  ReviewCreate: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const CommunityNativeStack =
  createNativeStackNavigator<CommunityStackParamList>();
const ReviewNativeStack = createNativeStackNavigator<ReviewStackParamList>();
const Tab = createBottomTabNavigator();

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

function MainTabs() {
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleHelpCenterLink = () => {
    Alert.alert(
      "헬프센터 안내",
      "한국금융범죄예방연구센터에 상담글을 올려주시면, 담당자가 순차적으로 연락드릴 예정입니다.",
      [
        {
          text: "확인",
          onPress: () => {
            Linking.openURL("https://naver.me/GhSYIDyA").catch(() =>
              Alert.alert("오류", "링크를 열 수 없습니다."),
            );
          },
        },
        {
          text: "취소",
          style: "cancel",
        },
      ],
      { cancelable: true },
    );
  };

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
          height: Platform.OS === "ios" ? 90 : 65,
          paddingBottom: Platform.OS === "ios" ? 30 : 10,
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
        component={View}
        options={{ title: "헬프센터" }}
        listeners={{
          tabPress: (e: EventArg<"tabPress", true, undefined>) => {
            e.preventDefault();
            handleHelpCenterLink();
          },
        }}
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
        // 2. 소셜 로그인 후 추가 정보가 필요한 상태
        <>
          <RootStack.Screen
            name="AdditionalInfo"
            component={AdditionalInfoScreen}
            options={{ title: "추가 정보 입력", headerShown: false }}
          />
        </>
      ) : (
        // 3. 로그인 완료 및 프로필 존재 상태: 메인 앱 스크린 그룹
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
            name="NumericUnifiedSearch"
            component={SearchBaseScreen}
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
          <RootStack.Screen
            name="HelpDeskList"
            component={HelpDeskListScreen}
            options={{ title: "헬프센터" }}
          />
          <RootStack.Screen
            name="HelpDeskCreate"
            component={HelpDeskCreateScreen}
            options={{ title: "상담 글 작성" }}
          />
          <RootStack.Screen
            name="HelpDeskDetail"
            component={HelpDeskDetailScreen}
            options={({ route }) => ({
              title: route.params.ticketTitle,
            })}
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
      consumerKey: "belWdkUzgFugOnoHOfBs",
      consumerSecret: "x0Cc7_4tSU",
      serviceUrlSchemeIOS: "credittalk",
      disableNaverAppAuthIOS: false, // 네이버 앱으로 인증하는 것을 권장 (true로 설정 시 인앱 브라우저만 사용)
    });
  }, []);
  return (
    <AuthProvider>
      <NavigationContainer linking={linking} fallback={<Text>Loading...</Text>}>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
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
