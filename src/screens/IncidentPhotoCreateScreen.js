import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import RNBlobUtil from 'react-native-blob-util';
import { Buffer } from 'buffer';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function IncidentPhotoCreateScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

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
    const storagePath = `incident-photos/${fileName}`; // 스토리지 경로 변경

    const { error: uploadError } = await supabase.storage
      .from('post-images') // 스토리지 버킷 이름
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
    if (!title.trim() || photos.length === 0) {
      Alert.alert('입력 오류', '제목과 사진은 필수 항목입니다.');
      return;
    }
    if (!user) {
      Alert.alert('오류', '로그인 정보가 없습니다.');
      return;
    }

    setIsLoading(true);
    try {
      const imageUrls = await Promise.all(photos.map(p => uploadToSupabase(p)));
      const { error } = await supabase.from('incident_photos').insert({
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        link_url: linkUrl.trim() || null,
        uploader_id: user.id,
        image_urls: imageUrls.length ? imageUrls : null,
      });
      if (error) throw error;

      Alert.alert('작성 완료', '사진 자료가 성공적으로 등록되었습니다.');
      navigation.goBack();
    } catch (err) {
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
      <Text style={styles.pageTitle}>새 사진 자료 등록</Text>

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
        placeholder="설명"
        placeholderTextColor="#6c757d"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <TextInput
        style={styles.input}
        placeholder="카테고리"
        placeholderTextColor="#6c757d"
        value={category}
        onChangeText={setCategory}
      />
      <Text style={styles.label}>사진 첨부 (최대 3장) *</Text>
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
