import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useHeaderHeight } from '@react-navigation/elements';
import { supabase } from '../lib/supabaseClient';
import CommentsSection from "../components/CommentsSection";

const { width } = Dimensions.get('window');

function IncidentPhotoDetailScreen({ route, navigation }) {
  const { photoId, photoTitle } = route.params;
  const headerHeight = useHeaderHeight(); // iOS 키보드 회피 offset

  const [photo, setPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (photoTitle) {
      navigation.setOptions({ title: photoTitle });
    }
  }, [photoTitle, navigation]);

  const sanitizeUrl = (raw) => {
    if (!raw) return "";
    return String(raw).trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "").replace(/\s+/g, "");
  };

  const handleLinkPress = async (rawUrl) => {
    const url = sanitizeUrl(rawUrl);
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else await Linking.openURL(url);
    } catch (e) {
      Alert.alert("오류", `이 링크를 열 수 없습니다: ${e.message}`);
    }
  };

  const fetchPhotoDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('incident_photos')
        .select('id, title, created_at, image_urls, category, description, link_url')
        .eq('id', photoId)
        .eq('is_published', true)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new Error('사진 자료를 찾을 수 없거나 접근 권한이 없습니다.');
        }
        throw fetchError;
      }
      setPhoto(data);
    } catch (err) {
      setError(err.message || '사진 자료 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [photoId]);

  useEffect(() => { fetchPhotoDetail(); }, [fetchPhotoDetail]);

  const handleScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    setCurrentImageIndex(index);
  };

  const renderImages = () => {
    if (!photo?.image_urls || photo.image_urls.length === 0) return null;

    return (
      <View style={styles.imageContainer}>
        {/* 가로 스크롤은 세로 ScrollView와 방향이 달라 중첩 경고 없음 */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {photo.image_urls.map((url, index) => (
            <Image
              key={index}
              source={{ uri: url }}
              style={styles.photoImage}
              resizeMode="contain"
            />
          ))}
        </ScrollView>
        {photo.image_urls.length > 1 && (
          <View style={styles.indicatorContainer}>
            {photo.image_urls.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.indicator,
                  index === currentImageIndex ? styles.activeIndicator : null,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={50} color="#e74c3c" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchPhotoDetail} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!photo) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>사진 자료 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 화면 전체 키보드 회피 + 흰 배경으로 갭 메우기 */}
      <KeyboardAvoidingView
        style={styles.kbWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        {/* 본문만 세로 ScrollView로 렌더링 */}
        <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          <View style={styles.headerContainer}>
            <Text style={styles.title}>{photo.title}</Text>
          </View>

          {renderImages()}

          <View style={styles.detailsContainer}>
            <View style={styles.metaContainer}>
              {photo.category && (
                <Text style={styles.category}>
                  <Icon name="tag-outline" size={15} color="#2980b9" /> {photo.category}
                </Text>
              )}
              <Text style={styles.date}>
                <Icon name="calendar-blank-outline" size={15} color="#7f8c8d" />{" "}
                {new Date(photo.created_at).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.contentContainer}>
              <Text style={styles.descriptionLabel}>상세 정보</Text>
              <Text style={styles.content}>{photo.description || '설명이 없습니다.'}</Text>
            </View>

            {photo.link_url && (
              <TouchableOpacity style={styles.linkButton} onPress={() => handleLinkPress(photo.link_url)}>
                <Icon name="link-variant" size={20} color="#fff" />
                <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* 댓글 섹션: ScrollView 바깥(형제) → FlatList 중첩 경고 제거 */}
        <CommentsSection postId={photoId} boardType="incident_photos" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // 레이아웃/배경
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  kbWrapper: { flex: 1, backgroundColor: '#fff' }, // 키보드-입력창 사이 갭 흰색 처리

  // 로딩/에러 상태
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f8f9fa',
  },
  errorText: { marginTop: 10, fontSize: 16, color: '#e74c3c', textAlign: 'center' },
  emptyText: { fontSize: 16, color: '#7f8c8d' },
  retryButton: {
    marginTop: 20, backgroundColor: '#3d5afe', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5,
  },
  retryButtonText: { color: 'white', fontSize: 16 },

  // 본문 헤더/제목
  headerContainer: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 15, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2c3e50', textAlign: 'left' },

  // 이미지 갤러리(가로 방향)
  imageContainer: { marginBottom: 20 },
  photoImage: {
    width,
    height: width * 0.8,
    backgroundColor: '#000', // contain 시 레터박스 영역을 검정으로
  },
  indicatorContainer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    position: 'absolute', bottom: 15, width: '100%',
  },
  indicator: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.5)', marginHorizontal: 4,
  },
  activeIndicator: { backgroundColor: '#ffffff' },

  // 상세 카드
  detailsContainer: {
    backgroundColor: '#ffffff',
    padding: 20,
    marginHorizontal: 15,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  metaContainer: {
    marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#ecf0f1',
  },
  category: { fontSize: 16, color: '#2980b9', marginBottom: 8, fontWeight: '600' },
  date: { fontSize: 14, color: '#7f8c8d' },

  contentContainer: { marginTop: 5 },
  descriptionLabel: { fontSize: 18, fontWeight: 'bold', color: '#34495e', marginBottom: 10 },
  content: { fontSize: 16, lineHeight: 26, color: '#34495e' },

  // 링크 버튼
  linkButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3d5afe', paddingVertical: 14, borderRadius: 8, marginTop: 15,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 2,
  },
  linkButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
});

export default IncidentPhotoDetailScreen;
