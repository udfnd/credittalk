import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  TouchableOpacity,
  Image,
  Platform,
  Button,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import RNBlobUtil from 'react-native-blob-util';
import { Buffer } from 'buffer';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext'; // useAuth hook

export default function ArrestNewsCreateScreen() {
  const navigation = useNavigation();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [category, setCategory] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [arrestStatus, setArrestStatus] = useState(null);
  const [reportedToPolice, setReportedToPolice] = useState(null);
  const [policeStations, setPoliceStations] = useState([]);
  const [policeSearch, setPoliceSearch] = useState('');
  const [selectedStation, setSelectedStation] = useState(null);
  const [isPoliceLoading, setIsPoliceLoading] = useState(false);

  useEffect(() => {
    const fetchStations = async () => {
      try {
        setIsPoliceLoading(true);
        const { data, error } = await supabase
          .from('police_stations')
          .select('id, name, region, address')
          .order('name', { ascending: true });
        if (error) throw error;
        setPoliceStations(data || []);
      } catch (err) {
        console.error('Failed to load police stations:', err);
        Alert.alert(
          '로드 실패',
          '경찰서 목록을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        );
      } finally {
        setIsPoliceLoading(false);
      }
    };

    if (reportedToPolice === true && policeStations.length === 0) {
      fetchStations();
    }
  }, [reportedToPolice, policeStations.length]);

  useEffect(() => {
    if (reportedToPolice !== true) {
      setSelectedStation(null);
      setPoliceSearch('');
    }
  }, [reportedToPolice]);

  const filteredStations = useMemo(() => {
    if (!policeSearch.trim()) return policeStations;
    const keyword = policeSearch.trim().toLowerCase();
    return policeStations.filter(station => {
      const fields = [station.name, station.region, station.address]
        .filter(Boolean)
        .map(value => value.toLowerCase());
      return fields.some(field => field.includes(keyword));
    });
  }, [policeSearch, policeStations]);

  const handleChoosePhotos = () => {
    const limit = 3 - photos.length;
    if (limit <= 0) {
      Alert.alert('알림', '사진은 최대 3장까지 등록할 수 있습니다.');
      return;
    }
    launchImageLibrary(
      { mediaType: 'photo', selectionLimit: limit, quality: 0.7 },
      res => {
        if (res.didCancel) return;
        if (res.errorCode) {
          Alert.alert('오류', `사진 선택 오류: ${res.errorMessage}`);
        } else if (res.assets) {
          setPhotos(prev => [...prev, ...res.assets]);
        }
      },
    );
  };

  const handleRemovePhoto = uri =>
    setPhotos(prev => prev.filter(p => p.uri !== uri));

  const getFilePath = async uri => {
    if (Platform.OS === 'android' && uri.startsWith('content://')) {
      const stat = await RNBlobUtil.fs.stat(uri);
      return stat.path;
    }
    return uri.replace('file://', '');
  };

  const uploadToSupabase = async photo => {
    const path = await getFilePath(photo.uri);
    const base64Data = await RNBlobUtil.fs.readFile(path, 'base64');
    const arrayBuffer = Buffer.from(base64Data, 'base64');

    const ext = photo.fileName?.split('.').pop() || 'jpg';
    const fileName = `${user.id}_${Date.now()}.${ext}`;
    const storagePath = `arrest-news/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(storagePath, arrayBuffer, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError)
      throw new Error(`사진 업로드 실패: ${uploadError.message}`);

    const { data: urlData } = supabase.storage
      .from('post-images')
      .getPublicUrl(storagePath);

    if (!urlData || !urlData.publicUrl)
      throw new Error('URL 생성에 실패했습니다.');

    return urlData.publicUrl;
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!title.trim()) {
      Alert.alert('입력 오류', '제목을 모두 입력해주세요.');
      return;
    }
    if (!arrestStatus) {
      Alert.alert('입력 오류', '검거/활동 상태를 선택해주세요.');
      return;
    }
    if (reportedToPolice === null) {
      Alert.alert('입력 오류', '경찰 신고 여부를 선택해주세요.');
      return;
    }
    if (reportedToPolice && !selectedStation) {
      Alert.alert('입력 오류', '신고하신 경찰서를 선택해주세요.');
      return;
    }
    if (!user) {
      Alert.alert('오류', '로그인 정보가 없습니다.');
      return;
    }

    setIsLoading(true);
    try {
      const authorNameToSubmit = profile?.nickname || user.email || '관리자';

      const imageUrls = await Promise.all(photos.map(p => uploadToSupabase(p)));

      const { error: insertError } = await supabase.from('arrest_news').insert({
        title: title.trim(),
        content: content.trim() || null,
        author_name: authorNameToSubmit,
        link_url: linkUrl.trim() || null,
        category: category.trim() || null,
        image_urls: imageUrls.length ? imageUrls : null,
        user_id: user.id,
        arrest_status: arrestStatus,
        reported_to_police: reportedToPolice,
        police_station_id: reportedToPolice ? selectedStation?.id : null,
      });
      if (insertError) throw insertError;

      Alert.alert('작성 완료', '게시글이 성공적으로 등록되었습니다.');
      navigation.goBack();
    } catch (err) {
      console.error('Submit Error:', err);
      Alert.alert(
        '작성 실패',
        err.message || '알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>새 검거소식 작성</Text>
      <Text style={styles.label}>검거/활동 상태 *</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, arrestStatus === 'arrested' && styles.toggleButtonActive]}
          onPress={() => setArrestStatus('arrested')}>
          <Text
            style={[styles.toggleButtonText, arrestStatus === 'arrested' && styles.toggleButtonTextActive]}>검거</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, arrestStatus === 'active' && styles.toggleButtonActive]}
          onPress={() => setArrestStatus('active')}>
          <Text
            style={[styles.toggleButtonText, arrestStatus === 'active' && styles.toggleButtonTextActive]}>활동</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.helperList}>
        <Text style={styles.helperText}>- 검거 : 해당 범죄자가 이미 검거됨</Text>
        <Text style={styles.helperText}>- 활동 : 해당 범죄자가 검거되지 않고 활동 중임</Text>
      </View>

      <Text style={styles.label}>경찰에 신고하셨습니까? *</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, reportedToPolice === true && styles.toggleButtonActive]}
          onPress={() => setReportedToPolice(true)}>
          <Text
            style={[styles.toggleButtonText, reportedToPolice === true && styles.toggleButtonTextActive]}>예</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, reportedToPolice === false && styles.toggleButtonActive]}
          onPress={() => setReportedToPolice(false)}>
          <Text
            style={[styles.toggleButtonText, reportedToPolice === false && styles.toggleButtonTextActive]}>아니오</Text>
        </TouchableOpacity>
      </View>

      {reportedToPolice === true && (
        <View style={styles.policeSearchContainer}>
          <TextInput
            style={styles.input}
            value={policeSearch}
            onChangeText={setPoliceSearch}
            placeholder="경찰서 이름 또는 지역 검색"
            placeholderTextColor="#6c757d"
          />
          {isPoliceLoading ? (
            <ActivityIndicator size="small" color="#3d5afe" style={{ marginVertical: 10 }} />
          ) : (
            <FlatList
              data={filteredStations}
              keyExtractor={item => item.id.toString()}
              nestedScrollEnabled
              style={styles.policeList}
              ListEmptyComponent={() => (
                <Text style={styles.emptyPoliceText}>검색 결과가 없습니다.</Text>
              )}
              renderItem={({ item }) => {
                const isSelected = selectedStation?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.policeItem, isSelected && styles.policeItemSelected]}
                    onPress={() => setSelectedStation(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.policeName}>{item.name}</Text>
                      {item.region ? (
                        <Text style={styles.policeMeta}>{item.region}</Text>
                      ) : null}
                      {item.address ? (
                        <Text style={styles.policeMeta}>{item.address}</Text>
                      ) : null}
                    </View>
                    {isSelected && (
                      <Icon name="check-circle" size={22} color="#3d5afe" />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="제목 *"
        placeholderTextColor="#6c757d"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="내용"
        placeholderTextColor="#6c757d"
        value={content}
        onChangeText={setContent}
        multiline
      />
      <TextInput
        style={styles.input}
        placeholder="카테고리"
        placeholderTextColor="#6c757d"
        value={category}
        onChangeText={setCategory}
      />
      <TextInput
        style={styles.input}
        placeholder="관련 링크 URL"
        placeholderTextColor="#6c757d"
        value={linkUrl}
        onChangeText={setLinkUrl}
        keyboardType="url"
        autoCapitalize="none"
      />

      <Text style={styles.label}>사진 첨부 (최대 3장)</Text>
      <View style={styles.photoContainer}>
        {photos.map(p => (
          <View key={p.uri} style={styles.photoWrapper}>
            <Image source={{ uri: p.uri }} style={styles.thumbnail} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemovePhoto(p.uri)}>
              <Icon name="close-circle" size={24} color="#e74c3c" />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < 3 && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleChoosePhotos}>
            <Icon name="camera-plus" size={30} color="#868e96" />
            <Text style={styles.addButtonText}>사진 추가</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.buttonContainer}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#3d5afe" />
        ) : (
          <Button title="등록하기" onPress={handleSubmit} color="#3d5afe" />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8f9fa' },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#34495e',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ced4da',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: 'white',
    fontSize: 16,
    color: '#212529',
    marginBottom: 15,
  },
  textArea: {
    minHeight: 150,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 10,
    marginTop: 10,
  },
  helperList: {
    marginBottom: 10,
  },
  helperText: {
    fontSize: 13,
    color: '#868e96',
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    marginBottom: 10,
    marginTop: 4,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 4,
  },
  toggleButtonActive: {
    borderColor: '#3d5afe',
    backgroundColor: '#e8f0ff',
  },
  toggleButtonText: {
    fontSize: 16,
    color: '#495057',
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: '#1a237e',
  },
  policeSearchContainer: {
    marginBottom: 20,
  },
  policeList: {
    maxHeight: 240,
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  policeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  policeItemSelected: {
    backgroundColor: '#edf2ff',
    borderLeftWidth: 3,
    borderLeftColor: '#3d5afe',
  },
  policeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212529',
  },
  policeMeta: {
    fontSize: 13,
    color: '#868e96',
    marginTop: 2,
  },
  emptyPoliceText: {
    textAlign: 'center',
    paddingVertical: 20,
    color: '#868e96',
  },
  photoContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  photoWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
    marginRight: 10,
    marginBottom: 10,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#e9ecef',
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  addButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 12,
    color: '#868e96',
    marginTop: 4,
  },
  buttonContainer: {
    marginTop: 30,
    marginBottom: 40,
  },
});
