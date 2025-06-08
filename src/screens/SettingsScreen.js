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
import { useNavigation } from '@react-navigation/native';

function SettingsScreen() {
  const { user, profile, signOutUser, isLoading: authIsLoading } = useAuth();
  const navigation = useNavigation();

  const handleHelpCenterLink = () => {
    Alert.alert(
        '헬프센터 안내',
        '한국금융범죄예방연구센터에 상담글을 올려주시면, 담당자가 순차적으로 연락드릴 예정입니다.',
        [
          {
            text: '확인',
            onPress: () => {
              Linking.openURL('https://naver.me/GhSYIDyA').catch(() =>
                  Alert.alert('오류', '링크를 열 수 없습니다.'),
              );
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
    {
      id: 'myReports',
      title: '나의 피해사례',
      icon: 'file-document-outline',
      action: () => navigation.navigate('MyReports'),
      requiresAuth: true,
    },
    {
      id: 'notices',
      title: '공지사항',
      icon: 'bullhorn-outline',
      action: () => navigation.navigate('NoticeList'),
      requiresAuth: true,
    },
    {
      id: 'reportScam',
      title: '피해사례 등록',
      icon: 'alert-plus-outline',
      action: () => navigation.navigate('Report'),
      requiresAuth: true,
    },
    {
      id: 'helpCenter',
      title: '헬프센터 (한국금융범죄예방연구센터)',
      icon: 'face-agent',
      action: handleHelpCenterLink, // 새로운 함수로 교체
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
                .filter((item) =>
                    ['myReports', 'notices', 'reportScam'].includes(item.id),
                )
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
