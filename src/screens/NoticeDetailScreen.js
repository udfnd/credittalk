import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';

function NoticeDetailScreen({ route, navigation }) {
  const { noticeId, noticeTitle } = route.params;
  const [notice, setNotice] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (noticeTitle) {
      navigation.setOptions({ title: noticeTitle });
    }
  }, [noticeTitle, navigation]);

  const fetchNoticeDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('notices')
        .select('id, title, content, created_at, author_name')
        .eq('id', noticeId)
        .eq('is_published', true)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // Not found
          throw new Error('공지사항을 찾을 수 없거나 접근 권한이 없습니다.');
        }
        throw fetchError;
      }
      setNotice(data);
    } catch (err) {
      setError(err.message || '공지사항 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [noticeId]);

  useEffect(() => {
    fetchNoticeDetail();
  }, [fetchNoticeDetail]);

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
          onPress={fetchNoticeDetail}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!notice) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>공지사항 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{notice.title}</Text>
      <View style={styles.metaContainer}>
        {notice.author_name && (
          <Text style={styles.author}>작성자: {notice.author_name}</Text>
        )}
        <Text style={styles.date}>
          게시일: {new Date(notice.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.content}>
          {notice.content || '내용이 없습니다.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
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
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  author: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  date: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  contentContainer: {
    // marginTop: 10,
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
  emptyText: {
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

export default NoticeDetailScreen;
