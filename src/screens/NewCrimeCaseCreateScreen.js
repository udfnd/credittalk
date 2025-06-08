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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

function NewCrimeCaseCreateScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [method, setMethod] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!method.trim()) {
      Alert.alert('입력 오류', '범죄 수법을 입력해주세요.');
      return;
    }
    if (!user) {
      Alert.alert('오류', '로그인 정보가 없습니다. 다시 로그인해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from('new_crime_cases').insert({
        method: method.trim(),
        user_id: user.id,
      });

      if (error) throw error;

      Alert.alert('작성 완료', '사례가 성공적으로 등록되었습니다.');
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        '작성 실패',
        err.message || '사례 등록 중 오류가 발생했습니다.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>신종 범죄 수법 등록</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="알고 계신 신종 범죄 수법이나 피해 사례를 자유롭게 작성해주세요."
        value={method}
        onChangeText={setMethod}
        multiline
        numberOfLines={10}
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
    minHeight: 200,
    textAlignVertical: 'top',
  },
  buttonContainer: {
    marginTop: 20,
    marginBottom: 40,
  },
});

export default NewCrimeCaseCreateScreen;
