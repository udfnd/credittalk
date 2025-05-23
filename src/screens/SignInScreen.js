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

function SignInScreen() {
  const navigation = useNavigation();
  const { signInWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password.trim()) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    console.log('[SignInScreen] Calling signInWithEmail for:', email);
    try {
      const result = await signInWithEmail(email.trim(), password);
      console.log('[SignInScreen] Result from signInWithEmail:', result);

      if (result.success) {
        // 성공 시 AuthContext의 onAuthStateChange 리스너가
        // user 상태 업데이트 및 AppNavigator의 화면 전환을 처리합니다.
        // 여기서 별도의 네비게이션이나 Alert는 필요 없을 수 있습니다.
        // Alert.alert('로그인 성공', `${result.user.email}님 환영합니다!`);
      } else {
        // signInWithEmail 내부에서 Alert를 이미 호출했을 수 있으므로,
        // 여기서는 추가적인 UI 피드백만 제공하거나, result.error를 사용하여
        // 더 구체적인 오류 메시지를 표시할 수 있습니다.
        if (result.error && result.error.message) {
          Alert.alert('로그인 실패', result.error.message);
        } else {
          Alert.alert('로그인 실패', '알 수 없는 오류가 발생했습니다.');
        }
      }
    } catch (unexpectedError) {
      // signInWithEmail이 {success: false, error}를 반환하도록 설계되었으므로,
      // 이 catch 블록은 signInWithEmail 함수 자체의 예외 또는 네트워크 문제 등 예기치 않은 상황에 도달.
      console.error(
        '[SignInScreen] Unexpected error during handleSignIn:',
        unexpectedError,
      );
      Alert.alert(
        '로그인 오류',
        '예상치 못한 오류가 발생했습니다. 네트워크 연결을 확인해주세요.',
      );
    } finally {
      setIsSubmitting(false);
      console.log(
        '[SignInScreen] handleSignIn finished, isSubmitting set to false',
      );
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <Text style={styles.title}>로그인</Text>

        <TextInput
          style={styles.input}
          placeholder="이메일 주소"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCompleteType="email" // RN 0.62 이상, 'email'로 변경
          textContentType="emailAddress" // iOS 자동완성
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCompleteType="password" // 'password'로 변경
          textContentType="password" // iOS 자동완성
        />

        {isSubmitting ? (
          <ActivityIndicator
            size="large"
            color="#3d5afe"
            style={styles.spinner}
          />
        ) : (
          <Button title="로그인" onPress={handleSignIn} color="#3d5afe" />
        )}

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('SignUp')}
        >
          <Text style={styles.linkText}>
            아직 회원이 아니신가요? 회원가입하기
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
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
    color: '#1e3a5f',
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
    height: 50, // 버튼의 대략적인 높이와 유사하게
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 0 : 0, // Button 컴포넌트와의 간격 통일성
  },
});

export default SignInScreen;
