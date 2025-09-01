// src/screens/IncidentPhotoDetailScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import CommentsSection from "../components/CommentsSection";
import { useIncrementView } from '../hooks/useIncrementView';
import { AvoidSoftInput } from 'react-native-avoid-softinput';

const { width } = Dimensions.get('window');

function IncidentPhotoDetailScreen({ route, navigation }) {
  const { photoId, photoTitle } = route.params;

  const [photo, setPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useIncrementView('incident_photos', photoId);

  useEffect(() => {
    if (photoTitle) {
      navigation.setOptions({ title: photoTitle });
    }
  }, [photoTitle, navigation]);

  useEffect(() => {
    AvoidSoftInput.setShouldMimicIOSBehavior(true);
    return () => {
      AvoidSoftInput.setShouldMimicIOSBehavior(false);
    };
  }, []);

  const sanitizeUrl = (raw) => {
    if (!raw) return "";
    return String(raw)
      .trim()
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
      .replace(/\s+/g, "");
  };

  const handleLinkPress = async (rawUrl) => {
    const url = sanitizeUrl(rawUrl);
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert("오류", `이 링크를 열 수 없습니다: ${e.message}`);
    }
  };

  const fetchPhotoDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('incident_photos')
        .select('id, title, created_at, image_urls, category, description, link_url, views')
        .eq('id', photoId)
        .eq('is_published', true)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new Error('사진 자료를 찾을 수 없거나 접근 권한이 없습니다.');
        }
        throw fetchError;
      }
      setPhoto(data);
      if (data?.title) {
        navigation.setOptions({ title: data.title });
      }
    } catch (err) {
      setError(err.message || '사진 자료 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [photoId, navigation]);

  useEffect(() => { fetchPhotoDetail(); }, [fetchPhotoDetail]);

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
        <TouchableOpacity onPress={fetchPhotoDetail} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!photo) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>사진 자료 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="always"
      >
        {/* 헤더 (제목/메타) */}
        <View style={styles.header}>
          <Text style={styles.title}>{photo.title}</Text>
          <View style={styles.metaContainer}>
            <Text style={styles.date}>
              게시일: {new Date(photo.created_at).toLocaleDateString()}
            </Text>
            <Text style={styles.date}>조회수: {photo.views || 0}</Text>
          </View>
          {!!photo.category && (
            <Text style={[styles.date, { marginTop: 4 }]}>
              카테고리: {photo.category}
            </Text>
          )}
        </View>

        {/* 본문 설명 */}
        <View style={styles.contentContainer}>
          <Text style={styles.content}>{photo.description || '설명이 없습니다.'}</Text>
        </View>

        {/* ✅ 이미지 섹션 — NewCrimeCaseDetailScreen 과 동일한 방식 */}
        {!!(Array.isArray(photo.image_urls) && photo.image_urls.length) && (
          <View style={styles.imageSection}>
            <Text style={styles.label}>첨부 사진</Text>
            {photo.image_urls.map((url, index) => (
              <Image
                key={index}
                source={{ uri: url }}
                style={styles.image}
                resizeMode="contain"
              />
            ))}
          </View>
        )}

        {/* 링크 버튼 */}
        {photo.link_url && (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => handleLinkPress(photo.link_url)}
          >
            <Icon name="link-variant" size={20} color="#fff" />
            <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
          </TouchableOpacity>
        )}

        {/* 댓글 */}
        <CommentsSection postId={photoId} boardType="incident_photos" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  centered: {
    flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "#f8f9fa",
  },
  errorText: { marginTop: 10, fontSize: 16, color: "#e74c3c", textAlign: "center" },
  emptyText: { fontSize: 16, color: "#7f8c8d" },
  retryButton: {
    marginTop: 20, backgroundColor: "#3d5afe", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5,
  },
  retryButtonText: { color: "white", fontSize: 16 },

  header: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ecf0f1",
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: "#fff",
  },
  title: { fontSize: 22, fontWeight: "bold", color: "#2c3e50", marginBottom: 12 },
  metaContainer: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  date: { fontSize: 13, color: "#7f8c8d" },

  contentContainer: { marginBottom: 25, paddingHorizontal: 20, backgroundColor: "#fff" },
  content: { fontSize: 16, lineHeight: 26, color: "#34495e" },

  // 🔽 NewCrimeCaseDetailScreen 과 동일한 스타일
  imageSection: { marginTop: 10, paddingHorizontal: 20, backgroundColor: "#fff" },
  label: { fontSize: 18, fontWeight: "bold", color: "#2c3e50", marginBottom: 8 },
  image: {
    width: "100%",
    height: width * 0.8,
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: "#e9ecef",
  },

  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3d5afe",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    marginHorizontal: 20,
  },
  linkButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", marginLeft: 8 },
});

export default IncidentPhotoDetailScreen;
