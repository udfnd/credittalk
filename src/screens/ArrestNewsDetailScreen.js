import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  Dimensions,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// 1. 이전에 만든 댓글 컴포넌트를 import 합니다.
import CommentsSection from '../components/CommentsSection';

// 화면 너비 계산
const { width } = Dimensions.get('window');
const contentPadding = 20;
const imageWidth = width - contentPadding * 2;

const ArrestNewsDetailScreen = () => {
  const route = useRoute();
  // 검거 소식 게시글의 ID를 파라미터로 받습니다.
  const { newsId } = route.params;
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNewsDetails = async () => {
      if (!newsId) {
        Alert.alert('오류', '게시글 정보를 가져올 수 없습니다.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // 'arrest_news' 테이블에서 'link_url'과 'image_urls'을 포함한 모든 정보를 조회합니다.
        const { data, error } = await supabase
          .from('arrest_news') // 테이블명을 'arrest_news'로 가정
          .select('*, link_url, image_urls')
          .eq('id', newsId)
          .single();

        if (error) throw error;
        setNews(data);
      } catch (error) {
        console.error('Error fetching arrest news:', error);
        Alert.alert('오류', '검거 소식을 불러오는 중 문제가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchNewsDetails();
  }, [newsId]);

  // 링크 열기 핸들러 (기존 기능 유지)
  const handleLinkPress = async (url) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('오류', `이 링크를 열 수 없습니다: ${url}`);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </SafeAreaView>
    );
  }

  if (!news) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>해당 검거 소식을 찾을 수 없습니다.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.postContainer}>
          <Text style={styles.title}>{news.title}</Text>
          <Text style={styles.date}>
            {format(new Date(news.created_at), 'yyyy년 MM월 dd일 HH:mm', {
              locale: ko,
            })}
          </Text>
          <View style={styles.separator} />
          <Text style={styles.content}>{news.content}</Text>

          {/* 이미지 갤러리 렌더링 (기존 기능 유지) */}
          {news.image_urls && news.image_urls.length > 0 && (
            <View style={styles.imageGallery}>
              {news.image_urls.map((url, index) => (
                <Image
                  key={index}
                  source={{ uri: url }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ))}
            </View>
          )}
        </View>
        <CommentsSection postId={newsId} boardType="arrest_news" />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#555',
  },
  postContainer: {
    backgroundColor: '#fff',
    padding: contentPadding,
    borderBottomWidth: 8,
    borderBottomColor: '#F8F9FA',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#212529',
  },
  date: {
    fontSize: 14,
    color: '#868E96',
    marginBottom: 20,
  },
  separator: {
    height: 1,
    backgroundColor: '#E9ECEF',
    marginBottom: 25,
  },
  content: {
    fontSize: 16,
    lineHeight: 28,
    color: '#495057',
    marginBottom: 20,
  },
  imageGallery: {
    marginTop: 10,
    marginBottom: 20,
  },
  image: {
    width: imageWidth,
    height: imageWidth * 0.75,
    borderRadius: 8,
    marginBottom: 15,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3d5afe',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

export default ArrestNewsDetailScreen;
