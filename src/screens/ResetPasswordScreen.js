import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';

function ResetPasswordScreen() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('입력 오류', '이메일 주소를 입력해주세요.');
      return;
    }
    setIsLoading(true);
    // 앱의 딥링크 스킴에 맞춰서 redirectTo를 설정해야 합니다.
    // 예: myapp://reset-password
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'credittalk://update-password', // 앱의 딥링크 주소로 변경
    });
    setIsLoading(false);

    if (error) {
      Alert.alert('오류', error.message);
    } else {
      Alert.alert(
        '이메일 발송 완료',
        '비밀번호 재설정 링크가 이메일로 발송되었습니다. 이메일을 확인해주세요.',
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>비밀번호 찾기</Text>
      <Text style={styles.subtitle}>
        가입 시 사용한 이메일 주소를 입력하시면, 해당 이메일로 비밀번호 재설정
        링크를 보내드립니다.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="가입한 이메일 주소"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {isLoading ? (
        <ActivityIndicator size="large" color="#3d5afe" />
      ) : (
        <Button
          title="재설정 링크 받기"
          onPress={handleResetPassword}
          color="#3d5afe"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: 'gray',
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  input: {
    height: 50,
    borderColor: '#ced4da',
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: 'white',
    fontSize: 16,
  },
});

export default ResetPasswordScreen;
