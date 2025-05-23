import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native'; // 타입 없이 사용
// import type { RootStackParamList } from '../../App'; // .js 파일에서는 이 import 불필요

const HELP_CENTER_PHONE_NUMBER = '010-9655-1604';

function SettingsScreen() {
  const { user, profile, signOutUser, isLoading: authIsLoading } = useAuth();
  const navigation = useNavigation(); // 타입 없이 호출

  const handleLinkPress = (url) => {
    Linking.openURL(url).catch((err) =>
      Alert.alert('오류', '링크를 열 수 없습니다: ' + err.message),
    );
  };

  const handleHelpCenterPress = () => {
    Alert.alert(
      '헬프센터 연결',
      `${HELP_CENTER_PHONE_NUMBER}\n어떤 방법으로 연결하시겠습니까?`,
      [
        {
          text: '전화걸기',
          onPress: () => {
            Linking.openURL(`tel:${HELP_CENTER_PHONE_NUMBER}`).catch((err) =>
              Alert.alert('오류', '전화 앱을 열 수 없습니다.'),
            );
          },
        },
        {
          text: '문자보내기',
          onPress: () => {
            // iOS와 Android에서 SMS body 파라미터 처리가 다를 수 있음
            const separator = Platform.OS === 'ios' ? '&' : '?';
            Linking.openURL(
              `sms:${HELP_CENTER_PHONE_NUMBER}${separator}body=`,
            ).catch((err) => Alert.alert('오류', '문자 앱을 열 수 없습니다.'));
          },
        },
        {
          text: '취소',
          style: 'cancel',
        },
      ],
      { cancelable: true },
    );
  };

  const menuItems = [
    // {
    //   id: 'profile',
    //   title: '프로필 관리',
    //   icon: 'account-edit-outline',
    //   action: () => Alert.alert('프로필 관리', '준비 중인 기능입니다.'),
    //   requiresAuth: true,
    // },
    {
      id: 'notices',
      title: '공지사항',
      icon: 'bullhorn-outline',
      action: () => navigation.navigate('NoticeList'), // 타입 없이도 navigate 가능
      requiresAuth: true,
    },
    {
      id: 'reportScam',
      title: '피해사례 등록',
      icon: 'alert-plus-outline',
      action: () => navigation.navigate('Report'), // 타입 없이도 navigate 가능
      requiresAuth: true,
    },
    {
      id: 'helpCenter',
      title: '헬프센터 (한국금융범죄예방연구센터)',
      icon: 'face-agent',
      action: () => handleHelpCenterPress(),
      requiresAuth: false,
    },
    {
      id: 'appInfo',
      title: '앱 정보',
      icon: 'information-outline',
      action: () =>
        Alert.alert(
          '앱 정보',
          'CreditTalk v1.0.0\n안전한 금융 거래를 위한 앱입니다.',
        ),
      requiresAuth: false,
    },
  ];

  const renderMenuItem = (item) => {
    if (item.requiresAuth && !user) return null;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.menuItem}
        onPress={item.action}
        activeOpacity={0.7}
      >
        <Icon name={item.icon} size={24} color="#555" style={styles.menuIcon} />
        <Text style={styles.menuText}>{item.title}</Text>
        <Icon name="chevron-right" size={24} color="#ccc" />
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <View style={styles.profileSection}>
          <Icon name="account-circle" size={80} color="#3d5afe" />
          <Text style={styles.profileName}>
            {profile?.name || user?.email || '게스트'}
          </Text>
          {user && <Text style={styles.profileEmail}>{user.email}</Text>}
        </View>

        <View style={styles.menuGroup}>
          <Text style={styles.menuGroupTitle}>서비스</Text>
          {menuItems
            .filter((item) => ['notices', 'reportScam'].includes(item.id))
            .map(renderMenuItem)}
        </View>

        <View style={styles.menuGroup}>
          <Text style={styles.menuGroupTitle}>고객지원</Text>
          {menuItems
            .filter((item) => ['helpCenter', 'appInfo'].includes(item.id))
            .map(renderMenuItem)}
        </View>

        {user && (
          <TouchableOpacity
            style={[styles.menuItem, styles.logoutButton]}
            onPress={signOutUser}
            disabled={authIsLoading}
          >
            <Icon
              name="logout"
              size={24}
              color="#e74c3c"
              style={styles.menuIcon}
            />
            <Text style={[styles.menuText, styles.logoutText]}>로그아웃</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

// 스타일 정의는 이전과 동일하게 유지
const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  container: {
    flex: 1,
    paddingVertical: 20,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: 'white',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  profileName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 15,
    color: '#333',
  },
  profileEmail: {
    fontSize: 16,
    color: '#777',
    marginTop: 5,
  },
  menuGroup: {
    backgroundColor: 'white',
    marginBottom: 20,
    borderRadius: Platform.OS === 'ios' ? 10 : 0,
    overflow: 'hidden',
  },
  menuGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 8,
    backgroundColor: '#f0f2f5',
    borderTopWidth: Platform.OS === 'android' ? 1 : 0,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuIcon: {
    marginRight: 15,
  },
  menuText: {
    flex: 1,
    fontSize: 17,
    color: '#333',
  },
  logoutButton: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  logoutText: {
    color: '#e74c3c',
    fontWeight: '600',
  },
});

export default SettingsScreen;
