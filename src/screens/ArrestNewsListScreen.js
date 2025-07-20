import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { logPageView } from "../lib/pageViewLogger";
import { useAuth } from "../context/AuthContext";

function ArrestNewsListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [news, setNews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    // 로그인한 사용자만 기록합니다.
    if (user) {
      logPageView(user.id, 'ArrestNewsListScreen');
    }
  }, [user]);

  const fetchNews = useCallback(async () => {
    if (!refreshing) setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('arrest_news')
        .select('id, title, created_at, author_name, image_urls, is_pinned')
        .eq('is_published', true)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setNews(data || []);
    } catch (err) {
      setError(err.message || '검거소식을 불러오는데 실패했습니다.');
      setNews([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    if (isFocused) {
      fetchNews();
    }
  }, [fetchNews, isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNews();
  }, [fetchNews]);

  const renderItem = ({ item }) => {
    // --- (수정된 부분 2) ---
    // image_urls 배열이 존재하고, 비어있지 않은 경우 첫 번째 이미지를 썸네일로 사용합니다.
    const thumbnailUrl =
      item.image_urls && item.image_urls.length > 0
        ? item.image_urls[0]
        : null;

    return (
      <TouchableOpacity
        style={styles.newsItem}
        onPress={() =>
          navigation.navigate('ArrestNewsDetail', {
            newsId: item.id,
            newsTitle: item.title,
          })
        }
      >
        {/* thumbnailUrl 변수를 사용하여 이미지를 렌더링합니다. */}
        {thumbnailUrl && (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
        )}
        <View style={styles.infoContainer}>
          <View style={styles.titleContainer}>
            {item.is_pinned && (
              <Icon name="pin" size={16} color="#d35400" style={styles.pinIcon} />
            )}
            <Text style={styles.newsTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <View style={styles.metaContainer}>
            <Text style={styles.newsAuthor}>{item.author_name || '관리자'}</Text>
            <Text style={styles.newsDate}>
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && !refreshing) {
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
        <TouchableOpacity onPress={fetchNews} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={news}
      renderItem={renderItem}
      keyExtractor={(item) => item.id.toString()}
      contentContainerStyle={styles.listContainer}
      ListEmptyComponent={
        !isLoading && (
          <View style={styles.centered}>
            <Icon name="newspaper-variant-outline" size={50} color="#bdc3c7" />
            <Text style={styles.emptyText}>등록된 검거소식이 없습니다.</Text>
          </View>
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#3d5afe']}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContainer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  newsItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    flexDirection: 'row',
    overflow: 'hidden',
    // --- (수정된 부분 3) ---
    // 썸네일이 없는 경우에도 일관된 높이를 유지하도록 minHeight 추가
    minHeight: 100,
  },
  thumbnail: {
    width: 100,
    height: '100%',
    backgroundColor: '#e9e9e9', // 이미지가 없을 때 배경색
  },
  infoContainer: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  pinIcon: {
    marginRight: 6,
    marginTop: 2,
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    flex: 1,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
  },
  newsAuthor: {
    fontSize: 13,
    color: '#7f8c8d'
  },
  newsDate: {
    fontSize: 12,
    color: '#95a5a6'
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 10,
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

export default ArrestNewsListScreen;
