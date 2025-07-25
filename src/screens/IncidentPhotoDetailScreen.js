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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import CommentsSection from "../components/CommentsSection";

const { width } = Dimensions.get('window');

function IncidentPhotoDetailScreen({ route, navigation }) {
  const { photoId, photoTitle } = route.params;

  const [photo, setPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0); // 현재 이미지 인덱스 상태

  useEffect(() => {
    if (photoTitle) {
      navigation.setOptions({ title: photoTitle });
    }
  }, [photoTitle, navigation]);

  const fetchPhotoDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('incident_photos')
        .select('id, title, created_at, image_urls, category, description')
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

  useEffect(() => {
    fetchPhotoDetail();
  }, [fetchPhotoDetail]);

  // 스크롤 시 현재 이미지 인덱스를 계산하는 함수
  const handleScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    setCurrentImageIndex(index);
  };

  const renderImages = () => {
    // --- (수정된 부분 2) ---
    // image_urls 배열을 기반으로 이미지를 렌더링하는 로직
    if (!photo?.image_urls || photo.image_urls.length === 0) {
      return null;
    }

    return (
      <View style={styles.imageContainer}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16} // 스크롤 이벤트 최적화
        >
          {photo.image_urls.map((url, index) => (
            <Image
              key={index}
              source={{ uri: url }}
              style={styles.photoImage}
              resizeMode="contain" // 이미지가 잘리지 않도록 contain 사용
            />
          ))}
        </ScrollView>
        {/* 여러 이미지일 경우 인디케이터(점) 표시 */}
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
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>{photo.title}</Text>
        </View>

        {/* --- (수정된 부분 3) --- */}
        {/* 이미지 렌더링 함수 호출 */}
        {renderImages()}

        <View style={styles.detailsContainer}>
          <View style={styles.metaContainer}>
            {photo.category && (
              <Text style={styles.category}>
                <Icon name="tag-outline" size={15} color="#2980b9" /> {photo.category}
              </Text>
            )}
            <Text style={styles.date}>
              <Icon name="calendar-blank-outline" size={15} color="#7f8c8d" /> {new Date(photo.created_at).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.contentContainer}>
            <Text style={styles.descriptionLabel}>상세 정보</Text>
            <Text style={styles.content}>
              {photo.description || '설명이 없습니다.'}
            </Text>
          </View>
        </View>
        <CommentsSection postId={photoId} boardType="incident_photos" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // --- (전체적으로 개선된 스타일) ---
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'left',
  },
  imageContainer: {
    marginBottom: 20,
  },
  photoImage: {
    width: width, // 화면 전체 너비 사용
    height: width * 0.8,
    backgroundColor: '#000', // 배경을 검은색으로 하여 contain 모드에서 레터박스 효과
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 15,
    width: '100%',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 4,
  },
  activeIndicator: {
    backgroundColor: '#ffffff',
  },
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
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  category: {
    fontSize: 16,
    color: '#2980b9',
    marginBottom: 8,
    fontWeight: '600',
  },
  date: {
    fontSize: 14,
    color: '#7f8c8d'
  },
  contentContainer: {
    marginTop: 5
  },
  descriptionLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34495e',
    marginBottom: 10,
  },
  content: {
    fontSize: 16,
    lineHeight: 26,
    color: '#34495e'
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#7f8c8d'
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#3d5afe',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16
  },
});

export default IncidentPhotoDetailScreen;
