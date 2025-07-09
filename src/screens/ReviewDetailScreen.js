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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import CommentsSection from "../components/CommentsSection";

// 별점 표시 컴포넌트 (ReviewListScreen과 동일)
const StarRating = ({ rating }) => {
  if (rating == null || rating < 1 || rating > 5) return null;
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Icon
        key={i}
        name={i <= rating ? 'star' : 'star-outline'}
        size={20} // 상세 화면에서는 조금 더 크게
        color="#FFD700"
        style={{ marginRight: 3 }}
      />,
    );
  }
  return <View style={styles.starContainer}>{stars}</View>;
};

function ReviewDetailScreen({ route }) {
  const navigation = useNavigation();
  const { reviewId, reviewTitle } = route.params;
  const { user } = useAuth();

  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (reviewTitle) {
      navigation.setOptions({ title: reviewTitle });
    }
  }, [reviewTitle, navigation]);

  const fetchReviewDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Supabase에서 'reviews_with_author_name' 뷰를 만들거나, 여기서 조인합니다.
      // 여기서는 reviews 테이블과 users 테이블을 조인하는 예시를 보여드립니다.
      // 뷰를 사용하는 것이 더 효율적일 수 있습니다.
      const { data, error: fetchError } = await supabase
          .from('reviews_with_author_profile') // 변경
          .select(
              `
          id, title, content, created_at, author_auth_id, rating, author_name
        ` // users(name) 대신 author_name 바로 사용
          )
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
    if (review?.user_id !== user?.id) {
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
          const { error: deleteError } = await supabase
            .from('reviews')
            .delete()
            .eq('id', reviewId);
          setIsLoading(false);
          if (deleteError) {
            Alert.alert('삭제 실패', deleteError.message);
          } else {
            Alert.alert('삭제 완료', '후기가 삭제되었습니다.');
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
        <TouchableOpacity
          onPress={fetchReviewDetail}
          style={styles.retryButton}
        >
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
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>

        <View style={styles.headerContainer}>
          <Text style={styles.title}>{review.title}</Text>
          {user && review.user_id === user.id && (
            <TouchableOpacity
              onPress={handleDeleteReview}
              style={styles.deleteButton}
            >
              <Icon name="delete-outline" size={24} color="#e74c3c" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.metaContainer}>
          <Text style={styles.author}>
            작성자: {review.author_name || '익명'}
          </Text>
          {review.rating && <StarRating rating={review.rating} />}
          <Text style={styles.date}>
            게시일: {new Date(review.created_at).toLocaleString()}
          </Text>
        </View>
        <View style={styles.contentContainer}>
          <Text style={styles.content}>
            {review.content || '내용이 없습니다.'}
          </Text>
        </View>
        <CommentsSection postId={reviewId} boardType="review" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
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
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  author: { fontSize: 14, color: '#3498db', marginBottom: 5 },
  starContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  date: { fontSize: 14, color: '#7f8c8d', marginTop: 5 },
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

export default ReviewDetailScreen;
