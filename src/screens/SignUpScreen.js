import React, { useState } from 'react';
import {
  View,
  TextInput,
  Button,
  Text,
  Alert,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';

function SignUpScreen({ navigation }) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [jobType, setJobType] = useState('일반');

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (!name || !phoneNumber || !nationalId || !jobType) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.');
      return;
    }

    try {
      const { data, error } = await supabase.from('users').insert([
        {
          name,
          phone_number: phoneNumber,
          national_id: nationalId,
          job_type: jobType,
        },
      ]);

      if (error) throw error;

      Alert.alert('회원가입 성공', '회원가입이 완료되었습니다.');
      navigation.goBack(); // 홈 화면으로 돌아가기
    } catch (error) {
      Alert.alert('회원가입 실패', `오류 발생: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>회원가입</Text>

      <TextInput
        style={styles.input}
        placeholder="이름"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="전화번호 (010-xxxx-xxxx)"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="주민등록번호"
        value={nationalId}
        onChangeText={setNationalId}
        keyboardType="number-pad"
      />
      <View style={styles.jobTypeContainer}>
        <Button title="일반" onPress={() => setJobType('일반')} />
        <Button
          title="대부업 종사자"
          onPress={() => setJobType('대부업 종사자')}
        />
        <Button
          title="자영업 종사자"
          onPress={() => setJobType('자영업 종사자')}
        />
      </View>
      <Button title="회원가입" onPress={handleSubmit} color="#3d5afe" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: { height: 50, borderWidth: 1, marginBottom: 15, paddingLeft: 10 },
  jobTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
});

export default SignUpScreen;
