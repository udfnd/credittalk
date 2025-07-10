// src/screens/CommunityListScreen.js
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
  Image, // Image 컴포넌트 추가
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { logPageView } from "../lib/pageViewLogger";

function CommunityListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  useEffect(() => {
    // 로그인한 사용자만 기록합니다.
    if (user) {
      logPageView(user.id, 'CommunityListScreen');
    }
  }, [user]);

  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchPosts = useCallback(async () => {
    // 새로고침이 아닐 때만 로딩 인디케이터 표시
    if (!refreshing) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('community_posts_with_author_profile') // 생성한 뷰 사용
        .select('id, title, created_at, author_auth_id, views, author_name, image_urls') // image_urls 추가
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
  }, [refreshing]); // refreshing 상태가 변경될 때마다 fetchPosts를 다시 생성

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

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.postItem}
      onPress={() =>
        navigation.navigate('CommunityPostDetail', {
          postId: item.id,
          postTitle: item.title,
        })
      }
    >
      <View style={styles.postContent}>
        {/* 썸네일 이미지 표시 */}
        {item.image_urls && item.image_urls.length > 0 && (
          <Image source={{ uri: item.image_urls[0] }} style={styles.thumbnail} />
        )}
        <View style={styles.textContainer}>
          <Text style={styles.postTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.postMeta}>
            <Text style={styles.postAuthor}>{item.author_name || '익명'}</Text>
            <Text style={styles.postDate}>
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
            <Text style={styles.postViews}>조회수: {item.views || 0}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

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
        keyExtractor={(item) => item.id.toString()}
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
  postItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 1,
    padding: 15,
  },
  postContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  postMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  postAuthor: {
    fontSize: 12,
    color: '#3498db',
  },
  postDate: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  postViews: {
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
    right: 10,
    bottom: 10,
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
