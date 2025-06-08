import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';

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
        .select('id, title, content, created_at, author_name, image_url')
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
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{news.title}</Text>
      <View style={styles.metaContainer}>
        <Text style={styles.author}>
          작성자: {news.author_name || '관리자'}
        </Text>
        <Text style={styles.date}>
          게시일: {new Date(news.created_at).toLocaleDateString()}
        </Text>
      </View>
      {news.image_url && (
        <Image
          source={{ uri: news.image_url }}
          style={styles.mainImage}
          resizeMode="cover"
        />
      )}
      <View style={styles.contentContainer}>
        <Text style={styles.content}>{news.content || '내용이 없습니다.'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: { flex: 1, backgroundColor: '#fff' },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  author: { fontSize: 14, color: '#7f8c8d' },
  date: { fontSize: 14, color: '#7f8c8d' },
  mainImage: {
    width: '100%',
    height: width * 0.6,
    marginBottom: 20,
    backgroundColor: '#e0e0e0',
  },
  contentContainer: { paddingHorizontal: 20, paddingBottom: 40 },
  content: { fontSize: 16, lineHeight: 26, color: '#34495e' },
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
