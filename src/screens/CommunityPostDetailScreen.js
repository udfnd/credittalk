import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

function CommunityPostDetailScreen({ route }) {
  const navigation = useNavigation();
  const { postId, postTitle } = route.params;
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (postTitle) {
      navigation.setOptions({ title: postTitle });
    }
  }, [postTitle, navigation]);

  const fetchPostDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('community_posts_with_author_profile') // 뷰 사용
        .select(
          'id, title, content, created_at, author_auth_id, author_name, views',
        ) // 뷰 컬럼 선택 (views 추가)
        .eq('id', postId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new Error('게시글을 찾을 수 없거나 접근 권한이 없습니다.');
        }
        throw fetchError;
      }
      setPost(data);

      if (data && data.author_auth_id !== user?.id) {
        // RPC 함수가 있는지 확인하고 호출
        const { error: rpcError } = await supabase.rpc('increment_post_view', {
          post_id_input: postId,
        });
        if (rpcError)
          console.error('Failed to increment view count:', rpcError);
      }
    } catch (err) {
      console.error('Error in fetchPostDetail:', err);
      setError(err.message || '게시글 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [postId, user]);

  useEffect(() => {
    fetchPostDetail();
  }, [fetchPostDetail]);

  const handleDeletePost = async () => {
    if (post?.author_auth_id !== user?.id) {
      Alert.alert('권한 없음', '자신의 글만 삭제할 수 있습니다.');
      return;
    }
    Alert.alert('게시글 삭제', '정말로 이 게시글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);
          const { error: deleteError } = await supabase
            .from('community_posts') // 삭제는 원본 테이블에서
            .delete()
            .eq('id', postId);
          setIsLoading(false);
          if (deleteError) {
            Alert.alert('삭제 실패', deleteError.message);
          } else {
            Alert.alert('삭제 완료', '게시글이 삭제되었습니다.');
            navigation.goBack();
          }
        },
      },
    ]);
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
        <TouchableOpacity onPress={fetchPostDetail} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>게시글 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>{post.title}</Text>
        {user && post.author_auth_id === user.id && (
          <TouchableOpacity
            onPress={handleDeletePost}
            style={styles.deleteButton}
          >
            <Icon name="delete-outline" size={24} color="#e74c3c" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.metaContainer}>
        <Text style={styles.author}>작성자: {post.author_name || '익명'}</Text>
        <Text style={styles.date}>
          게시일: {new Date(post.created_at).toLocaleString()}
        </Text>
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.content}>{post.content || '내용이 없습니다.'}</Text>
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
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    flex: 1,
    marginRight: 10,
  },
  deleteButton: { padding: 5 },
  metaContainer: {
    flexDirection: 'column',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  author: { fontSize: 14, color: '#3498db', marginBottom: 5 },
  date: { fontSize: 14, color: '#7f8c8d' },
  contentContainer: {
    /* ... */
  },
  content: {
    fontSize: 16,
    lineHeight: 26,
    color: '#34495e',
    textAlign: 'justify',
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

export default CommunityPostDetailScreen;
