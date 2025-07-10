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
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from "../context/AuthContext";
import { logPageView } from "../lib/pageViewLogger";

function IncidentPhotoListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 로그인한 사용자만 기록합니다.
    if (user) {
      logPageView(user.id, 'IncidentPhotoListScreen');
    }
  }, [user]);

  const fetchPhotos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('incident_photos')
        .select('id, title, created_at, image_url, category, description') // image_url 포함
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setPhotos(data || []);
    } catch (err) {
      setError(err.message || '사진 자료를 불러오는데 실패했습니다.');
      setPhotos([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      fetchPhotos();
    }
  }, [fetchPhotos, isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPhotos();
  }, [fetchPhotos]);

  // 관리자용 업로드 버튼 (선택적)
  // const handleCreatePhoto = () => {
  //   navigation.navigate('AdminIncidentPhotoCreate');
  // };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.photoItem}
      onPress={() =>
        navigation.navigate('IncidentPhotoDetail', {
          photoId: item.id,
          photoTitle: item.title,
        })
      }
    >
      {item.image_url && (
        <Image
          source={{ uri: item.image_url }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      )}
      <View style={styles.infoContainer}>
        <Text style={styles.photoTitle}>{item.title}</Text>
        {item.category && (
          <Text style={styles.photoCategory}>유형: {item.category}</Text>
        )}
        <Text style={styles.photoDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading && !refreshing && photos.length === 0) {
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
        <TouchableOpacity onPress={fetchPhotos} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        numColumns={2} // 그리드 레이아웃 (선택적)
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.centered}>
              <Icon name="camera-off-outline" size={50} color="#bdc3c7" />
              <Text style={styles.emptyText}>등록된 사진 자료가 없습니다.</Text>
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
      {/* 관리자용 업로드 FAB (선택적) */}
      {/* {user && user.isAdmin && ( // isAdmin은 예시, 실제 관리자 확인 로직 필요
        <TouchableOpacity style={styles.fab} onPress={handleCreatePhoto}>
          <Icon name="camera-plus-outline" size={30} color="white" />
        </TouchableOpacity>
      )} */}
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
  listContainer: { padding: 10 },
  photoItem: {
    flex: 1, // numColumns 사용 시
    margin: 5, // 아이템 간 간격
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden', // Image borderRadius 적용
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  thumbnail: {
    width: '100%',
    height: 150, // 썸네일 이미지 높이
  },
  infoContainer: {
    padding: 10,
  },
  photoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 3,
  },
  photoCategory: { fontSize: 12, color: '#555', marginBottom: 5 },
  photoDate: { fontSize: 11, color: '#7f8c8d' },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
  },
  emptyText: { marginTop: 10, fontSize: 16, color: '#7f8c8d' },
  fab: {
    /* 이전 FAB 스타일과 유사하게 */ position: 'absolute',
    margin: 16,
    right: 10,
    bottom: 10,
    backgroundColor: '#16a085',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
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

export default IncidentPhotoListScreen;
