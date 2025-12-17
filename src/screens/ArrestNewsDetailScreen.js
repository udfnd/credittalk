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

// 계좌번호 마스킹 함수 (뒤 2자리)
const maskAccountNumber = accountNumber => {
  if (!accountNumber || accountNumber.length < 2) return accountNumber;
  return accountNumber.slice(0, -2) + '**';
};

// 전화번호 마스킹 함수 (가운데 2자리)
const maskPhoneNumber = phoneNumber => {
  if (!phoneNumber || phoneNumber.length < 4) return phoneNumber;
  const cleaned = phoneNumber.replace(/\D/g, '');
  if (cleaned.length === 11) {
    // 010-1234-5678 형식
    return (
      cleaned.slice(0, 3) +
      '-' +
      cleaned.slice(3, 5) +
      '**' +
      '-' +
      cleaned.slice(7)
    );
  } else if (cleaned.length === 10) {
    // 010-123-4567 형식
    return (
      cleaned.slice(0, 3) + '-' + cleaned.slice(3, 5) + '*-' + cleaned.slice(6)
    );
  }
  // 기본적으로 가운데 2자리만 마스킹
  const mid = Math.floor(cleaned.length / 2);
  return cleaned.slice(0, mid - 1) + '**' + cleaned.slice(mid + 1);
};

function ArrestNewsDetailScreen({ route, navigation }) {
  const { newsId, newsTitle } = route.params;
  const [news, setNews] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, profile } = useAuth(); // 현재 사용자 정보
  useIncrementView('arrest_news', newsId);

  const [isViewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [hasReported, setHasReported] = useState(false);
  const [isReportUpdating, setIsReportUpdating] = useState(false);

  const isAuthor = useMemo(() => {
    if (!user || !news) return false;
    return user.id === news.user_id;
  }, [user, news]);

  const isAdmin = useMemo(() => profile?.is_admin === true, [profile]);

  // 검거여부 및 경찰신고 여부 수정 가능 여부
  const canEditStatus = isAuthor || isAdmin;

  // 검거여부/경찰신고여부 수정 상태
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fetchReportStatus = useCallback(async () => {
    try {
      const { count, error: countError } = await supabase
        .from('arrest_news_reports')
        .select('id', { count: 'exact', head: true })
        .eq('arrest_news_id', newsId);
      if (countError) throw countError;
      setReportCount(count ?? 0);

      if (user) {
        const { data: existing, error: existingError } = await supabase
          .from('arrest_news_reports')
          .select('id')
          .eq('arrest_news_id', newsId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (existingError && existingError.code !== 'PGRST116')
          throw existingError;
        setHasReported(Boolean(existing));
      } else {
        setHasReported(false);
      }
    } catch (err) {
      console.error('Failed to load report status:', err);
    }
  }, [newsId, user]);

  const fetchNewsDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('arrest_news')
        .select(
          `
          id, title, content, created_at, author_name, image_urls, is_pinned, link_url, views, user_id,
          arrest_status, reported_to_police, police_station_name,
          fraud_category, scammer_nickname, scammer_account_number, scammer_phone_number
        `,
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

  useEffect(() => {
    fetchReportStatus();
  }, [fetchReportStatus]);

  // 수정 로직 추가
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchNewsDetail();
      fetchReportStatus();
    });

    return unsubscribe;
  }, [navigation, fetchNewsDetail, fetchReportStatus]);

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

  const handleToggleReport = async () => {
    if (!user) {
      Alert.alert(
        '로그인이 필요합니다',
        '누적신고 기능은 로그인 후 이용 가능합니다.',
      );
      return;
    }

    setIsReportUpdating(true);
    try {
      if (hasReported) {
        const { error } = await supabase
          .from('arrest_news_reports')
          .delete()
          .eq('arrest_news_id', newsId)
          .eq('user_id', user.id);
        if (error) throw error;
        setHasReported(false);
        setReportCount(prev => Math.max(prev - 1, 0));
      } else {
        const { error } = await supabase.from('arrest_news_reports').insert({
          arrest_news_id: newsId,
          user_id: user.id,
        });
        if (error) throw error;
        setHasReported(true);
        setReportCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to toggle accumulated report:', err);
      Alert.alert(
        '오류',
        err.message || '누적신고 처리 중 오류가 발생했습니다.',
      );
    } finally {
      setIsReportUpdating(false);
    }
  };

  // 검거여부 수정 핸들러
  const handleUpdateArrestStatus = async newStatus => {
    if (!canEditStatus) return;

    Alert.alert(
      '검거여부 변경',
      `검거여부를 "${newStatus === 'arrested' ? '검거' : '활동'}"으로 변경하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '변경',
          onPress: async () => {
            setIsUpdatingStatus(true);
            try {
              const { error } = await supabase
                .from('arrest_news')
                .update({ arrest_status: newStatus })
                .eq('id', newsId);
              if (error) throw error;
              setNews(prev => ({ ...prev, arrest_status: newStatus }));
              Alert.alert('완료', '검거여부가 변경되었습니다.');
            } catch (err) {
              Alert.alert('오류', err.message || '변경에 실패했습니다.');
            } finally {
              setIsUpdatingStatus(false);
            }
          },
        },
      ],
    );
  };

  // 경찰신고 여부 수정 핸들러
  const handleUpdatePoliceReport = async newValue => {
    if (!canEditStatus) return;

    Alert.alert(
      '경찰신고 여부 변경',
      `경찰신고 여부를 "${newValue ? '예' : '아니오'}"로 변경하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '변경',
          onPress: async () => {
            setIsUpdatingStatus(true);
            try {
              const updateData = { reported_to_police: newValue };
              // 신고 안함으로 변경 시 경찰서 정보 삭제
              if (!newValue) {
                updateData.police_station_name = null;
              }
              const { error } = await supabase
                .from('arrest_news')
                .update(updateData)
                .eq('id', newsId);
              if (error) throw error;
              setNews(prev => ({
                ...prev,
                reported_to_police: newValue,
                ...(newValue ? {} : { police_station_name: null }),
              }));
              Alert.alert('완료', '경찰신고 여부가 변경되었습니다.');
            } catch (err) {
              Alert.alert('오류', err.message || '변경에 실패했습니다.');
            } finally {
              setIsUpdatingStatus(false);
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

        <View style={styles.statusSection}>
          <View style={styles.statusHeaderRow}>
            <Text style={styles.label}>현재 상태</Text>
            {canEditStatus && (
              <Text style={styles.editableHint}>수정 가능</Text>
            )}
          </View>

          {/* 검거여부 */}
          <View style={styles.statusRowWithEdit}>
            <View
              style={[
                styles.statusBadge,
                news.arrest_status === 'active'
                  ? styles.statusBadgeActive
                  : styles.statusBadgeArrested,
              ]}>
              <Text
                style={[
                  styles.statusBadgeText,
                  news.arrest_status === 'active'
                    ? styles.statusBadgeTextActive
                    : styles.statusBadgeTextArrested,
                ]}>
                {news.arrest_status === 'active' ? '활동' : '검거'}
              </Text>
            </View>
            {canEditStatus && (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() =>
                  handleUpdateArrestStatus(
                    news.arrest_status === 'active' ? 'arrested' : 'active',
                  )
                }
                disabled={isUpdatingStatus}>
                <Icon name="pencil" size={16} color="#3d5afe" />
                <Text style={styles.editButtonText}>
                  {news.arrest_status === 'active' ? '검거로 변경' : '활동으로 변경'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.statusDescription}>
            {news.arrest_status === 'active'
              ? '해당 범죄자는 아직 검거되지 않고 활동 중입니다.'
              : '해당 범죄자는 이미 검거되었습니다.'}
          </Text>

          {/* 경찰 신고 여부 */}
          <View style={styles.statusInfoRowWithEdit}>
            <View style={styles.statusInfoRow}>
              <Text style={[styles.statusInfoLabel, styles.policeReportLabel]}>
                경찰 신고 여부
              </Text>
              <Text style={styles.statusInfoValue}>
                {news.reported_to_police ? '예' : '아니오'}
              </Text>
            </View>
            {canEditStatus && (
              <TouchableOpacity
                style={styles.editButtonSmall}
                onPress={() =>
                  handleUpdatePoliceReport(!news.reported_to_police)
                }
                disabled={isUpdatingStatus}>
                <Icon name="pencil" size={14} color="#3d5afe" />
              </TouchableOpacity>
            )}
          </View>
          {news.reported_to_police && news.police_station_name ? (
            <View style={styles.statusInfoRow}>
              <Text style={styles.statusInfoLabel}>신고 경찰서</Text>
              <Text style={styles.statusInfoValue}>
                {news.police_station_name}
              </Text>
            </View>
          ) : null}

          {isUpdatingStatus && (
            <View style={styles.updatingOverlay}>
              <ActivityIndicator size="small" color="#3d5afe" />
              <Text style={styles.updatingText}>업데이트 중...</Text>
            </View>
          )}
        </View>

        {news.fraud_category && (
          <View style={styles.scammerInfoSection}>
            <Text style={styles.label}>사기 카테고리</Text>
            <View style={styles.statusInfoRow}>
              <Text style={styles.statusInfoValue}>{news.fraud_category}</Text>
            </View>
          </View>
        )}

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

        <View style={styles.accumulatedReportSection}>
          <TouchableOpacity
            style={[
              styles.reportButton,
              hasReported && styles.reportButtonActive,
              isReportUpdating && styles.reportButtonDisabled,
            ]}
            onPress={handleToggleReport}
            disabled={isReportUpdating}
            activeOpacity={0.85}>
            {isReportUpdating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.reportButtonText}>
                누적신고 {reportCount}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.reportHelperText}>
            신고하지 않았으면 누르지 마세요.
          </Text>
        </View>

        {/* 사기꾼 정보 (누적신고 버튼 아래) */}
        {(news.scammer_nickname ||
          news.scammer_account_number ||
          news.scammer_phone_number) && (
          <View style={styles.scammerDetailSection}>
            <Text style={styles.scammerDetailTitle}>사기꾼 정보</Text>
            {news.scammer_nickname && (
              <View style={styles.scammerDetailRow}>
                <Icon name="account" size={18} color="#495057" />
                <Text style={styles.scammerDetailLabel}>닉네임</Text>
                <Text style={styles.scammerDetailValue}>
                  {news.scammer_nickname}
                </Text>
              </View>
            )}
            {news.scammer_account_number && (
              <View style={styles.scammerDetailRow}>
                <Icon name="bank" size={18} color="#495057" />
                <Text style={styles.scammerDetailLabel}>계좌번호</Text>
                <Text style={styles.scammerDetailValue}>
                  {maskAccountNumber(news.scammer_account_number)}
                </Text>
              </View>
            )}
            {news.scammer_phone_number && (
              <View style={styles.scammerDetailRow}>
                <Icon name="phone" size={18} color="#495057" />
                <Text style={styles.scammerDetailLabel}>전화번호</Text>
                <Text style={styles.scammerDetailValue}>
                  {maskPhoneNumber(news.scammer_phone_number)}
                </Text>
              </View>
            )}
          </View>
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
  statusSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  scammerInfoSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff9e6',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ffe066',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  statusBadgeArrested: {
    backgroundColor: '#ffebee',
  },
  statusBadgeActive: {
    backgroundColor: '#fff3cd',
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusBadgeTextArrested: {
    color: '#c62828',
  },
  statusBadgeTextActive: {
    color: '#b36b00',
  },
  statusDescription: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 22,
    marginBottom: 12,
  },
  statusInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusInfoLabel: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  policeReportLabel: {
    color: '#d32f2f',
    fontWeight: '600',
  },
  statusInfoValue: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  accumulatedReportSection: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#f1f3f5',
  },
  reportButton: {
    backgroundColor: '#3d5afe',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  reportButtonActive: {
    backgroundColor: '#1b5e20',
  },
  reportButtonDisabled: {
    opacity: 0.7,
  },
  reportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  reportHelperText: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 13,
    color: '#868e96',
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
  // 상태 수정 관련 스타일
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  editableHint: {
    fontSize: 12,
    color: '#3d5afe',
    fontWeight: '600',
  },
  statusRowWithEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#e8f0ff',
    borderRadius: 6,
  },
  editButtonText: {
    fontSize: 12,
    color: '#3d5afe',
    fontWeight: '600',
    marginLeft: 4,
  },
  statusInfoRowWithEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  editButtonSmall: {
    padding: 6,
    marginLeft: 8,
  },
  updatingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 8,
    backgroundColor: '#e8f0ff',
    borderRadius: 6,
  },
  updatingText: {
    fontSize: 12,
    color: '#3d5afe',
    marginLeft: 8,
  },
  // 사기꾼 정보 섹션 스타일
  scammerDetailSection: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#fff9e6',
    borderWidth: 1,
    borderColor: '#ffe066',
  },
  scammerDetailTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#b36b00',
    marginBottom: 12,
  },
  scammerDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ffe066',
  },
  scammerDetailLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    marginLeft: 8,
    width: 70,
  },
  scammerDetailValue: {
    flex: 1,
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '600',
  },
});

export default ArrestNewsDetailScreen;
