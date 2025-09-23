// src/screens/NewCrimeCaseListScreen.js
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
  Image,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { logPageView } from '../lib/pageViewLogger';

function NewCrimeCaseListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      logPageView(user.id, 'NewCrimeCaseListScreen');
    }
  }, [user]);

  const fetchCases = useCallback(async () => {
    if (!refreshing) setIsLoading(true);
    setError(null);

    try {
      // RPC call to the new SQL function
      const { data, error: fetchError } = await supabase.rpc(
        'get_new_crime_cases_with_comment_info',
      );

      if (fetchError) throw fetchError;
      setCases(data || []);
    } catch (err) {
      console.error('Error in fetchCases:', err);
      setError(err.message || '데이터를 불러오는데 실패했습니다.');
      setCases([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    if (isFocused) {
      fetchCases();
    }
  }, [fetchCases, isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCases();
  }, [fetchCases]);

  const handleCreateCase = () => {
    if (!user) {
      Alert.alert('로그인 필요', '글을 작성하려면 로그인이 필요합니다.', [
        { text: '로그인', onPress: () => navigation.navigate('SignIn') },
        { text: '취소', style: 'cancel' },
      ]);
      return;
    }
    navigation.navigate('NewCrimeCaseCreate');
  };

  const renderItem = ({ item }) => {
    const thumbnailUrl =
      item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null;

    return (
      <TouchableOpacity
        style={styles.noticeItem}
        onPress={() =>
          navigation.navigate('NewCrimeCaseDetail', { caseId: item.id })
        }>
        <View style={styles.noticeContent}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Icon name="alert-decagram-outline" size={30} color="#bdc3c7" />
            </View>
          )}
          <View style={styles.textContainer}>
            <View style={styles.titleContainer}>
              {item.is_pinned && (
                <Icon
                  name="pin"
                  size={16}
                  color="#d35400"
                  style={styles.pinIcon}
                />
              )}
              <Text style={styles.noticeTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.has_new_comment && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              )}
            </View>
            <View style={styles.noticeMeta}>
              <Text style={styles.noticeAuthor} numberOfLines={1}>
                {item.category || '기타 사례'}
              </Text>
            </View>
            <View style={styles.noticeMeta}>
              <Text style={styles.noticeDate} numberOfLines={1}>
                댓글 {item.comment_count || 0}
              </Text>
              <Text style={styles.noticeDate} numberOfLines={1}>
                조회 {item.views || 0}
              </Text>
              <Text style={styles.noticeDate}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const ListContent = () => {
    if (isLoading && !refreshing) {
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
      <FlatList
        data={cases}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.centered}>
              <Icon name="alert-decagram-outline" size={50} color="#bdc3c7" />
              <Text style={styles.emptyText}>등록된 사례가 없습니다.</Text>
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
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.container}>
        <ListContent />
        <TouchableOpacity style={styles.fab} onPress={handleCreateCase}>
          <Icon name="plus" size={30} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContainer: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  noticeItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 1,
    padding: 15,
  },
  noticeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 15,
  },
  thumbnailPlaceholder: {
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pinIcon: {
    marginRight: 6,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
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
  noticeMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  noticeAuthor: {
    fontSize: 12,
    color: '#7f8c8d',
    flexShrink: 1,
    marginRight: 'auto',
  },
  noticeDate: {
    fontSize: 12,
    color: '#95a5a6',
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
  },
  fab: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3d5afe',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    right: 20,
    bottom: 60,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#3d5afe',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
  },
});

export default NewCrimeCaseListScreen;
