import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  Dimensions,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import CommentsSection from '../components/CommentsSection';

const { width } = Dimensions.get('window');
const contentPadding = 20;
const imageWidth = width - contentPadding * 2;

const NoticeDetailScreen = () => {
  const route = useRoute();
  const { noticeId } = route.params;
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNoticeDetails = async () => {
      if (!noticeId) {
        Alert.alert('오류', '게시글 정보를 가져올 수 없습니다.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('notices')
          .select('*, link_url, image_urls')
          .eq('id', noticeId)
          .single();

        if (error) throw error;
        setNotice(data);
      } catch (error) {
        console.error('Error fetching notice:', error);
        Alert.alert('오류', '공지사항을 불러오는 중 문제가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchNoticeDetails();
  }, [noticeId]);

  const sanitizeUrl = (raw) => {
    if (!raw) return "";
    return String(raw)
      .trim() // 앞뒤 공백 제거
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "") // 제어문자 제거
      .replace(/\s+/g, ""); // 중간 공백 제거
  };

  const handleLinkPress = async (rawUrl) => {
    const url = sanitizeUrl(rawUrl);
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(url);
      }
    } catch (e) {
      Alert.alert("오류", `이 링크를 열 수 없습니다: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </SafeAreaView>
    );
  }

  if (!notice) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>해당 공지사항을 찾을 수 없습니다.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.postContainer}>
          <Text style={styles.title}>{notice.title}</Text>
          <Text style={styles.date}>
            {format(new Date(notice.created_at), 'yyyy년 MM월 dd일 HH:mm', {
              locale: ko,
            })}
          </Text>
          <View style={styles.separator} />
          <Text style={styles.content}>{notice.content}</Text>
          {notice.image_urls && notice.image_urls.length > 0 && (
            <View style={styles.imageGallery}>
              {notice.image_urls.map((url, index) => (
                <Image
                  key={index}
                  source={{ uri: url }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ))}
            </View>
          )}
          {notice.link_url && (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => handleLinkPress(notice.link_url)}
            >
              <Icon name="link-variant" size={20} color="#fff" />
              <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
            </TouchableOpacity>
          )}
        </View>
        <CommentsSection postId={noticeId} boardType="notices" />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#555',
  },
  postContainer: {
    backgroundColor: '#fff',
    padding: contentPadding,
    borderBottomWidth: 8,
    borderBottomColor: '#F8F9FA',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#212529',
  },
  date: {
    fontSize: 14,
    color: '#868E96',
    marginBottom: 20,
  },
  separator: {
    height: 1,
    backgroundColor: '#E9ECEF',
    marginBottom: 25,
  },
  content: {
    fontSize: 16,
    lineHeight: 28,
    color: '#495057',
    marginBottom: 20,
  },
  imageGallery: {
    marginTop: 10,
    marginBottom: 20,
  },
  image: {
    width: imageWidth,
    height: imageWidth * 0.75,
    borderRadius: 8,
    marginBottom: 15,
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
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

export default NoticeDetailScreen;
