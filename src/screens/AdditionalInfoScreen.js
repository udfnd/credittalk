// src/screens/AdditionalInfoScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Keyboard,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const jobTypes = ['일반', '사업자'];

function AdditionalInfoScreen() {
  const { user, setProfile, supabase } = useAuth();
  const [jobType, setJobType] = useState('일반');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [nickname, setNickname] = useState('');
  const [isNicknameAvailable, setIsNicknameAvailable] = useState(null);
  const [nicknameMessage, setNicknameMessage] = useState('');
  const [isCheckingNickname, setIsCheckingNickname] = useState(false);

  const handleNicknameChange = text => {
    setNickname(text);
    if (isNicknameAvailable !== null) {
      setIsNicknameAvailable(null);
      setNicknameMessage('');
    }
  };

  const handleCheckNickname = async () => {
    Keyboard.dismiss();
    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length < 2) {
      Alert.alert('입력 오류', '닉네임은 2자 이상이어야 합니다.');
      return;
    }

    setIsCheckingNickname(true);
    setNicknameMessage('');
    setIsNicknameAvailable(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        'check-nickname-availability',
        { body: { nickname: trimmedNickname } },
      );

      if (error) throw error;

      switch (data.status) {
        case 'available':
          setIsNicknameAvailable(true);
          setNicknameMessage('사용 가능한 닉네임입니다.');
          break;
        case 'taken':
          setIsNicknameAvailable(false);
          setNicknameMessage(data.message);
          break;
        case 'forbidden':
          setIsNicknameAvailable(false);
          setNicknameMessage(data.message);
          break;
        default:
          throw new Error('서버로부터 알 수 없는 응답을 받았습니다.');
      }
    } catch (err) {
      const errorMessage = err.context?.data?.error || err.message;
      setIsNicknameAvailable(false);
      setNicknameMessage(errorMessage);
    } finally {
      setIsCheckingNickname(false);
    }
  };

  const handleSubmit = async () => {
    if (isNicknameAvailable !== true) {
      Alert.alert('확인 필요', '닉네임 중복 확인을 완료해주세요.');
      return;
    }

    if (!user) {
      Alert.alert('오류', '사용자 세션이 만료되었습니다. 다시 로그인해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const profileData = {
        auth_user_id: user.id,
        name:
          user.user_metadata?.full_name || user.user_metadata?.name || '사용자',
        job_type: jobType,
        nickname: nickname.trim(),
        naver_id:
          user.user_metadata?.provider === 'naver'
            ? user.user_metadata?.provider_id
            : // @ts-ignore
              null,
      };

      const { data: insertedData, error } = await supabase
        .from('users')
        .insert(profileData)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          Alert.alert('오류', '이미 사용 중인 닉네임이거나 가입된 계정입니다.');
        } else {
          throw error;
        }
        return;
      }

      if (insertedData) {
        setProfile(insertedData);
      } else {
        throw new Error('프로필이 생성되었지만 데이터를 가져오지 못했습니다.');
      }
    } catch (err) {
      console.error('Error submitting additional info:', err);
      // @ts-ignore
      Alert.alert('오류', `추가 정보 저장에 실패했습니다: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>추가 정보 입력</Text>
      <Text style={styles.subtitle}>
        원활한 서비스 이용을 위해 추가 정보를 입력해주세요.
      </Text>

      <Text style={styles.label}>닉네임 (필수)</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.inputField}
          placeholder="실명과 거리가 먼 것으로 작성해주세요. (2자 이상)"
          value={nickname}
          onChangeText={handleNicknameChange}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.checkButton}
          onPress={handleCheckNickname}
          disabled={isCheckingNickname || nickname.trim().length < 2}>
          {isCheckingNickname ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.checkButtonText}>중복확인</Text>
          )}
        </TouchableOpacity>
      </View>
      {nicknameMessage ? (
        <Text
          style={[
            styles.message,
            isNicknameAvailable === true
              ? styles.successMessage
              : styles.errorMessage,
          ]}>
          {nicknameMessage}
        </Text>
      ) : null}

      <Text style={styles.label}>직업 유형</Text>
      <View style={styles.jobTypeContainer}>
        {jobTypes.map(type => (
          <TouchableOpacity
            key={type}
            style={[
              styles.jobTypeButton,
              jobType === type && styles.jobTypeButtonSelected,
            ]}
            onPress={() => setJobType(type)}>
            <Text
              style={[
                styles.jobTypeButtonText,
                jobType === type && styles.jobTypeButtonTextSelected,
              ]}>
              {type}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {isSubmitting ? (
        <ActivityIndicator size="large" color="#3d5afe" />
      ) : (
        <Button
          title="저장하고 시작하기"
          onPress={handleSubmit}
          color="#3d5afe"
          disabled={isNicknameAvailable !== true || isCheckingNickname}
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
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#1e3a5f',
  },
  subtitle: {
    fontSize: 16,
    color: 'gray',
    textAlign: 'center',
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 10,
    marginTop: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  inputField: {
    flex: 1,
    height: 50,
    borderColor: '#ced4da',
    borderWidth: 1,
    paddingHorizontal: 15,
    backgroundColor: 'white',
    fontSize: 16,
    color: '#000',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  checkButton: {
    height: 50,
    paddingHorizontal: 12,
    backgroundColor: '#6c757d',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  checkButtonText: { color: '#fff', fontWeight: 'bold' },
  message: {
    fontSize: 12,
    paddingLeft: 5,
    marginBottom: 10,
  },
  successMessage: { color: 'green' },
  errorMessage: { color: 'red' },
  jobTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 40,
  },
  jobTypeButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#adb5bd',
    backgroundColor: '#e9ecef',
  },
  jobTypeButtonSelected: { backgroundColor: '#3d5afe', borderColor: '#3d5afe' },
  jobTypeButtonText: { fontSize: 16, color: '#495057' },
  jobTypeButtonTextSelected: { color: 'white', fontWeight: 'bold' },
});

export default AdditionalInfoScreen;
