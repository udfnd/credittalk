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
import { useAuth } from '../context/AuthContext'; // Import useAuth

const { width } = Dimensions.get('window');

function IncidentPhotoDetailScreen({ route, navigation }) {
  const { photoId, photoTitle } = route.params;
  const { user } = useAuth(); // Get current user

  const [photo, setPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isViewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useIncrementView('incident_photos', photoId);

  const isAuthor = useMemo(() => {
    if (!user || !photo) return false;
    return user.id === photo.uploader_id;
  }, [user, photo]);

  const fetchPhotoDetail = useCallback(async () => {
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('incident_photos')
        .select('*') // Select all to get uploader_id
        .eq('id', photoId)
        .eq('is_published', true)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new Error('사진 자료를 찾을 수 없거나 접근 권한이 없습니다.');
        }
        throw fetchError;
      }
      setPhoto(data);
    } catch (err) {
      setError(err.message || '사진 자료 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [photoId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchPhotoDetail();
    });
    return unsubscribe;
  }, [navigation, fetchPhotoDetail]);

  useEffect(() => {
    if (photo) {
      navigation.setOptions({
        title: photo.title,
        headerRight: () =>
          isAuthor ? (
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
    } else if (photoTitle) {
      navigation.setOptions({ title: photoTitle });
    }
  });

  const handleEdit = () => {
    navigation.navigate('IncidentPhotoEdit', { photoId: photo.id });
  };

  const handleDelete = () => {
    Alert.alert(
      '삭제 확인',
      '정말로 이 사진 자료를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              // Also delete associated images from storage
              if (photo.image_urls && photo.image_urls.length > 0) {
                const filePaths = photo.image_urls
                  .map(url => url.split('/post-images/')[1])
                  .filter(Boolean);
                if (filePaths.length > 0) {
                  await supabase.storage.from('post-images').remove(filePaths);
                }
              }

              const { error: deleteError } = await supabase
                .from('incident_photos')
                .delete()
                .eq('id', photo.id)
                .eq('uploader_id', user.id); // Secure delete with user ID

              if (deleteError) throw deleteError;

              Alert.alert('삭제 완료', '사진 자료가 삭제되었습니다.');
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
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('오류', `이 링크를 열 수 없습니다: ${e.message}`);
    }
  };

  const viewerImages = useMemo(() => {
    if (!Array.isArray(photo?.image_urls)) return [];
    return photo.image_urls.filter(Boolean).map(uri => ({ uri }));
  }, [photo]);

  const openViewerAt = useCallback(index => {
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

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
        <TouchableOpacity onPress={fetchPhotoDetail} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!photo) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>사진 자료 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="always">
        <View style={styles.header}>
          <Text style={styles.title}>{photo.title}</Text>
          <View style={styles.metaContainer}>
            <Text style={styles.date}>
              게시일: {new Date(photo.created_at).toLocaleDateString()}
            </Text>
            <Text style={styles.date}>조회수: {photo.views || 0}</Text>
          </View>
          {!!photo.category && (
            <Text style={[styles.date, { marginTop: 4 }]}>
              카테고리: {photo.category}
            </Text>
          )}
        </View>

        <View style={styles.contentContainer}>
          <Text style={styles.content}>
            {photo.description || '설명이 없습니다.'}
          </Text>
        </View>

        {!!(Array.isArray(photo.image_urls) && photo.image_urls.length) && (
          <View style={styles.imageSection}>
            <Text style={styles.label}>첨부 사진</Text>
            {photo.image_urls.map((url, index) => (
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
        )}

        {photo.link_url && (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => handleLinkPress(photo.link_url)}>
            <Icon name="link-variant" size={20} color="#fff" />
            <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
          </TouchableOpacity>
        )}

        <CommentsSection postId={photoId} boardType="incident_photos" />
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
  header: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: { fontSize: 13, color: '#7f8c8d' },
  contentContainer: {
    marginBottom: 25,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  content: { fontSize: 16, lineHeight: 26, color: '#34495e' },
  imageSection: {
    marginTop: 10,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
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
    marginHorizontal: 20,
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

export default IncidentPhotoDetailScreen;
