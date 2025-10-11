import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '../lib/supabaseClient'; // 경로는 실제 프로젝트에 맞게 확인해주세요.
import { useAuth } from '../context/AuthContext'; // 경로는 실제 프로젝트에 맞게 확인해주세요.
import RNBlobUtil from 'react-native-blob-util';
import { Buffer } from 'buffer';
import { ensureSafeContent } from '../lib/contentSafety';

// 별점 평가를 위한 컴포넌트
const StarRating = ({ rating, setRating }) => {
  return (
    <View style={styles.starContainer}>
      {[1, 2, 3, 4, 5].map(star => (
        <TouchableOpacity key={star} onPress={() => setRating(star)}>
          <Icon
            name={star <= rating ? 'star' : 'star-outline'}
            size={40}
            color={star <= rating ? '#FFD700' : '#d3d3d3'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
};

function ReviewCreateScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState(0);
  const [images, setImages] = useState([]); // 선택된 이미지 파일들을 저장할 배열
  const [isLoading, setIsLoading] = useState(false);

  // 이미지 선택 함수 (최대 3개)
  const handleChoosePhotos = () => {
    const selectionLimit = 3 - images.length;
    if (selectionLimit <= 0) {
      Alert.alert('알림', '이미지는 최대 3장까지 추가할 수 있습니다.');
      return;
    }

    launchImageLibrary(
      {
        mediaType: 'photo',
        selectionLimit: selectionLimit, // 남은 개수만큼만 선택 가능
        quality: 0.8,
      },
      response => {
        if (response.didCancel) {
          return;
        }
        if (response.errorCode) {
          Alert.alert(
            '오류',
            `이미지를 선택하는 중 오류가 발생했습니다: ${response.errorMessage}`,
          );
          return;
        }
        if (response.assets && response.assets.length > 0) {
          setImages(prevImages => [...prevImages, ...response.assets]);
        }
      },
    );
  };

  // 선택된 이미지 삭제 함수
  const handleRemovePhoto = uri => {
    setImages(prevImages => prevImages.filter(image => image.uri !== uri));
  };

  // 폼 제출 함수
  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('오류', '로그인이 필요합니다.');
      return;
    }
    if (!title.trim() || !content.trim() || rating === 0) {
      Alert.alert('입력 오류', '제목, 내용, 별점을 모두 입력해주세요.');
      return;
    }

    let sanitized;
    try {
      sanitized = ensureSafeContent([
        { key: 'title', label: '제목', value: title, allowEmpty: false },
        { key: 'content', label: '내용', value: content, allowEmpty: false },
      ]);
    } catch (error) {
      Alert.alert('등록 불가', error.message);
      return;
    }

    setIsLoading(true);

    try {
      const imageUrls = [];
      // Promise.all을 사용하여 모든 이미지를 병렬로 업로드 (효율성 극대화)
      if (images.length > 0) {
        const uploadPromises = images.map(async asset => {
          const path =
            Platform.OS === 'android' && asset.uri.startsWith('content://')
              ? (await RNBlobUtil.fs.stat(asset.uri)).path
              : asset.uri.replace('file://', '');

          const base64Data = await RNBlobUtil.fs.readFile(path, 'base64');
          const arrayBuffer = Buffer.from(base64Data, 'base64');

          const fileExt = asset.fileName.split('.').pop();
          const fileName = `review-${user.id}-${Date.now()}-${Math.random()}.${fileExt}`;
          const filePath = `public/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('reviews-images') // 리뷰 이미지 전용 버킷 (없으면 생성 필요)
            .upload(filePath, arrayBuffer, {
              contentType: asset.type,
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`이미지 업로드 실패: ${uploadError.message}`);
          }

          const { data: urlData } = supabase.storage
            .from('reviews-images')
            .getPublicUrl(filePath);

          return urlData.publicUrl;
        });

        // 모든 업로드가 완료될 때까지 기다림
        const uploadedUrls = await Promise.all(uploadPromises);
        imageUrls.push(...uploadedUrls);
      }

      // Supabase 'reviews' 테이블에 데이터 삽입
      const { error: insertError } = await supabase.from('reviews').insert([
        {
          title: sanitized.title,
          content: sanitized.content,
          rating: rating,
          user_id: user.id,
          image_urls: imageUrls.length > 0 ? imageUrls : null, // 이미지가 있으면 URL 배열 저장
          is_published: true,
        },
      ]);

      if (insertError) {
        throw new Error(`후기 등록 실패: ${insertError.message}`);
      }

      Alert.alert('성공', '후기가 성공적으로 등록되었습니다.');
      navigation.goBack(); // 이전 화면으로 돌아가기
    } catch (error) {
      console.error('후기 등록 중 오류:', error);
      Alert.alert(
        '등록 실패',
        error.message || '알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>크레딧톡 후기 작성</Text>

        <Text style={styles.label}>별점 평가</Text>
        <StarRating rating={rating} setRating={setRating} />

        <Text style={styles.label}>제목</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="제목을 입력해주세요."
          placeholderTextColor="#6c757d"
        />

        <Text style={styles.label}>내용</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={content}
          onChangeText={setContent}
          placeholder="서비스 이용 경험을 공유해주세요."
          placeholderTextColor="#6c757d"
          multiline
          numberOfLines={6}
        />

        <Text style={styles.label}>사진 첨부 (선택, 최대 3장)</Text>
        <View style={styles.imageContainer}>
          {images.map(image => (
            <View key={image.uri} style={styles.imageWrapper}>
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => handleRemovePhoto(image.uri)}>
                <Icon name="close-circle" size={28} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          ))}
          {images.length < 3 && (
            <TouchableOpacity
              style={styles.addImageButton}
              onPress={handleChoosePhotos}>
              <Icon name="camera-plus-outline" size={40} color="#adb5bd" />
              <Text style={styles.addImageText}>사진 추가</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            isLoading && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>후기 등록하기</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 50,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#212529',
    textAlign: 'center',
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#212529',
  },
  textArea: {
    height: 150,
    textAlignVertical: 'top',
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  imageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  imageWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
    margin: 5,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#e9ecef',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'white',
    borderRadius: 14,
  },
  addImageButton: {
    width: 100,
    height: 100,
    margin: 5,
    borderRadius: 8,
    backgroundColor: '#f1f3f5',
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageText: {
    marginTop: 4,
    fontSize: 12,
    color: '#868e96',
  },
  submitButton: {
    backgroundColor: '#3d5afe',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 32,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  submitButtonDisabled: {
    backgroundColor: '#a5b4fc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default ReviewCreateScreen;
