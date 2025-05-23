import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  TouchableOpacity, // 별점 선택용
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'; // 별점 아이콘용
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

// 별점 입력 컴포넌트
const RatingInput = ({ rating, onRatingChange }) => {
  const stars = [1, 2, 3, 4, 5];
  return (
    <View style={styles.ratingContainer}>
      <Text style={styles.label}>별점:</Text>
      {stars.map((star) => (
        <TouchableOpacity key={star} onPress={() => onRatingChange(star)}>
          <Icon
            name={star <= rating ? 'star' : 'star-outline'}
            size={30}
            color={star <= rating ? '#FFD700' : '#ccc'}
            style={styles.starIcon}
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
  const [rating, setRating] = useState(0); // 0은 별점 미선택
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!title.trim() || !content.trim()) {
      Alert.alert('입력 오류', '제목과 내용을 모두 입력해주세요.');
      return;
    }
    if (rating === 0) {
      Alert.alert('입력 오류', '별점을 선택해주세요.');
      return;
    }
    if (!user) {
      Alert.alert('오류', '로그인 정보가 없습니다. 다시 로그인해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from('reviews').insert({
        title: title.trim(),
        content: content.trim(),
        user_id: user.id,
        rating: rating,
        is_published: true, // 기본값으로 게시
      });

      if (error) throw error;

      Alert.alert('작성 완료', '후기가 성공적으로 등록되었습니다.');
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        '작성 실패',
        err.message || '후기 등록 중 오류가 발생했습니다.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>후기 작성</Text>
      <TextInput
        style={styles.input}
        placeholder="제목을 입력하세요"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <RatingInput rating={rating} onRatingChange={setRating} />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="내용을 입력하세요"
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={8} // 높이 조절
        textAlignVertical="top"
      />
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
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 25,
    color: '#34495e',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: '500',
    color: '#495057',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ced4da',
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderRadius: 8,
    backgroundColor: 'white',
    fontSize: 16,
    color: '#212529',
  },
  textArea: {
    minHeight: 150, // 최소 높이
    textAlignVertical: 'top',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  starIcon: {
    marginHorizontal: 3,
  },
  buttonContainer: {
    marginTop: 20,
    marginBottom: 40,
  },
});

export default ReviewCreateScreen;
