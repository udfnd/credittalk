import React, { useState } from 'react';
import {
  View,
  TextInput,
  Button,
  Text,
  Alert,
  StyleSheet,
  Keyboard,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

const jobTypes = ['일반', '사업자'];

function SignUpScreen() {
  const navigation = useNavigation();
  const { signUpWithEmail, isLoading: authIsLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [jobType, setJobType] = useState('일반');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (text) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(text);
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (
      !email.trim() ||
      !password.trim() ||
      !name.trim() ||
      !phoneNumber.trim() ||
      !nationalId.trim() ||
      !jobType
    ) {
      Alert.alert('입력 오류', '모든 필수 항목을 입력해주세요.');
      return;
    }
    if (!validateEmail(email.trim())) {
      Alert.alert('입력 오류', '올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('입력 오류', '비밀번호가 일치하지 않습니다.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('입력 오류', '비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (!/^\d{13}$/.test(nationalId.trim())) {
      Alert.alert('입력 오류', '주민등록번호는 13자리 숫자로 입력해주세요.');
      return;
    }
    if (!/^\d{10,11}$/.test(phoneNumber.trim())) {
      Alert.alert(
        '입력 오류',
        '전화번호를 올바르게 입력해주세요. (예: 01012345678)',
      );
      return;
    }

    setIsSubmitting(true);
    const additionalData = {
      name: name.trim(),
      phoneNumber: phoneNumber.trim(),
      nationalId: nationalId.trim(),
      jobType,
    };
    const result = await signUpWithEmail(
      email.trim(),
      password,
      additionalData,
    );
    setIsSubmitting(false);

    if (result.success) navigation.navigate('SignIn');
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <Text style={styles.title}>회원가입</Text>

        <TextInput
          style={styles.input}
          placeholder="이메일 주소"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호 (6자 이상)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호 확인"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="이름"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="전화번호 (예: 01012345678)"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          maxLength={11}
        />
        <TextInput
          style={styles.input}
          placeholder="주민등록번호 (13자리, - 제외)"
          value={nationalId}
          onChangeText={setNationalId}
          keyboardType="number-pad"
          maxLength={13}
          secureTextEntry // 민감 정보
        />

        <Text style={styles.label}>직업 유형</Text>
        <View style={styles.jobTypeContainer}>
          {jobTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.jobTypeButton,
                jobType === type && styles.jobTypeButtonSelected,
              ]}
              onPress={() => setJobType(type)}
            >
              <Text
                style={[
                  styles.jobTypeButtonText,
                  jobType === type && styles.jobTypeButtonTextSelected,
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isSubmitting || authIsLoading ? (
          <ActivityIndicator
            size="large"
            color="#3d5afe"
            style={styles.spinner}
          />
        ) : (
          <Button title="회원가입" onPress={handleSubmit} color="#3d5afe" />
        )}

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('SignIn')}
        >
          <Text style={styles.linkText}>
            이미 회원가입 하셨나요? 로그인하기
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#1e3a5f',
  },
  input: {
    height: 50,
    borderColor: '#ced4da',
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: 'white',
    fontSize: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
    color: '#495057',
    marginTop: 5,
  },
  jobTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 25,
    marginTop: 5,
  },
  jobTypeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20, // 양옆 간격 조정
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#adb5bd',
    backgroundColor: '#e9ecef',
  },
  jobTypeButtonSelected: {
    backgroundColor: '#3d5afe',
    borderColor: '#3d5afe',
  },
  jobTypeButtonText: {
    fontSize: 16, // 폰트 크기 조정
    color: '#495057',
  },
  jobTypeButtonTextSelected: {
    color: 'white',
    fontWeight: 'bold',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: '#3d5afe',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  spinner: {
    marginVertical: Platform.OS === 'ios' ? 18 : 19, // 버튼 높이와 유사하게
  },
});

export default SignUpScreen;
