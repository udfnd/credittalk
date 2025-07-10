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
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { logPageView } from "../lib/pageViewLogger";

// 별점 표시 컴포넌트 (간단 예시)
const StarRating = ({ rating }) => {
  if (rating == null || rating < 1 || rating > 5) return null;
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Icon
        key={i}
        name={i <= rating ? 'star' : 'star-outline'}
        size={16}
        color="#FFD700" // 금색
        style={{ marginRight: 2 }}
      />,
    );
  }
  return <View style={{ flexDirection: 'row' }}>{stars}</View>;
};

function ReviewListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  useEffect(() => {
    // 로그인한 사용자만 기록합니다.
    if (user) {
      logPageView(user.id, 'ReviewListScreen');
    }
  }, [user]);

  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 후기와 함께 작성자 프로필 정보(이름)를 가져오기
      const { data, error: fetchError } = await supabase
          .from('reviews_with_author_profile') // 변경
          .select(
              `
          id,
          title,
          created_at,
          author_auth_id,
          rating,
          author_name     
        `
          )
          .eq('is_published', true)
          .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setReviews(data || []); // data를 직접 사용
    } catch (err) {
      setError(err.message || '후기를 불러오는데 실패했습니다.');
      setReviews([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      fetchReviews();
    }
  }, [fetchReviews, isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReviews();
  }, [fetchReviews]);

  const handleCreateReview = () => {
    if (!user) {
      Alert.alert('로그인 필요', '후기를 작성하려면 로그인이 필요합니다.', [
        { text: '로그인', onPress: () => navigation.navigate('SignIn') },
        { text: '취소', style: 'cancel' },
      ]);
      return;
    }
    navigation.navigate('ReviewCreate');
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.reviewItem}
      onPress={() =>
        navigation.navigate('ReviewDetail', {
          reviewId: item.id,
          reviewTitle: item.title,
        })
      }
    >
      <Text style={styles.reviewTitle}>{item.title}</Text>
      {item.rating && <StarRating rating={item.rating} />}
      <View style={styles.reviewMeta}>
        <Text style={styles.reviewAuthor}>{item.author_name || '익명'}</Text>
        <Text style={styles.reviewDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading && !refreshing && reviews.length === 0) {
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
        <TouchableOpacity onPress={fetchReviews} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={reviews}
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
              <Text style={styles.emptyText}>등록된 후기가 없습니다.</Text>
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
      <TouchableOpacity style={styles.fab} onPress={handleCreateReview}>
        <Icon name="plus" size={30} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContainer: { paddingVertical: 10, paddingHorizontal: 15 },
  reviewItem: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 1,
  },
  reviewTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 5,
  },
  reviewMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  reviewAuthor: { fontSize: 13, color: '#3498db' },
  reviewDate: { fontSize: 12, color: '#7f8c8d' },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
  },
  emptyText: { marginTop: 10, fontSize: 16, color: '#7f8c8d' },
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
  retryButtonText: { color: 'white', fontSize: 16 },
});

export default ReviewListScreen;
