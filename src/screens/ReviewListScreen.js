// src/screens/ReviewListScreen.js
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
import { logPageView } from '../lib/pageViewLogger';

// 별점 표시 컴포넌트
const StarRating = ({ rating }) => {
  if (rating == null || rating < 1 || rating > 5) return null;
  const stars = Array.from({ length: 5 }, (_, i) => (
    <Icon
      key={i}
      name={i < rating ? 'star' : 'star-outline'}
      size={16}
      color="#FFD700"
      style={{ marginRight: 2 }}
    />
  ));
  return <View style={styles.starContainer}>{stars}</View>;
};

function ReviewListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      logPageView(user.id, 'ReviewListScreen');
    }
  }, [user]);

  const fetchReviews = useCallback(async () => {
    if (!refreshing) setIsLoading(true);
    setError(null);
    try {
      // RPC call to the new SQL function
      const { data, error: fetchError } = await supabase.rpc(
        'get_reviews_with_comment_info',
      );

      if (fetchError) throw fetchError;
      setReviews(data || []);
    } catch (err) {
      setError(err.message || '후기를 불러오는데 실패했습니다.');
      setReviews([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

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
      }>
      <View style={styles.titleContainer}>
        <Text style={styles.reviewTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.has_new_comment && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
      </View>
      <StarRating rating={item.rating} />
      <View style={styles.reviewMeta}>
        <Text style={styles.reviewAuthor}>{item.author_name || '익명'}</Text>
        <Text style={styles.reviewDate}>댓글 {item.comment_count || 0}</Text>
        <Text style={styles.reviewDate}>조회 {item.views || 0}</Text>
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
        <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
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
        keyExtractor={item => item.id.toString()}
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
  titleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  reviewTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2c3e50',
    flex: 1,
  },
  newBadge: {
    backgroundColor: '#E74C3C',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  newBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  starContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  reviewAuthor: {
    fontSize: 13,
    color: '#3498db',
    marginRight: 'auto',
  },
  reviewDate: {
    fontSize: 12,
    color: '#7f8c8d',
    marginLeft: 8,
  },
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
    right: 20,
    bottom: 60,
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
