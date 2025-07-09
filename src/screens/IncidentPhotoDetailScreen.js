import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  Image, // Image 추가
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import CommentsSection from "../components/CommentsSection";
// import { useAuth } from '../context/AuthContext'; // 관리자 삭제 기능 시 필요

const { width } = Dimensions.get('window');

function IncidentPhotoDetailScreen({ route, navigation }) {
  const { photoId, photoTitle } = route.params;
  // const { user } = useAuth(); // 관리자 기능 시 사용

  const [photo, setPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (photoTitle) {
      navigation.setOptions({ title: photoTitle });
    }
  }, [photoTitle, navigation]);

  const fetchPhotoDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('incident_photos')
        .select('*') // 모든 컬럼 또는 필요한 컬럼 선택
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
    } catch (err) {
      setError(err.message || '사진 자료 상세 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [photoId]);

  useEffect(() => {
    fetchPhotoDetail();
  }, [fetchPhotoDetail]);

  // 관리자용 삭제 함수 (선택적)
  // const handleDeletePhoto = async () => { ... };

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
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <Text style={styles.title}>{photo.title}</Text>
      {photo.image_url && (
        <Image
          source={{ uri: photo.image_url }}
          style={styles.photoImage}
          resizeMode="contain"
        />
      )}
      <View style={styles.metaContainer}>
        {photo.category && (
          <Text style={styles.category}>유형: {photo.category}</Text>
        )}
        <Text style={styles.date}>
          게시일: {new Date(photo.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.descriptionLabel}>설명:</Text>
        <Text style={styles.content}>
          {photo.description || '설명이 없습니다.'}
        </Text>
      </View>
      <CommentsSection postId={photoId} boardType="incident_photos" />
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
    textAlign: 'center',
  },
  photoImage: {
    width: width - 40, // 화면 너비에 맞게 (양쪽 패딩 제외)
    height: (width - 40) * 0.75, // 이미지 비율 (예: 4:3)
    borderRadius: 8,
    marginBottom: 20,
    alignSelf: 'center',
    backgroundColor: '#e0e0e0', // 이미지 로딩 중 배경색
  },
  metaContainer: {
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  category: {
    fontSize: 15,
    color: '#2980b9',
    marginBottom: 5,
    fontWeight: '500',
  },
  date: { fontSize: 13, color: '#7f8c8d' },
  contentContainer: { marginTop: 5 },
  descriptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#34495e',
    marginBottom: 8,
  },
  content: { fontSize: 16, lineHeight: 24, color: '#34495e' },
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
  // deleteButton: { ... },
  // deleteButtonText: { ... },
});

export default IncidentPhotoDetailScreen;
