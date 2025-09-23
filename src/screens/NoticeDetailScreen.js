import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  Dimensions,
  TouchableOpacity,
  Linking,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AvoidSoftInput } from 'react-native-avoid-softinput';
import CommentsSection from '../components/CommentsSection';
import { useIncrementView } from '../hooks/useIncrementView';
import ImageViewing from 'react-native-image-viewing';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');
const contentPadding = 20;
const imageWidth = width - contentPadding * 2;

const NoticeDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { noticeId } = route.params;
  const { profile } = useAuth(); // is_admin을 확인하기 위해 profile 사용

  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isViewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useIncrementView('notices', noticeId);

  // is_admin 값을 확인
  const isAdmin = useMemo(() => profile?.is_admin === true, [profile]);

  const fetchNoticeDetails = useCallback(async () => {
    if (!noticeId) {
      Alert.alert('오류', '게시글 정보를 가져올 수 없습니다.');
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .eq('id', noticeId)
        .single();
      if (error) throw error;
      setNotice(data);
    } catch (error) {
      console.error('Error fetching notice:', error);
      Alert.alert('오류', '공지사항을 불러오는 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [noticeId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchNoticeDetails();
    });
    return unsubscribe;
  }, [navigation, fetchNoticeDetails]);

  useEffect(() => {
    if (notice) {
      navigation.setOptions({
        title: notice.title,
        headerRight: () =>
          isAdmin ? (
            <View style={{ flexDirection: 'row', paddingRight: 8 }}>
              <TouchableOpacity
                onPress={handleEdit}
                style={{ marginRight: 20 }}>
                <Icon name="pencil" size={24} color="#3d5afe" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete}>
                <Icon name="delete" size={24} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          ) : null,
      });
    }
  }, [notice, navigation, isAdmin]);

  const handleEdit = () => {
    navigation.navigate('NoticeEdit', { noticeId: notice.id });
  };

  const handleDelete = () => {
    Alert.alert('삭제 확인', '정말로 이 공지사항을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const { error } = await supabase
              .from('notices')
              .delete()
              .eq('id', notice.id);

            if (error) throw error;
            Alert.alert('삭제 완료', '공지사항이 삭제되었습니다.');
            navigation.goBack();
          } catch (err) {
            console.error('Delete Error:', err);
            Alert.alert(
              '삭제 실패',
              err.message || '삭제 중 문제가 발생했습니다.',
            );
            setLoading(false);
          }
        },
      },
    ]);
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
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('오류', `이 링크를 열 수 없습니다: ${e.message}`);
    }
  };

  const viewerImages = useMemo(() => {
    if (!Array.isArray(notice?.image_urls)) return [];
    return notice.image_urls.filter(Boolean).map(uri => ({ uri }));
  }, [notice]);

  const openViewerAt = useCallback(index => {
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </SafeAreaView>
    );
  }

  if (!notice) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>해당 공지사항을 찾을 수 없습니다.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="always">
        <View style={styles.postContainer}>
          <Text style={styles.title}>{notice.title}</Text>
          <View style={styles.metaContainer}>
            <Text style={styles.date}>
              {format(new Date(notice.created_at), 'yyyy년 MM월 dd일 HH:mm', {
                locale: ko,
              })}
            </Text>
            <Text style={styles.date}>조회수: {notice.views || 0}</Text>
          </View>
          <View style={styles.separator} />
          <Text style={styles.content}>{notice.content}</Text>

          {Array.isArray(notice.image_urls) && notice.image_urls.length > 0 && (
            <View style={styles.imageGallery}>
              {notice.image_urls.map((url, index) => (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.9}
                  onPress={() => openViewerAt(index)}>
                  <Image
                    source={{ uri: url }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {notice.link_url && (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => handleLinkPress(notice.link_url)}>
              <Icon name="link-variant" size={20} color="#fff" />
              <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
            </TouchableOpacity>
          )}
        </View>

        <CommentsSection postId={noticeId} boardType="notices" />
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
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContainer: { paddingBottom: 8 },
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
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  date: { fontSize: 14, color: '#868E96', marginBottom: 20 },
  separator: { height: 1, backgroundColor: '#E9ECEF', marginBottom: 25 },
  content: { fontSize: 16, lineHeight: 28, color: '#495057', marginBottom: 20 },
  imageGallery: { marginTop: 10, marginBottom: 20 },
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

export default NoticeDetailScreen;
