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
  Image,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { logPageView } from '../lib/pageViewLogger';
import { useAuth } from '../context/AuthContext';

function NoticeListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      logPageView(user.id, 'NoticeListScreen');
    }
  }, [user]);

  const fetchNotices = useCallback(async () => {
    if (!refreshing) {
      setIsLoading(true);
    }
    setError(null);
    try {
      // RPC call to the new SQL function
      const { data, error: fetchError } = await supabase.rpc(
        'get_notices_with_comment_info',
      );

      if (fetchError) throw fetchError;
      setNotices(data || []);
    } catch (err) {
      setError(err.message || '공지사항을 불러오는데 실패했습니다.');
      setNotices([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    if (isFocused) {
      fetchNotices();
    }
  }, [fetchNotices, isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotices();
  }, [fetchNotices]);

  const renderItem = ({ item }) => {
    const thumbnailUrl =
      item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null;

    return (
      <TouchableOpacity
        style={styles.noticeItem}
        onPress={() =>
          navigation.navigate('NoticeDetail', {
            noticeId: item.id,
            noticeTitle: item.title,
          })
        }>
        <View style={styles.noticeContent}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Icon name="information-outline" size={30} color="#bdc3c7" />
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
                {item.author_name || '관리자'}
              </Text>
              <Text style={styles.noticeDate}>
                댓글 {item.comment_count || 0}
              </Text>
              <Text style={styles.noticeDate}>조회 {item.views || 0}</Text>
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
        data={notices}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
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
  };

  return (
    <SafeAreaView style={styles.container}>
      <ListContent />
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
    marginLeft: 8,
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
