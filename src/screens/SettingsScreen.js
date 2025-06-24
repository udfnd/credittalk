import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";

function SettingsScreen() {
  const { user, profile, signOutUser, isLoading: authIsLoading } = useAuth();
  const navigation = useNavigation();

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

  const handleMaliciousAppDetection = () => {
    Alert.alert(
      "악성앱 감지 안내",
      "플레이스토어, 앱스토어에서 'V3'를 검색하십시오. 해당 프로그램을 설치 후 '보안 점검' 기능을 활용하십시오.",
      [{ text: "확인" }],
    );
  };

  const handleRealNameCheckService = () => {
    const url = "https://credit-namecheck.netlify.app/";
    Linking.openURL(url).catch(() =>
      Alert.alert("오류", "링크를 열 수 없습니다."),
    );
  };

  const menuItems = [
    {
      id: "myReports",
      title: "내 신고 내역",
      icon: "file-document-outline",
      screen: "MyReports",
    },
    {
      id: "notices",
      title: "공지사항",
      icon: "bullhorn-outline",
      screen: "NoticeList",
    },
    {
      id: "reportScam",
      title: "신종 사기 수법 제보",
      icon: "lightbulb-on-outline",
      screen: "NewCrimeCaseCreate",
    },
    {
      id: "community",
      title: "피해 사례 공유",
      icon: "account-group-outline",
      screen: "CommunityTab",
    },
    {
      id: "helpCenter",
      title: "고객센터",
      icon: "help-circle-outline",
      onPress: handleHelpCenterLink,
    },
  ];

  const renderMenuItem = (item) => (
    <TouchableOpacity
      key={item.id}
      style={styles.menuItem}
      onPress={() =>
        item.onPress ? item.onPress() : navigation.navigate(item.screen)
      }
    >
      <Icon name={item.icon} size={24} color="#555" style={styles.menuIcon} />
      <Text style={styles.menuText}>{item.title}</Text>
      <Icon name="chevron-right" size={24} color="#ccc" />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <View style={styles.profileSection}>
          <Icon name="account-circle" size={60} color="#3d5afe" />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {authIsLoading ? "로딩중..." : profile?.name || "사용자"}
            </Text>
            <Text style={styles.profileEmail}>
              {authIsLoading ? "" : user?.email}
            </Text>
          </View>
        </View>

        <View style={styles.menuGroup}>
          <Text style={styles.menuGroupTitle}>보안 도구</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("VoiceAnalysis")}
          >
            <Icon
              name="shield-sound-outline"
              size={24}
              color="#555"
              style={styles.menuIcon}
            />
            <Text style={styles.menuText}>AI 통화 분석</Text>
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
            <Icon name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleMaliciousAppDetection}
          >
            <Icon
              name="lightbulb-on-outline"
              size={24}
              color="#555"
              style={styles.menuIcon}
            />
            <Text style={styles.menuText}>원터치 악성앱 감지</Text>
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
            <Icon name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>
          {/* [수정된 부분] 상대방 본인인증 서비스 버튼 추가 */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleRealNameCheckService}
          >
            <Icon
              name="card-account-details-outline"
              size={24}
              color="#555"
              style={styles.menuIcon}
            />
            <Text style={styles.menuText}>상대방 본인인증 서비스</Text>
            <Icon name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>
        </View>

        <View style={styles.menuGroup}>
          <Text style={styles.menuGroupTitle}>서비스</Text>
          {menuItems
            .filter((item) =>
              ["myReports", "notices", "reportScam"].includes(item.id),
            )
            .map(renderMenuItem)}
        </View>

        <View style={styles.menuGroup}>
          <Text style={styles.menuGroupTitle}>커뮤니티</Text>
          {menuItems
            .filter((item) => ["community"].includes(item.id))
            .map(renderMenuItem)}
        </View>

        <View style={styles.menuGroup}>
          <Text style={styles.menuGroupTitle}>지원</Text>
          {menuItems
            .filter((item) => ["helpCenter"].includes(item.id))
            .map(renderMenuItem)}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={signOutUser}>
          <Text style={styles.logoutButtonText}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  container: {
    paddingBottom: 30,
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  profileInfo: {
    marginLeft: 15,
  },
  profileName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  profileEmail: {
    fontSize: 14,
    color: "#777",
    marginTop: 4,
  },
  menuGroup: {
    marginTop: 20,
  },
  menuGroupTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  menuIcon: {
    marginRight: 15,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  logoutButton: {
    marginTop: 30,
    marginHorizontal: 20,
    padding: 15,
    backgroundColor: "#f1f3f5",
    borderRadius: 10,
    alignItems: "center",
  },
  logoutButtonText: {
    color: "#adb5bd",
    fontSize: 16,
    fontWeight: "500",
  },
  newBadge: {
    backgroundColor: "#e74c3c",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  newBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
});

export default SettingsScreen;
