import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { AvoidSoftInput } from 'react-native-avoid-softinput';
import { useFocusEffect } from '@react-navigation/native';

export default function HelpDeskNoticeDetailScreen({ route, navigation }) {
  const noticeId = route?.params?.noticeId;
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const { width: windowWidth } = useWindowDimensions();
  const imageWidth = Math.max(windowWidth - 40, 0);

  const fetchNotice = useCallback(async () => {
    if (!noticeId) {
      Alert.alert('오류', '잘못된 공지 ID 입니다.');
      navigation.goBack();
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('help_desk_notices')
        .select('id, title, body, created_at, pinned, image_urls, link_url')
        .eq('id', noticeId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        Alert.alert('안내', '해당 공지를 찾을 수 없습니다.');
        navigation.goBack();
        return;
      }
      setNotice(data);
    } catch (e) {
      Alert.alert('오류', e?.message ?? '공지 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [noticeId, navigation]);

  useEffect(() => {
    fetchNotice();
  }, [fetchNotice]);

  useFocusEffect(
    useCallback(() => {
      AvoidSoftInput.setEnabled(true);
      AvoidSoftInput.setShouldMimicIOSBehavior(true);
      return () => {
        AvoidSoftInput.setEnabled(false);
        AvoidSoftInput.setShouldMimicIOSBehavior(false);
      };
    }, []),
  );

  useEffect(() => {
    if (notice?.title) {
      navigation.setOptions({ title: notice.title });
    }
  }, [notice, navigation]);

  const openLink = useCallback(async url => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('안내', '링크를 열 수 없습니다.');
      }
    } catch {
      Alert.alert('오류', '링크를 여는 중 문제가 발생했습니다.');
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  if (!notice) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>공지 정보를 불러올 수 없습니다.</Text>
      </View>
    );
  }

  // 본문 줄바꿈 처리
  const bodyLines = String(notice.body || '').split(/\r?\n/);
  const imageUrls = Array.isArray(notice.image_urls) ? notice.image_urls : [];
  const linkUrl =
    typeof notice.link_url === 'string' && notice.link_url.trim().length > 0
      ? notice.link_url.trim()
      : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>{notice.title}</Text>
      <Text style={styles.meta}>
        {new Date(notice.created_at).toLocaleString()}
        {notice.pinned ? '  ·  고정' : ''}
      </Text>
      <View style={styles.body}>
        {bodyLines.map((line, idx) => (
          <Text key={idx} style={styles.bodyText}>
            {line || ' '}
          </Text>
        ))}
      </View>

      {imageUrls.length > 0 && (
        <View style={styles.imagesWrap}>
          {imageUrls.map((url, idx) => (
            <Image
              key={`${url}-${idx}`}
              source={{ uri: url }}
              style={[styles.image, { width: imageWidth }]}
              resizeMode="contain"
            />
          ))}
        </View>
      )}

      {linkUrl && (
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => openLink(linkUrl)}
          activeOpacity={0.8}>
          <Text style={styles.linkButtonText}>관련 링크 보기</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#868e96', fontSize: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  meta: { marginTop: 6, color: '#6b7280', fontSize: 13 },
  body: { marginTop: 16, gap: 6 },
  bodyText: { fontSize: 16, color: '#111827', lineHeight: 22 },
  imagesWrap: { marginTop: 20, gap: 12 },
  image: {
    height: 220,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  linkButton: {
    marginTop: 24,
    backgroundColor: '#3d5afe',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
