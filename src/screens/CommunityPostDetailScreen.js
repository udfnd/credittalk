import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  Dimensions,
  Linking,
  ActionSheetIOS,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import CommentsSection from '../components/CommentsSection';
import { useIncrementView } from '../hooks/useIncrementView';
import { AvoidSoftInput } from 'react-native-avoid-softinput';
import ImageViewing from 'react-native-image-viewing';
import ReportModal from '../components/ReportModal'; // ReportModal import

const { width } = Dimensions.get('window');

function CommunityPostDetailScreen({ route }) {
  const navigation = useNavigation();
  const { postId, postTitle } = route.params;
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isViewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isReportModalVisible, setReportModalVisible] = useState(false); // ReportModal 상태 추가
  const scrollViewRef = useRef(null);

  useIncrementView('community_posts', postId);

  const isAuthor = useMemo(() => {
    if (!user || !post) return false;
    return user.id === post.author_auth_id;
  }, [user, post]);

  const fetchPostDetail = useCallback(async () => {
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('community_posts_with_author_profile')
        .select('*')
        .eq('id', postId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new Error('게시글을 찾을 수 없거나 접근 권한이 없습니다.');
        }
        throw fetchError;
      }
      setPost(data);
    } catch (err) {
      setError(err.message || '게시글 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchPostDetail();
    });
    return unsubscribe;
  }, [navigation, fetchPostDetail]);

  const handleBlockUser = async () => {
    if (!user || !post || user.id === post.author_auth_id) return;

    Alert.alert(
      '사용자 차단',
      `'${
        post.author_name || '익명'
      }'님을 차단하시겠습니까?\n차단한 사용자의 게시물과 댓글은 더 이상 보이지 않습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '차단',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('blocked_users').insert({
                user_id: user.id,
                blocked_user_id: post.author_auth_id,
              });
              if (error) throw error;
              Alert.alert('차단 완료', '사용자가 성공적으로 차단되었습니다.');
              navigation.goBack();
            } catch (err) {
              console.error('Block user error:', err);
              Alert.alert(
                '차단 실패',
                err.message || '사용자 차단 중 오류가 발생했습니다.',
              );
            }
          },
        },
      ],
    );
  };

  const showPostOptions = () => {
    const options = ['취소', '게시물 신고하기', '이 사용자 차단하기'];
    const destructiveButtonIndex = 2;
    const cancelButtonIndex = 0;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
        title: '게시물 옵션',
        message: '원하는 작업을 선택해주세요.',
      },
      buttonIndex => {
        if (buttonIndex === 1) {
          setReportModalVisible(true);
        } else if (buttonIndex === 2) {
          handleBlockUser();
        }
      },
    );
  };

  useEffect(() => {
    if (post) {
      navigation.setOptions({
        title: post.title,
        headerRight: () => (
          <View style={{ flexDirection: 'row', paddingRight: 8 }}>
            {isAuthor ? (
              <>
                <TouchableOpacity
                  onPress={handleEditPost}
                  style={{ marginRight: 20 }}>
                  <Icon name="pencil" size={24} color="#3d5afe" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeletePost}>
                  <Icon name="delete" size={24} color="#e74c3c" />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={showPostOptions}>
                <Icon name="dots-vertical" size={24} color="#333" />
              </TouchableOpacity>
            )}
          </View>
        ),
      });
    } else if (postTitle) {
      navigation.setOptions({ title: postTitle });
    }
  });

  useEffect(() => {
    AvoidSoftInput.setShouldMimicIOSBehavior(true);
    return () => {
      AvoidSoftInput.setShouldMimicIOSBehavior(false);
    };
  }, []);

  const handleEditPost = () => {
    navigation.navigate('CommunityPostEdit', { postId: post.id });
  };

  const handleDeletePost = () => {
    Alert.alert('게시글 삭제', '정말로 이 게시글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);
          try {
            if (post.image_urls && post.image_urls.length > 0) {
              const filePaths = post.image_urls
                .map(url => url.split('/post-images/')[1])
                .filter(Boolean);
              if (filePaths.length > 0) {
                await supabase.storage.from('post-images').remove(filePaths);
              }
            }
            const { error: deleteError } = await supabase
              .from('community_posts')
              .delete()
              .eq('id', postId)
              .eq('user_id', user.id);

            if (deleteError) throw deleteError;

            Alert.alert('삭제 완료', '게시글이 삭제되었습니다.');
            navigation.goBack();
          } catch (err) {
            console.error('Delete Error:', err);
            Alert.alert(
              '삭제 실패',
              err.message || '삭제 중 문제가 발생했습니다.',
            );
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const sanitizeUrl = raw => {
    if (!raw) return '';
    return String(raw)
      .trim()
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
      .replace(/\s+/g, '');
  };

  const handleLinkPress = async rawUrl => {
    const url = sanitizeUrl(rawUrl);
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('오류', `이 링크를 열 수 없습니다: ${e.message}`);
    }
  };

  const viewerImages = useMemo(() => {
    if (!Array.isArray(post?.image_urls)) return [];
    return post.image_urls.filter(Boolean).map(uri => ({ uri }));
  }, [post]);

  const openViewerAt = useCallback(index => {
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

  const renderImages = () => {
    if (!Array.isArray(post?.image_urls) || post.image_urls.length === 0)
      return null;
    return (
      <View style={styles.imageSection}>
        <Text style={styles.label}>첨부 사진</Text>
        {post.image_urls.map((url, index) => (
          <TouchableOpacity
            key={index}
            activeOpacity={0.9}
            onPress={() => openViewerAt(index)}>
            <Image
              source={{ uri: url }}
              style={styles.image}
              resizeMode="contain"
            />
          </TouchableOpacity>
        ))}
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
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="always">
        <View style={styles.headerContainer}>
          <Text style={styles.title}>{post.title}</Text>
        </View>
        <View style={styles.metaContainer}>
          <Text style={styles.author}>
            작성자: {post.author_name || '익명'}
          </Text>
          <Text style={styles.date}>
            게시일: {new Date(post.created_at).toLocaleString()}
          </Text>
          <Text style={styles.date}>조회수: {post.views || 0}</Text>
        </View>
        {renderImages()}
        <View style={styles.contentContainer}>
          <Text style={styles.content}>
            {post.content || '내용이 없습니다.'}
          </Text>
        </View>
        {post.link_url && (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => handleLinkPress(post.link_url)}>
            <Icon name="link-variant" size={20} color="#fff" />
            <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
          </TouchableOpacity>
        )}
        <CommentsSection postId={postId} boardType="community_posts" scrollViewRef={scrollViewRef} />
      </ScrollView>
      <ImageViewing
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={isViewerVisible}
        onRequestClose={() => setViewerVisible(false)}
        presentationStyle="fullScreen"
        HeaderComponent={() => (
          <View style={styles.viewerHeader}>
            <TouchableOpacity
              onPress={() => setViewerVisible(false)}
              style={styles.viewerCloseBtn}>
              <Icon name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      />
      {post && (
        <ReportModal
          isVisible={isReportModalVisible}
          onClose={() => setReportModalVisible(false)}
          contentId={post.id}
          contentType="post"
          authorId={post.author_auth_id}
        />
      )}
    </SafeAreaView>
  );
}

// 스타일 시트는 기존과 동일하게 유지합니다.
const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContainer: { paddingBottom: 8 },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    flex: 1,
    marginRight: 10,
  },
  metaContainer: {
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  author: { fontSize: 14, color: '#7f8c8d', marginBottom: 4 },
  date: { fontSize: 14, color: '#7f8c8d' },
  imageSection: { marginTop: 10, paddingHorizontal: 20 },
  label: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  image: {
    width: '100%',
    height: width * 0.8,
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: '#e9ecef',
  },
  contentContainer: { paddingHorizontal: 20, paddingVertical: 10 },
  content: { fontSize: 16, lineHeight: 28, color: '#34495e' },
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
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3d5afe',
    paddingVertical: 14,
    borderRadius: 8,
    margin: 20,
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
  viewerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  viewerCloseBtn: { padding: 8 },
});

export default CommunityPostDetailScreen;
