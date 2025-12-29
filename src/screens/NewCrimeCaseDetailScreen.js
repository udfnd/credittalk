import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
  Linking,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useNavigation } from '@react-navigation/native';
import CommentsSection from '../components/CommentsSection';
import { useIncrementView } from '../hooks/useIncrementView';
import { AvoidSoftInput } from 'react-native-avoid-softinput';
import ImageViewing from 'react-native-image-viewing';
import { useAuth } from '../context/AuthContext'; // ✅ 추가
import ReportModal from '../components/ReportModal';

const { width } = Dimensions.get('window');

function NewCrimeCaseDetailScreen({ route }) {
  const navigation = useNavigation();
  const { caseId } = route.params;
  const { user, profile } = useAuth();

  const [caseDetail, setCaseDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isViewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const scrollViewRef = useRef(null);

  useIncrementView('new_crime_cases', caseId);

  const isAuthor = useMemo(() => {
    if (!user || !caseDetail) return false;
    return user.id === caseDetail.user_id;
  }, [user, caseDetail]);

  const isAdmin = useMemo(() => profile?.is_admin === true, [profile]);

  // 작성자이거나 관리자인 경우 수정/삭제 권한
  const canEditOrDelete = isAuthor || isAdmin;

  const fetchCaseDetail = useCallback(async () => {
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('new_crime_cases')
        .select('*') // user_id를 가져오기 위해 전체 선택
        .eq('id', caseId)
        .eq('is_published', true)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new Error('사례를 찾을 수 없거나 접근 권한이 없습니다.');
        }
        throw fetchError;
      }
      setCaseDetail(data);
    } catch (err) {
      setError(err.message || '사례 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchCaseDetail();
    });
    return unsubscribe;
  }, [navigation, fetchCaseDetail]);

  const handleBlockUser = useCallback(() => {
    if (!user || !caseDetail || user.id === caseDetail.user_id) {
      if (!user) {
        Alert.alert('로그인 필요', '로그인이 필요한 기능입니다.');
      }
      return;
    }

    const targetName = caseDetail.user_name || '익명 사용자';

    Alert.alert(
      '사용자 차단',
      `'${targetName}'님을 차단하시겠습니까?\n차단한 사용자의 게시물과 댓글은 더 이상 보이지 않습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '차단',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('blocked_users').insert({
                user_id: user.id,
                blocked_user_id: caseDetail.user_id,
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
  }, [caseDetail, navigation, user]);

  const showCaseOptions = useCallback(() => {
    if (!caseDetail) return;

    const blockAvailable = user && caseDetail.user_id && user.id !== caseDetail.user_id;

    if (Platform.OS === 'ios') {
      const options = ['취소', '게시물 신고하기'];
      if (blockAvailable) {
        options.push('이 사용자 차단하기');
      }

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: blockAvailable ? 2 : undefined,
          title: '게시물 옵션',
        },
        buttonIndex => {
          if (buttonIndex === 1) {
            setReportModalVisible(true);
          } else if (blockAvailable && buttonIndex === 2) {
            handleBlockUser();
          }
        },
      );
    } else {
      // Android
      const buttons = [
        { text: '게시물 신고하기', onPress: () => setReportModalVisible(true) },
      ];
      if (blockAvailable) {
        buttons.push({
          text: '이 사용자 차단하기',
          style: 'destructive',
          onPress: handleBlockUser,
        });
      }
      buttons.push({ text: '취소', style: 'cancel' });

      Alert.alert('게시물 옵션', '', buttons);
    }
  }, [caseDetail, handleBlockUser, user]);

  const handleEdit = useCallback(() => {
    if (!caseDetail) return;
    navigation.navigate('NewCrimeCaseEdit', { caseId: caseDetail.id });
  }, [caseDetail, navigation]);

  const handleDelete = useCallback(() => {
    if (!caseDetail || !user) return;

    Alert.alert(
      '삭제 확인',
      '정말로 이 사례를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              if (caseDetail.image_urls && caseDetail.image_urls.length > 0) {
                const filePaths = caseDetail.image_urls
                  .map(url => url.split('/post-images/')[1])
                  .filter(Boolean);
                if (filePaths.length > 0) {
                  await supabase.storage.from('post-images').remove(filePaths);
                }
              }
              const { error: deleteError } = await supabase
                .from('new_crime_cases')
                .delete()
                .eq('id', caseDetail.id)
                .eq('user_id', user.id);

              if (deleteError) throw deleteError;

              Alert.alert('삭제 완료', '사례가 삭제되었습니다.');
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
  }, [caseDetail, navigation, user]);

  useEffect(() => {
    if (!caseDetail) return;

    navigation.setOptions({
      title: caseDetail.title || '사례 상세 정보',
      headerRight: () => {
        if (canEditOrDelete) {
          return (
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
          );
        }

        if (!caseDetail.user_id) return null;

        return (
          <TouchableOpacity onPress={showCaseOptions} style={{ marginRight: 12 }}>
            <Icon name="dots-vertical" size={24} color="#333" />
          </TouchableOpacity>
        );
      },
    });
  }, [canEditOrDelete, caseDetail, handleDelete, handleEdit, navigation, showCaseOptions]);

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
    if (!Array.isArray(caseDetail?.image_urls)) return [];
    return caseDetail.image_urls.filter(Boolean).map(uri => ({ uri }));
  }, [caseDetail]);

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
        <TouchableOpacity onPress={fetchCaseDetail} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!caseDetail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>사례 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="always">
        <View style={styles.header}>
          <Text style={styles.title}>{caseDetail.title}</Text>
          <View style={styles.metaContainer}>
            <Text style={styles.date}>
              게시일: {new Date(caseDetail.created_at).toLocaleDateString()}
            </Text>
            <Text style={styles.date}>조회수: {caseDetail.views || 0}</Text>
          </View>
        </View>

        <View style={styles.contentContainer}>
          <Text style={styles.content}>{caseDetail.method}</Text>
        </View>

        {!!(
          Array.isArray(caseDetail.image_urls) && caseDetail.image_urls.length
        ) && (
          <View style={styles.imageSection}>
            <Text style={styles.label}>첨부 사진</Text>
            {caseDetail.image_urls.map((url, index) => (
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

        {caseDetail.link_url && (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => handleLinkPress(caseDetail.link_url)}>
            <Icon name="link-variant" size={20} color="#fff" />
            <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
          </TouchableOpacity>
        )}

        <CommentsSection postId={caseId} boardType="new_crime_cases" scrollViewRef={scrollViewRef} />
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
      {caseDetail && (
        <ReportModal
          isVisible={isReportModalVisible}
          onClose={() => setReportModalVisible(false)}
          contentId={caseDetail.id}
          contentType="new_crime_case"
          authorId={caseDetail.user_id}
        />
      )}
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
    marginTop: 4,
  },
  label: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
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

export default NewCrimeCaseDetailScreen;
