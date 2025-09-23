// src/screens/ArrestNewsDetailScreen.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import CommentsSection from '../components/CommentsSection';
import { useIncrementView } from '../hooks/useIncrementView';
import { AvoidSoftInput } from 'react-native-avoid-softinput';
import ImageViewing from 'react-native-image-viewing';
import { useAuth } from '../context/AuthContext'; // useAuth hook 추가

const { width } = Dimensions.get('window');

function ArrestNewsDetailScreen({ route, navigation }) {
  const { newsId, newsTitle } = route.params;
  const [news, setNews] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth(); // 현재 사용자 정보
  useIncrementView('arrest_news', newsId);

  const [isViewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const isAuthor = useMemo(() => {
    if (!user || !news) return false;
    return user.id === news.user_id;
  }, [user, news]);

  const fetchNewsDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('arrest_news')
        .select(
          'id, title, content, created_at, author_name, image_urls, is_pinned, link_url, views, user_id',
        )
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

  // 수정 로직 추가
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchNewsDetail();
    });

    return unsubscribe;
  }, [navigation, fetchNewsDetail]);

  useEffect(() => {
    if (news) {
      navigation.setOptions({
        title: news.title,
        headerRight: () =>
          isAuthor ? (
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                onPress={handleEdit}
                style={{ marginRight: 15 }}>
                <Icon name="pencil" size={24} color="#3d5afe" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete}>
                <Icon name="delete" size={24} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          ) : null,
      });
    } else if (newsTitle) {
      navigation.setOptions({ title: newsTitle });
    }
  });

  const handleEdit = () => {
    navigation.navigate('ArrestNewsEdit', { newsId: news.id });
  };

  const handleDelete = () => {
    Alert.alert(
      '삭제 확인',
      '정말로 이 게시글을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error: deleteError } = await supabase
                .from('arrest_news')
                .delete()
                .eq('id', news.id);
              if (deleteError) throw deleteError;
              Alert.alert('삭제 완료', '게시글이 삭제되었습니다.');
              navigation.goBack();
            } catch (err) {
              Alert.alert('삭제 실패', err.message);
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    AvoidSoftInput.setShouldMimicIOSBehavior(true);
    return () => {
      AvoidSoftInput.setShouldMimicIOSBehavior(false);
    };
  }, []);

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
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else await Linking.openURL(url);
    } catch (e) {
      Alert.alert('오류', `이 링크를 열 수 없습니다: ${e.message}`);
    }
  };

  const viewerImages = useMemo(() => {
    if (!Array.isArray(news?.image_urls)) return [];
    return news.image_urls.filter(Boolean).map(uri => ({ uri }));
  }, [news]);

  const openViewerAt = useCallback(index => {
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

  const renderImages = () => {
    if (!Array.isArray(news?.image_urls) || news.image_urls.length === 0) {
      return null;
    }

    return (
      <View style={styles.imageSection}>
        <Text style={styles.label}>첨부 사진</Text>
        {news.image_urls.map((url, index) => (
          <TouchableOpacity
            key={index}
            activeOpacity={0.9}
            onPress={() => openViewerAt(index)}>
            <Image
              source={{ uri: url }}
              style={styles.image} // 공통 이미지 스타일 사용
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
      <ScrollView
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="always">
        <View style={styles.headerContainer}>
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
            <Text style={styles.date}>조회수: {news.views || 0}</Text>
          </View>
        </View>

        <View style={styles.contentContainer}>
          <Text style={styles.content}>
            {news.content || '내용이 없습니다.'}
          </Text>
        </View>

        {renderImages()}

        {news.link_url && (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => handleLinkPress(news.link_url)}>
            <Icon name="link-variant" size={20} color="#fff" />
            <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
          </TouchableOpacity>
        )}

        <CommentsSection postId={newsId} boardType="arrest_news" />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
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
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  author: { fontSize: 14, color: '#7f8c8d' },
  date: { fontSize: 14, color: '#7f8c8d' },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  content: { fontSize: 16, lineHeight: 28, color: '#34495e' },
  imageSection: {
    marginTop: 10,
    paddingHorizontal: 20,
  },
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

export default ArrestNewsDetailScreen;
