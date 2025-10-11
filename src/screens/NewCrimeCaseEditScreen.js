import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import RNBlobUtil from 'react-native-blob-util';
import { Buffer } from 'buffer';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ensureSafeContent } from '../lib/contentSafety';

export default function NewCrimeCaseEditScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { caseId } = route.params;
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [method, setMethod] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [category, setCategory] = useState('');
  const [photos, setPhotos] = useState([]);
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    const fetchCase = async () => {
      try {
        const { data, error } = await supabase
          .from('new_crime_cases')
          .select('title, method, link_url, category, image_urls, user_id')
          .eq('id', caseId)
          .single();

        if (error) throw error;
        if (data.user_id !== user.id) {
          Alert.alert('권한 없음', '이 사례를 수정할 권한이 없습니다.');
          navigation.goBack();
          return;
        }

        setTitle(data.title);
        setMethod(data.method || '');
        setLinkUrl(data.link_url || '');
        setCategory(data.category || '');
        setExistingPhotos(data.image_urls || []);
      } catch (err) {
        Alert.alert('오류', '사례 정보를 불러오는 데 실패했습니다.');
        console.error('Fetch case error:', err);
      } finally {
        setIsFetching(false);
      }
    };

    fetchCase();
  }, [caseId, navigation, user.id]);

  const handleChoosePhotos = () => {
    const limit = 5 - (photos.length + existingPhotos.length);
    if (limit <= 0) {
      Alert.alert('알림', '사진은 최대 5장까지 등록할 수 있습니다.');
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

  const handleRemoveNewPhoto = uri =>
    setPhotos(prev => prev.filter(p => p.uri !== uri));
  const handleRemoveExistingPhoto = url =>
    setExistingPhotos(prev => prev.filter(pUrl => pUrl !== url));

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
    const storagePath = `new-crime-cases/${fileName}`;

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
    if (!title.trim() || !method.trim()) {
      Alert.alert('입력 오류', '제목과 범죄 수법을 모두 입력해주세요.');
      return;
    }

    let sanitized;
    try {
      sanitized = ensureSafeContent([
        { key: 'title', label: '제목', value: title, allowEmpty: false },
        { key: 'method', label: '범죄 수법', value: method, allowEmpty: false },
        { key: 'category', label: '카테고리', value: category },
        { key: 'link', label: '링크', value: linkUrl },
      ]);
    } catch (error) {
      Alert.alert('수정 불가', error.message);
      return;
    }

    setIsLoading(true);
    try {
      const newImageUrls = await Promise.all(
        photos.map(p => uploadToSupabase(p)),
      );
      const finalImageUrls = [...existingPhotos, ...newImageUrls];

      const { error: updateError } = await supabase
        .from('new_crime_cases')
        .update({
          title: sanitized.title,
          method: sanitized.method,
          link_url: sanitized.link || null,
          category: sanitized.category || null,
          image_urls: finalImageUrls.length > 0 ? finalImageUrls : null,
        })
        .eq('id', caseId);

      if (updateError) throw updateError;

      Alert.alert('수정 완료', '사례가 성공적으로 수정되었습니다.');
      navigation.goBack();
    } catch (err) {
      console.error('Submit Error:', err);
      Alert.alert(
        '수정 실패',
        err.message || '알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return <ActivityIndicator style={{ marginTop: 20 }} size="large" />;
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>신종범죄 사례 수정</Text>
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
        placeholder="범죄 수법 *"
        placeholderTextColor="#6c757d"
        value={method}
        onChangeText={setMethod}
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
        placeholder="관련 링크 URL (선택)"
        placeholderTextColor="#6c757d"
        value={linkUrl}
        onChangeText={setLinkUrl}
        keyboardType="url"
        autoCapitalize="none"
      />
      <Text style={styles.label}>사진 첨부 (최대 5장)</Text>
      <View style={styles.photoContainer}>
        {existingPhotos.map(url => (
          <View key={url} style={styles.photoWrapper}>
            <Image source={{ uri: url }} style={styles.thumbnail} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveExistingPhoto(url)}>
              <Icon name="close-circle" size={24} color="#e74c3c" />
            </TouchableOpacity>
          </View>
        ))}
        {photos.map(p => (
          <View key={p.uri} style={styles.photoWrapper}>
            <Image source={{ uri: p.uri }} style={styles.thumbnail} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveNewPhoto(p.uri)}>
              <Icon name="close-circle" size={24} color="#e74c3c" />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length + existingPhotos.length < 5 && (
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
          <Button title="수정하기" onPress={handleSubmit} color="#3d5afe" />
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
  textArea: { minHeight: 150, textAlignVertical: 'top' },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 10,
    marginTop: 10,
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
  addButtonText: { fontSize: 12, color: '#868e96', marginTop: 4 },
  buttonContainer: { marginTop: 30, marginBottom: 40 },
});
