import 'react-native-get-random-values';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  TextInput,
  Keyboard,
  Alert,
  Button as RNButton,
  ScrollView,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { SEARCH_TYPES } from './SearchBaseScreen';
import type { RootStackParamList } from '../../App'; // App.tsx의 타입 임포트

const { width } = Dimensions.get('window');
const BANNER_HEIGHT = 150;

// 배너 이미지 경로
const noticeBannerImg = require('../assets/images/notice_banner.jpg');
const arrestBannerImg = require('../assets/images/arrest_banner.jpg');
const crimeListBannerImg = require('../assets/images/crime_list_banner.jpg');
const reviewBannerImg = require('../assets/images/review_banner.jpg'); // 새 배너 이미지
const incidentPhotosBannerImg = require('../assets/images/incident_photos_banner.jpg'); // 새 배너 이미지
const freeBoardBannerImg = require('../assets/images/free_board_banner.jpg'); // 새 배너 이미지

function HomeScreen() {
  const navigation = useNavigation();
  const { user, profile } = useAuth(); // signOutUser, authIsLoading은 MY 페이지에서 사용
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = () => {
    Keyboard.dismiss();
    if (!searchTerm.trim()) {
      Alert.alert('검색어 입력', '연락처 또는 계좌번호를 입력해주세요.');
      return;
    }
    navigation.navigate('NumericUnifiedSearch', {
      searchTerm: searchTerm.trim(),
      searchType: SEARCH_TYPES.NUMERIC_UNIFIED,
      title: `'${searchTerm.trim()}' 검색 결과`,
    });
  };

  const renderBanner = (title, subtitle, backgroundImage, onPress) => (
    <TouchableOpacity onPress={onPress} style={styles.bannerTouchable} activeOpacity={0.8}>
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
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContentContainer}>
        <View style={styles.headerSection}>
          <Text style={styles.mainTitle}>CreditTalk</Text>
          <Text style={styles.greetingText}>
            {profile?.name || user?.email || '방문자'}님,
            안전한 금융 거래를 지원합니다.
          </Text>
        </View>

        <View style={styles.searchSection}>
          <Text style={styles.sectionTitle}>사기 피해사례 검색</Text>
          <View style={styles.searchBarContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="연락처 또는 계좌번호 입력"
              value={searchTerm}
              onChangeText={setSearchTerm}
              keyboardType="numeric"
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
              <Icon name="magnify" size={28} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bannerSection}>
          {renderBanner(
            '공지사항',
            '크레디톡의 새로운 소식을 확인하세요.',
            noticeBannerImg,
            () => navigation.navigate('NoticeList')
          )}
          {renderBanner(
            '검거소식',
            '주요 금융범죄 검거 사례를 알려드립니다.',
            arrestBannerImg,
            () => navigation.navigate('ArrestNews')
          )}
          {renderBanner(
            '신종범죄 피해사례 목록',
            '최신 사기 수법과 피해 사례를 확인하세요.',
            crimeListBannerImg,
            () => navigation.navigate('UnifiedSearch', {
              searchType: SEARCH_TYPES.UNIFIED,
              title: '신종범죄 피해사례',
            })
          )}
          {/* === 새로운 배너 추가 === */}
          {renderBanner(
            '크레디톡 후기',
            '어플 오류, 개선사항 및 후기',
            reviewBannerImg,
            () => navigation.navigate('ReviewList')
          )}
          {renderBanner(
            '사건 사진자료',
            '카톡대화, 텔레그램, 문자 등 사진공유',
            incidentPhotosBannerImg,
            () => navigation.navigate('IncidentPhotoList')
          )}
          {renderBanner(
            '자유 게시판',
            '여러분들의 생각공유 공간',
            freeBoardBannerImg,
            // CommunityTab 네비게이터의 CommunityList 화면으로 이동
            () => navigation.navigate('MainApp', { screen: 'CommunityTab', params: { screen: 'CommunityList' } })
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.reportFloatingButton}
        onPress={() => navigation.navigate('Report')}
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
  scrollView: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  scrollContentContainer: {
    paddingBottom: 100,
  },
  headerSection: { alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 25 : 50, paddingBottom: 10,},
  mainTitle: { fontSize: 36, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 8,},
  greetingText: { fontSize: 16, color: '#546e7a', marginBottom: 20, textAlign: 'center', },
  searchSection: { backgroundColor: '#ffffff', borderRadius: 12, padding: 20, marginHorizontal: 20, marginBottom: 25, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,},
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#34495e', marginBottom: 15, textAlign: 'center',},
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: 8, borderWidth: 1, borderColor: '#dee2e6', },
  searchInput: { flex: 1, height: 50, paddingHorizontal: 15, fontSize: 16, color: '#212529', },
  searchButton: { backgroundColor: '#3d5afe', padding: 12, borderTopRightRadius: 8, borderBottomRightRadius: 8, height: 50, justifyContent: 'center', },
  bannerSection: { paddingHorizontal: 20, marginBottom: 10, },
  bannerTouchable: { height: BANNER_HEIGHT, borderRadius: 10, overflow: 'hidden', marginBottom: 15, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, },
  bannerBackground: { flex: 1, justifyContent: 'flex-end', },
  bannerImageStyle: { borderRadius: 10, },
  bannerOverlay: { backgroundColor: 'rgba(0, 0, 0, 0.4)', paddingHorizontal: 15, paddingVertical: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, },
  bannerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 3, },
  bannerSubtitle: { fontSize: 13, color: '#f0f0f0', },
  grid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20, },
  gridButton: { width: '48%', paddingVertical: 15, justifyContent: 'center', alignItems: 'center', borderRadius: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, },
  textSearchButton: { backgroundColor: '#27ae60', },
  settingsButton: { backgroundColor: '#8e44ad', },
  icon: { marginBottom: 5, },
  buttonText: { color: 'white', fontSize: 14, fontWeight: '600', textAlign: 'center', },
  reportFloatingButton: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    width: 180,
    marginLeft: -90,
    height: 50,
    backgroundColor: '#3d5afe',
    borderRadius: 25,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  reportFloatingButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default HomeScreen;
