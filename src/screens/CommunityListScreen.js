import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { logPageView } from '../lib/pageViewLogger';

function CommunityListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      logPageView(user.id, 'CommunityListScreen');
    }
  }, [user]);

  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchPosts = useCallback(async () => {
    if (!refreshing) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('community_posts_with_author_profile')
        .select(
          'id, title, created_at, author_auth_id, views, author_name, image_urls',
        ) // image_urls added
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setPosts(data || []);
    } catch (err) {
      console.error('Error in fetchPosts:', err);
      setError(err.message || '게시글을 불러오는데 실패했습니다.');
      setPosts([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    if (isFocused) {
      fetchPosts();
    }
  }, [fetchPosts, isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  const handleCreatePost = () => {
    if (!user) {
      Alert.alert('로그인 필요', '글을 작성하려면 로그인이 필요합니다.', [
        { text: '로그인', onPress: () => navigation.navigate('SignIn') },
        { text: '취소', style: 'cancel' },
      ]);
      return;
    }
    navigation.navigate('CommunityPostCreate');
  };

  // [CORE MODIFICATION] renderItem layout changed to match NoticeListScreen
  const renderItem = ({ item }) => {
    const thumbnailUrl =
      item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null;

    return (
      <TouchableOpacity
        style={styles.noticeItem}
        onPress={() =>
          navigation.navigate('CommunityPostDetail', {
            postId: item.id,
            postTitle: item.title,
          })
        }>
        <View style={styles.noticeContent}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Icon name="comment-text-outline" size={30} color="#bdc3c7" />
            </View>
          )}
          <View style={styles.textContainer}>
            <Text style={styles.noticeTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.noticeMeta}>
              <Text style={styles.noticeAuthor} numberOfLines={1}>
                {item.author_name || '익명'}
              </Text>
              <Text style={styles.noticeDate}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
              <Text style={styles.noticeViews}>조회 {item.views || 0}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && !refreshing && posts.length === 0) {
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
    <View style={styles.container}>
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.centered}>
              <Icon
                name="comment-text-multiple-outline"
                size={50}
                color="#bdc3c7"
              />
              <Text style={styles.emptyText}>등록된 게시글이 없습니다.</Text>
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
      <TouchableOpacity style={styles.fab} onPress={handleCreatePost}>
        <Icon name="plus" size={30} color="white" />
      </TouchableOpacity>
    </View>
  );
}

// [CORE MODIFICATION] Styles updated to match NoticeListScreen
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
  noticeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  noticeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  noticeAuthor: {
    fontSize: 12,
    color: '#7f8c8d',
    flexShrink: 1, // Allow author name to shrink if needed
    marginRight: 8,
  },
  noticeDate: {
    fontSize: 12,
    color: '#95a5a6',
    marginRight: 8,
  },
  noticeViews: {
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
  fab: {
    position: 'absolute',
    margin: 16,
    right: 20,
    bottom: 60,
    backgroundColor: '#3d5afe',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
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
});

export default CommunityListScreen;
