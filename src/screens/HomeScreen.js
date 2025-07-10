// src/screens/HomeScreen.js
import "react-native-get-random-values";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  TextInput,
  Keyboard,
  Alert,
  ScrollView,
  ImageBackground,
  Dimensions,
  Linking
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import LinearGradient from "react-native-linear-gradient";
import { useAuth } from "../context/AuthContext";

const { width } = Dimensions.get("window");
const BANNER_HEIGHT = 150;

const noticeBannerImg = require("../assets/images/notice_banner.jpg");
const arrestBannerImg = require("../assets/images/arrest_banner.jpg");
const crimeListBannerImg = require("../assets/images/crime_list_banner.jpg");
const reviewBannerImg = require("../assets/images/review_banner.jpg");
const incidentPhotosBannerImg = require("../assets/images/incident_photos_banner.jpg");
const freeBoardBannerImg = require("../assets/images/free_board_banner.jpg");
const helpCenterBannerImg = require("../assets/images/help_center_banner.jpg");
const companyLogoImg = require("../assets/images/company_logo.png");

function HomeScreen() {
  const navigation = useNavigation();
  const { user, profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearch = () => {
    Keyboard.dismiss();
    if (!searchTerm.trim()) {
      Alert.alert("검색어 입력", "연락처 또는 계좌번호를 입력해주세요.");
      return;
    }
    navigation.navigate("UnifiedSearch", {
      searchTerm: searchTerm.trim(),
      title: `'${searchTerm.trim()}' 검색 결과`,
    });
  };

  const renderImageBanner = (title, subtitle, backgroundImage, onPress) => (
    <TouchableOpacity
      onPress={onPress}
      style={styles.bannerTouchable}
      activeOpacity={0.8}
    >
      <ImageBackground
        source={backgroundImage}
        style={styles.bannerBackground}
        imageStyle={styles.bannerImageStyle}
        resizeMode="cover"
      >
        <View style={styles.bannerOverlay}>
          <Text style={styles.bannerTitle}>{title}</Text>
          {subtitle && <Text style={styles.bannerSubtitle}>{subtitle}</Text>}
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContentContainer}
      >
        <View style={styles.headerSection}>
          <Text style={styles.mainTitle}>CreditTalk</Text>
          <Text style={styles.greetingText}>
            {profile?.name || user?.email || "방문자"}님, 안전한 금융거래를 하실
            수 있도록 최선을 다하겠습니다.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.analysisBannerTouchable}
          onPress={() => navigation.navigate("VoiceAnalysis")}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={["#4343A2", "#3d5afe"]}
            start={{ x: 0.0, y: 0.25 }}
            end={{ x: 0.75, y: 1.0 }}
            style={styles.analysisBanner}
          >
            <View style={styles.analysisBannerContent}>
              <View>
                <Text style={styles.analysisTitle}>AI 통화 분석</Text>
                <Text style={styles.analysisSubtitle}>
                  녹음 파일을 분석해 보이스피싱 위험도를 확인하세요
                </Text>
              </View>
              <View style={styles.analysisCtaContainer}>
                <Text style={styles.analysisCtaText}>분석 시작하기</Text>
                <Icon name="arrow-right-circle" size={22} color="#fff" />
              </View>
            </View>
            <Icon
              name="shield-check-outline"
              size={90}
              style={styles.analysisBannerIcon}
            />
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.searchSection}>
          <Text style={styles.sectionTitle}>사기 피해사례 검색</Text>
          <View style={styles.searchBarContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="연락처, 계좌번호, 이름 등 검색"
              value={searchTerm}
              onChangeText={setSearchTerm}
              keyboardType="default"
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleSearch}
            >
              <Icon name="magnify" size={28} color="white" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.bannerSection}>
          {renderImageBanner(
            "크레디톡 개발 회사 소개",
            "한국금융범죄예방연구센터 소개입니다.",
            companyLogoImg,
            () => Linking.openURL("https://www.xn--jj0bj76bm2k.com/page/about")
          )}
          {renderImageBanner(
            "공지사항",
            "크레디톡의 새로운 소식을 확인하세요.",
            noticeBannerImg,
            () => navigation.navigate("NoticeList"),
          )}
          {renderImageBanner(
            "검거소식",
            "주요 금융범죄 검거 사례를 알려드립니다.",
            arrestBannerImg,
            () =>
              navigation.navigate("ArrestNewsList", {
                screen: "ArrestNewsList",
              }),
          )}
          {renderImageBanner(
            "신종범죄 피해사례 목록",
            "최신 사기 수법과 피해 사례를 확인하세요.",
            crimeListBannerImg,
            () => navigation.navigate("NewCrimeCaseList"),
          )}
          {renderImageBanner(
            "크레디톡 후기",
            "어플 오류, 개선사항 및 후기",
            reviewBannerImg,
            () => navigation.navigate("ReviewList"),
          )}
          {renderImageBanner(
            "사건 사진자료",
            "카톡대화, 텔레그램, 문자 등 사진공유",
            incidentPhotosBannerImg,
            () => navigation.navigate("IncidentPhotoList"),
          )}
          {renderImageBanner(
            "자유 게시판",
            "여러분들의 생각공유 공간",
            freeBoardBannerImg,
            () =>
              navigation.navigate("MainApp", {
                screen: "CommunityTab",
                params: { screen: "CommunityList" },
              }),
          )}
          {renderImageBanner(
            "헬프 상담게시판",
            "궁금한 사항들을 작성해주세요.",
            helpCenterBannerImg,
            () => navigation.navigate("HelpCenterTab", { screen: "HelpDeskList" }),
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.reportFloatingButton}
        onPress={() => navigation.navigate("Report")}
      >
        <Icon
          name="alert-plus-outline"
          size={22}
          color="white"
          style={{ marginRight: 6 }}
        />
        <Text style={styles.reportFloatingButtonText}>피해사례 등록</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: "#f0f2f5" },
  scrollContentContainer: { paddingBottom: 100 },
  headerSection: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 25 : 50,
    paddingBottom: 10,
  },
  mainTitle: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#1e3a5f",
    marginBottom: 8,
  },
  greetingText: {
    fontSize: 16,
    color: "#546e7a",
    marginBottom: 20,
    textAlign: "center",
  },
  analysisBannerTouchable: {
    marginHorizontal: 20,
    borderRadius: 16,
    elevation: 10,
    shadowColor: "#4343A2",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    backgroundColor: "white", // for iOS shadow
  },
  analysisBanner: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 180,
  },
  analysisBannerContent: {
    flex: 1,
  },
  analysisTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 5,
  },
  analysisSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.85)",
    maxWidth: "90%",
  },
  analysisCtaContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "flex-start", // 중요: 컨테이너 크기를 내용에 맞춤
  },
  analysisCtaText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    marginRight: 6,
  },
  analysisBannerIcon: {
    position: "absolute",
    right: -10,
    bottom: -10,
    color: "rgba(255, 255, 255, 0.15)",
  },
  companyLogo: {
    width: '100%',
    height: 150,
    borderRadius: 10,
    marginBottom: 15,
  },
  bannerSection: { paddingHorizontal: 20, marginBottom: 10, marginTop: 25 },
  bannerTouchable: {
    height: BANNER_HEIGHT,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 15,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  bannerBackground: { flex: 1, justifyContent: "flex-end" },
  bannerImageStyle: { borderRadius: 10 },
  bannerOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 3,
  },
  bannerSubtitle: { fontSize: 13, color: "#f0f0f0" },
  searchSection: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 25,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#34495e",
    marginBottom: 15,
    textAlign: "center",
  },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dee2e6",
  },
  searchInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 15,
    fontSize: 16,
    color: "#212529",
  },
  searchButton: {
    backgroundColor: "#3d5afe",
    padding: 12,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    height: 50,
    justifyContent: "center",
  },
  reportFloatingButton: {
    position: "absolute",
    bottom: 20,
    left: "50%",
    width: 180,
    marginLeft: -90,
    height: 50,
    backgroundColor: "#3d5afe",
    borderRadius: 25,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  reportFloatingButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default HomeScreen;
