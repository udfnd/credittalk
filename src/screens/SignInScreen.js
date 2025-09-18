// src/screens/SignInScreen.js

import React, { useState } from 'react';
import {
  View,
  TextInput,
  Button,
  Text,
  Alert,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform, // ✅ Platform 추가
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import NaverLogin from '@react-native-seoul/naver-login';
import { login } from '@react-native-seoul/kakao-login';
// ✅ Apple 로그인 관련 모듈 추가
import {
  appleAuth,
  AppleButton,
} from '@invertase/react-native-apple-authentication';

const naverLogo = require('../assets/images/naver_logo.png');
const kakaoLogo = require('../assets/images/kakao_logo.png');

function SignInScreen() {
  // ✅ signInWithApple 함수 가져오기
  const { signInWithEmail, isLoading, signInWithApple } = useAuth();
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [socialLoading, setSocialLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }
    await signInWithEmail(email, password);
  };

  // ✅ Apple 로그인 핸들러 추가
  const handleAppleLogin = async () => {
    setSocialLoading(true);
    try {
      const appleAuthRequestResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });

      // ✅ nonce 값을 응답에서 추출합니다.
      const { identityToken, nonce } = appleAuthRequestResponse;

      if (identityToken) {
        // ✅ signInWithApple 함수에 identityToken과 nonce를 함께 전달합니다.
        await signInWithApple(identityToken, nonce);
      } else {
        Alert.alert('Apple 로그인 오류', '인증 토큰을 받지 못했습니다.');
      }
    } catch (error) {
      if (error.code !== '1001') {
        // 1001: 사용자가 취소한 경우
        console.error('Apple 로그인 중 오류 발생:', error);
        Alert.alert(
          'Apple 로그인 오류',
          '로그인에 실패했습니다. 다시 시도해주세요.',
        );
      }
    } finally {
      setSocialLoading(false);
    }
  };

  const handleSocialLogin = async provider => {
    setSocialLoading(true);
    try {
      if (provider === 'naver') {
        const result = await NaverLogin.login();
        if (result?.isSuccess) {
          const naverToken = result.successResponse.accessToken;
          const { data: session, error: fnError } =
            await supabase.functions.invoke('sign-in-with-naver', {
              body: { naver_token: naverToken },
            });
          if (fnError) throw fnError;
          if (session.error) throw new Error(session.error);

          const { error: sessionError } = await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
          if (sessionError) throw sessionError;
        } else if (result.errCode !== 'user_cancel') {
          const msg = `[${result.errCode || 'UNKNOWN'}]\n${result.errDesc || '네이버 로그인 실패'}`;
          Alert.alert('네이버 로그인 실패', msg);
        }
      } else if (provider === 'kakao') {
        const result = await login();
        if (result.idToken) {
          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'kakao',
            token: result.idToken,
          });
          if (error) throw error;
        }
      }
    } catch (error) {
      if (
        error.code !== 'E_CANCELLED_OPERATION' &&
        !error.message.includes('cancel')
      ) {
        const msg = `[${error.code || 'EXCEPTION'}]\n${error.message || '알 수 없는 오류'}`;
        console.error(`${provider} 로그인 오류:`, error);
        Alert.alert(
          provider === 'naver' ? '네이버 로그인 오류' : '카카오 로그인 오류',
          msg,
        );
      }
    } finally {
      setSocialLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>크레딧톡</Text>
      <TextInput
        style={styles.input}
        placeholder="이메일 주소"
        placeholderTextColor="#6c757d"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="비밀번호"
        placeholderTextColor="#6c757d"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      {isLoading || socialLoading ? (
        <ActivityIndicator
          style={{ marginVertical: 10 }}
          size="large"
          color="#3d5afe"
        />
      ) : (
        <>
          <View style={{ marginBottom: 10 }}>
            <Button title="로그인" onPress={handleSignIn} color="#3d5afe" />
          </View>

          {Platform.OS === 'ios' && (
            <AppleButton
              buttonStyle={AppleButton.Style.BLACK}
              buttonType={AppleButton.Type.SIGN_IN}
              style={styles.socialButton}
              onPress={handleAppleLogin}
            />
          )}

          <TouchableOpacity
            style={[styles.socialButton, styles.kakaoButton]}
            onPress={() => handleSocialLogin('kakao')}>
            <Image source={kakaoLogo} style={styles.socialIcon} />
            <Text style={styles.kakaoButtonText}>카카오 로그인</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.socialButton, styles.naverButton]}
            onPress={() => handleSocialLogin('naver')}>
            <Image source={naverLogo} style={styles.socialIcon} />
            <Text style={styles.naverButtonText}>네이버 로그인</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.linksContainer}>
        <TouchableOpacity onPress={() => navigation.navigate('FindEmail')}>
          <Text style={styles.linkText}>아이디 찾기</Text>
        </TouchableOpacity>
        <Text style={styles.separator}>|</Text>
        <TouchableOpacity onPress={() => navigation.navigate('ResetPassword')}>
          <Text style={styles.linkText}>비밀번호 찾기</Text>
        </TouchableOpacity>
        <Text style={styles.separator}>|</Text>
        <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.linkText}>회원가입</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ... styles는 기존과 동일 ...
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
    color: '#1e3a5f',
  },
  input: {
    height: 50,
    borderColor: '#ced4da',
    borderWidth: 1,
    marginBottom: 15,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: 'white',
    fontSize: 16,
    color: '#000',
  },
  linksContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  linkText: {
    color: '#495057',
    fontSize: 14,
  },
  separator: {
    color: '#ced4da',
    marginHorizontal: 10,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 8,
    marginBottom: 10,
  },
  kakaoButton: {
    backgroundColor: '#FEE500',
  },
  naverButton: {
    backgroundColor: '#03C75A',
  },
  socialIcon: {
    width: 24,
    height: 24,
    marginRight: 10,
  },
  kakaoButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  naverButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SignInScreen;
