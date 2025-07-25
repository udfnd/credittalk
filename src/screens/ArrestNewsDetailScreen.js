import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import CommentsSection from "../components/CommentsSection";

const { width } = Dimensions.get('window');

function ArrestNewsDetailScreen({ route, navigation }) {
  const { newsId, newsTitle } = route.params;
  const [news, setNews] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (newsTitle) {
      navigation.setOptions({ title: newsTitle });
    }
  }, [newsTitle, navigation]);

  const fetchNewsDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('arrest_news')
        .select('id, title, content, created_at, author_name, image_urls, is_pinned')
        .eq('id', newsId)
        .eq('is_published', true)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new Error('소식을 찾을 수 없거나 접근 권한이 없습니다.');
        }
        throw fetchError;
      }
      setNews(data);
    } catch (err) {
      setError(err.message || '소식 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [newsId]);

  useEffect(() => {
    fetchNewsDetail();
  }, [fetchNewsDetail]);

  const renderImages = () => {
    // --- (수정된 부분 2) ---
    // image_urls 배열이 유효한지 확인하고, 여러 이미지를 렌더링하는 로직
    if (!news?.image_urls || news.image_urls.length === 0) {
      return null;
    }

    // 이미지가 하나일 경우
    if (news.image_urls.length === 1) {
      return (
        <Image
          source={{ uri: news.image_urls[0] }}
          style={styles.mainImage}
          resizeMode="cover"
        />
      );
    }

    // 이미지가 여러 개일 경우 수평 스크롤 갤러리 렌더링
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.imageScrollView}
        pagingEnabled // 스크롤 시 이미지 단위로 자연스럽게 넘어가도록 설정
      >
        {news.image_urls.map((url, index) => (
          <Image
            key={index}
            source={{ uri: url }}
            style={styles.galleryImage}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
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
        <TouchableOpacity onPress={fetchNewsDetail} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!news) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>소식 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.headerContainer}>
          {/* --- (추가된 부분) --- */}
          {/* is_pinned가 true일 경우 핀 아이콘과 텍스트를 표시합니다. */}
          {news.is_pinned && (
            <View style={styles.pinnedContainer}>
              <Icon name="pin" size={16} color="#d35400" />
              <Text style={styles.pinnedText}>상단 고정된 소식</Text>
            </View>
          )}
          <Text style={styles.title}>{news.title}</Text>
          <View style={styles.metaContainer}>
            <Text style={styles.author}>
              작성자: {news.author_name || '관리자'}
            </Text>
            <Text style={styles.date}>
              게시일: {new Date(news.created_at).toLocaleDateString()}
            </Text>
          </View>
        </View>

        {/* --- (수정된 부분 3) --- */}
        {/* 이미지를 렌더링하는 함수를 호출합니다. */}
        {renderImages()}

        <View style={styles.contentContainer}>
          <Text style={styles.content}>{news.content || '내용이 없습니다.'}</Text>
        </View>
        <CommentsSection postId={newsId} boardType="arrest_news" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // --- (수정 및 추가된 스타일) ---
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f9f9f9',
  },
  headerContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },
  pinnedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pinnedText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#d35400',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  author: { fontSize: 14, color: '#7f8c8d' },
  date: { fontSize: 14, color: '#7f8c8d' },
  mainImage: { // 이미지가 하나일 때 사용
    width: width,
    height: width * 0.65,
    marginBottom: 20,
  },
  imageScrollView: { // 이미지 갤러리 컨테이너
    paddingHorizontal: 0,
    alignItems: 'center',
    marginBottom: 20,
  },
  galleryImage: { // 갤러리 내 각 이미지
    width: width,
    height: width * 0.8, // 갤러리 이미지는 더 크게 표시
    backgroundColor: '#e0e0e0',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    backgroundColor: '#ffffff',
    paddingTop: 20,
  },
  content: {
    fontSize: 16,
    lineHeight: 28, // 가독성을 위한 줄 간격 조정
    color: '#34495e'
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
  },
  emptyText: { fontSize: 16, color: '#7f8c8d' },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#3d5afe',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: { color: 'white', fontSize: 16 },
});

export default ArrestNewsDetailScreen;
