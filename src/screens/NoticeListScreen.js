// src/screens/NoticeListScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image, // Image 컴포넌트 추가
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { logPageView } from "../lib/pageViewLogger";
import { useAuth } from "../context/AuthContext";

function NoticeListScreen() {
  const navigation = useNavigation();
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    // 로그인한 사용자만 기록합니다.
    if (user) {
      logPageView(user.id, 'NewCrimeCaseListScreen');
    }
  }, [user]);

  const fetchNotices = useCallback(async () => {
    // 새로고침이 아닐 때만 로딩 인디케이터 표시
    if (!refreshing) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('notices')
        .select('id, title, created_at, author_name, image_urls') // image_urls 추가
        .eq('is_published', true)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setNotices(data || []);
    } catch (err) {
      setError(err.message || '공지사항을 불러오는데 실패했습니다.');
      setNotices([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]); // refreshing 상태가 변경될 때마다 fetchNotices를 다시 생성

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.noticeItem}
      onPress={() =>
        navigation.navigate('NoticeDetail', {
          noticeId: item.id,
          noticeTitle: item.title,
        })
      }
    >
      <View style={styles.noticeContent}>
        {/* 썸네일 이미지 표시 */}
        {item.image_urls && item.image_urls.length > 0 && (
          <Image source={{ uri: item.image_urls[0] }} style={styles.thumbnail} />
        )}
        <View style={styles.textContainer}>
          <Text style={styles.noticeTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.noticeMeta}>
            {item.author_name && (
              <Text style={styles.noticeAuthor}>작성자: {item.author_name}</Text>
            )}
            <Text style={styles.noticeDate}>
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

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
      data={notices}
      renderItem={renderItem}
      keyExtractor={(item) => item.id.toString()}
      contentContainerStyle={styles.listContainer}
      ListEmptyComponent={
        !isLoading && (
          <View style={styles.centered}>
            <Icon name="information-outline" size={50} color="#bdc3c7" />
            <Text style={styles.emptyText}>등록된 공지사항이 없습니다.</Text>
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
}

const styles = StyleSheet.create({
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
  textContainer: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
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

export default NoticeListScreen;
