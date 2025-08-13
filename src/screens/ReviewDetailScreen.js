import React, { useState, useEffect, useCallback } from 'react';
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
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import CommentsSection from "../components/CommentsSection";

const { width } = Dimensions.get('window');

// 별점 표시 컴포넌트
const StarRating = ({ rating }) => {
  if (rating == null || rating < 1 || rating > 5) return null;
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Icon
        key={i}
        name={i <= rating ? 'star' : 'star-outline'}
        size={20}
        color="#FFD700"
        style={{ marginRight: 3 }}
      />,
    );
  }
  return <View style={styles.starContainer}>{stars}</View>;
};

function ReviewDetailScreen({ route }) {
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight(); // iOS 키보드 회피 offset
  const { reviewId, reviewTitle } = route.params;
  const { user } = useAuth();

  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (reviewTitle) {
      navigation.setOptions({ title: reviewTitle });
    }
  }, [reviewTitle, navigation]);

  const fetchReviewDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('reviews_with_author_profile')
        .select(`
          id,
          title,
          content,
          created_at,
          author_auth_id,
          rating,
          author_name,
          image_urls
        `)
        .eq('id', reviewId)
        .eq('is_published', true)
        .single();

      if (fetchError) throw fetchError;
      setReview(data);
    } catch (err) {
      setError(err.message || '후기 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    fetchReviewDetail();
  }, [fetchReviewDetail]);

  const handleDeleteReview = async () => {
    // ⬇️ 쿼리에 없는 user_id 대신 author_auth_id로 체크
    if (review?.author_auth_id !== user?.id) {
      Alert.alert('권한 없음', '자신의 후기만 삭제할 수 있습니다.');
      return;
    }
    Alert.alert('후기 삭제', '정말로 이 후기를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);
          try {
            // 1) 스토리지 이미지 삭제 (있다면)
            if (review.image_urls && review.image_urls.length > 0) {
              const filePaths = review.image_urls
                .map((url) => {
                  // 버킷 경로가 다를 수 있으니 split 실패 방지
                  const parts = url.split('/reviews-images/');
                  return parts[1] || null;
                })
                .filter(Boolean);

              if (filePaths.length > 0) {
                const { error: storageError } = await supabase
                  .storage
                  .from('reviews-images')
                  .remove(filePaths);
                if (storageError) {
                  console.warn('Storage 이미지 삭제 실패:', storageError);
                }
              }
            }

            // 2) DB 레코드 삭제
            const { error: deleteError } = await supabase
              .from('reviews')
              .delete()
              .eq('id', reviewId);

            if (deleteError) throw deleteError;

            Alert.alert('삭제 완료', '후기가 삭제되었습니다.');
            navigation.goBack();
          } catch (err) {
            Alert.alert('삭제 실패', err.message);
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const handleScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    setCurrentImageIndex(index);
  };

  const renderImages = () => {
    if (!review?.image_urls || review.image_urls.length === 0) return null;

    return (
      <View style={styles.imageGalleryContainer}>
        {/* 가로 스크롤은 세로 ScrollView와 방향이 달라 중첩 경고 없음 */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {review.image_urls.map((url, index) => (
            <Image
              key={index}
              source={{ uri: url }}
              style={styles.galleryImage}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
        {review.image_urls.length > 1 && (
          <View style={styles.indicatorContainer}>
            {review.image_urls.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.indicator,
                  index === currentImageIndex ? styles.activeIndicator : null,
                ]}
              />
            ))}
          </View>
        )}
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
        <TouchableOpacity onPress={fetchReviewDetail} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!review) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>후기 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 화면 전체 키보드 회피 + 흰 배경으로 키보드-입력창 사이 갭 메우기 */}
      <KeyboardAvoidingView
        style={styles.kbWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        {/* ⬇️ 본문만 세로 ScrollView로 렌더링 */}
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.headerContainer}>
            <Text style={styles.title}>{review.title}</Text>
            {user && review.author_auth_id === user.id && (
              <TouchableOpacity onPress={handleDeleteReview} style={styles.deleteButton}>
                <Icon name="delete-outline" size={24} color="#e74c3c" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.metaContainer}>
            <Text style={styles.author}>작성자: {review.author_name || '익명'}</Text>
            {review.rating && <StarRating rating={review.rating} />}
            <Text style={styles.date}>게시일: {new Date(review.created_at).toLocaleString()}</Text>
          </View>

          {renderImages()}

          <View style={styles.contentContainer}>
            <Text style={styles.content}>{review.content || '내용이 없습니다.'}</Text>
          </View>
        </ScrollView>

        {/* ⬇️ 댓글 섹션은 ScrollView 바깥(형제)으로 분리 → VirtualizedList 중첩 경고 제거 */}
        <CommentsSection postId={reviewId} boardType="reviews" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // 레이아웃
  container: { flex: 1, backgroundColor: '#fff' },
  kbWrapper: { flex: 1, backgroundColor: '#fff' }, // 키보드-입력창 사이 갭을 흰색으로

  // 로딩/에러/빈 상태
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f8f9fa',
  },
  errorText: { marginTop: 10, fontSize: 16, color: '#e74c3c', textAlign: 'center' },
  emptyText: { fontSize: 16, color: '#7f8c8d' },
  retryButton: { marginTop: 20, backgroundColor: '#3d5afe', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5 },
  retryButtonText: { color: 'white', fontSize: 16 },

  // 본문 ScrollView
  scrollContainer: { paddingBottom: 8 },
  headerContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10, paddingHorizontal: 20, paddingTop: 20,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50', flex: 1, marginRight: 10 },
  deleteButton: { padding: 5 },

  metaContainer: {
    marginBottom: 20, paddingBottom: 15, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#ecf0f1',
  },
  author: { fontSize: 14, color: '#3498db', marginBottom: 5 },
  starContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  date: { fontSize: 14, color: '#7f8c8d', marginTop: 5 },

  // 이미지 갤러리(가로 방향)
  imageGalleryContainer: { width, height: width * 0.75, marginBottom: 20 },
  galleryImage: { width, height: '100%', backgroundColor: '#e9ecef' },
  indicatorContainer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    position: 'absolute', bottom: 10, width: '100%',
  },
  indicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.4)', marginHorizontal: 4 },
  activeIndicator: { backgroundColor: '#fff' },

  // 본문 내용
  contentContainer: { paddingHorizontal: 20 },
  content: { fontSize: 16, lineHeight: 26, color: '#34495e', textAlign: 'justify' },
});

export default ReviewDetailScreen;
