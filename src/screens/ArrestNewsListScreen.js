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
  SafeAreaView, // SafeAreaView 추가
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { logPageView } from '../lib/pageViewLogger';
import { useAuth } from '../context/AuthContext';

function ArrestNewsListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [news, setNews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
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
  }, []);

  const renderItem = ({ item }) => {
    const thumbnailUrl =
      item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null;

    return (
      <TouchableOpacity
        style={styles.noticeItem}
        onPress={() =>
          navigation.navigate('ArrestNewsDetail', {
            newsId: item.id,
            newsTitle: item.title,
          })
        }>
        <View style={styles.noticeContent}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Icon name="newspaper-variant-outline" size={30} color="#bdc3c7" />
            </View>
          )}
          <View style={styles.textContainer}>
            <View style={styles.titleContainer}>
              {item.is_pinned && (
                <Icon name="pin" size={16} color="#d35400" style={styles.pinIcon} />
              )}
              <Text style={styles.noticeTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
            <View style={styles.noticeMeta}>
              <Text style={styles.noticeAuthor}>{item.author_name || '관리자'}</Text>
              <Text style={styles.noticeDate}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const ListContent = () => {
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
          <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={news}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
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
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.container}>
        <ListContent />
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('ArrestNewsCreate')}>
          <Icon name="plus" size={30} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContainer: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  noticeItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 1,
    padding: 15,
  },
  noticeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 15,
  },
  thumbnailPlaceholder: {
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
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
  noticeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    flex: 1,
  },
  noticeMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  noticeAuthor: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  noticeDate: {
    fontSize: 12,
    color: '#95a5a6',
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
    color: '#7f8c8d',
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
    fontSize: 16,
  },
  // FAB 스타일 추가
  fab: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3d5afe',
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 40,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});

export default ArrestNewsListScreen;
