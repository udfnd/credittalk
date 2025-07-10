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
        .select('id, title, created_at, author_name, image_url')
        .eq('is_published', true)
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
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.newsItem}
      onPress={() =>
        navigation.navigate('ArrestNewsDetail', {
          newsId: item.id,
          newsTitle: item.title,
        })
      }
    >
      {item.image_url && (
        <Image source={{ uri: item.image_url }} style={styles.thumbnail} />
      )}
      <View style={styles.infoContainer}>
        <Text style={styles.newsTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.metaContainer}>
          <Text style={styles.newsAuthor}>{item.author_name || '관리자'}</Text>
          <Text style={styles.newsDate}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
  listContainer: { padding: 10 },
  newsItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    flexDirection: 'row',
  },
  thumbnail: {
    width: 100,
    height: 100,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  infoContainer: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 5,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newsAuthor: { fontSize: 13, color: '#7f8c8d' },
  newsDate: { fontSize: 12, color: '#95a5a6' },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
  },
  emptyText: { marginTop: 10, fontSize: 16, color: '#7f8c8d' },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#3d5afe',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: { color: 'white', fontSize: 16 },
});

export default ArrestNewsListScreen;
