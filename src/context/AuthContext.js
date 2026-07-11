// src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import {
  login as kakaoLogin,
  logout as kakaoLogout,
} from '@react-native-seoul/kakao-login';
import { NaverLogin } from '@react-native-seoul/naver-login';
import { appleAuth } from '@invertase/react-native-apple-authentication'; // ✅ Apple Auth 추가

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      return;
    }

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }
        setProfile(data || null);
      } catch (e) {
        console.error('Error fetching profile:', e.message);
        // 일시적(네트워크 등) 조회 실패로 profile을 null로 만들면 RootStack이
        // MainApp 브랜치를 unmount→remount 하며 열린 화면이 홈으로 되감긴다.
        // (푸시 탭 직후 토큰 리프레시와 겹치면 "탭 → 홈" 간헐 버그로 나타남)
        // 기존 profile을 유지하고 다음 auth 이벤트에서 재조회에 맡긴다.
      }
    };

    fetchProfile();
    // user 객체는 TOKEN_REFRESHED 등 모든 auth 이벤트마다 새 참조가 되므로
    // id 기준으로만 재조회한다(리프레시마다 재조회 → 일시 실패 → 홈 되감김 방지).
  }, [user?.id]);

  // ✅ Apple 로그인 함수 추가
  const signInWithApple = async (identityToken, nonce) => {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: nonce, // ✅ nonce 값을 함께 전달합니다.
    });

    if (error) {
      Alert.alert('Apple 로그인 오류', error.message);
      console.error('Supabase Apple sign in error:', error);
    }
    // 성공 시 onAuthStateChange 리스너가 user, profile 상태를 업데이트합니다.
  };

  const deleteUserAccount = async () => {
    try {
      const { error } = await supabase.functions.invoke('delete-user');
      if (error) throw error;

      Alert.alert('성공', '계정이 성공적으로 삭제되었습니다.');
      // supabase.auth.signOut()은 onAuthStateChange 리스너를 트리거하여
      // 자동으로 로그아웃 상태로 전환합니다.
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error deleting account:', error);
      Alert.alert(
        '오류',
        '계정 삭제 중 문제가 발생했습니다. 다시 시도해주세요.',
      );
    }
  };

  const value = {
    user,
    profile,
    isLoading,
    setProfile,
    supabase,
    signInWithEmail: (email, password) => {
      return supabase.auth.signInWithPassword({ email, password });
    },
    signOutUser: async () => {
      await supabase.auth.signOut();
      try {
        await kakaoLogout();
      } catch (e) {}
      try {
        await NaverLogin.logout();
      } catch (e) {}
      try {
        if (appleAuth.isSupported) {
          await appleAuth.performRequest({
            requestedOperation: appleAuth.Operation.LOGOUT,
          });
        }
      } catch (e) {}
    },
    signUpWithEmail: async (email, password, additionalData) => {
      try {
        const { data: authData, error: signUpError } =
          await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!authData.user)
          throw new Error('User not created in Supabase Auth during signup.');

        const { error: profileError } = await supabase.from('users').insert({
          auth_user_id: authData.user.id,
          ...additionalData,
        });

        if (profileError) throw profileError;

        Alert.alert(
          '회원가입 요청됨',
          '가입 확인을 위해 이메일을 확인해주세요.',
        );
        return { success: true, user: authData.user };
      } catch (error) {
        Alert.alert(
          '회원가입 실패',
          error.message || '알 수 없는 오류가 발생했습니다.',
        );
        return { success: false, error };
      }
    },
    // ✅ Apple 로그인 함수를 value에 추가
    signInWithApple,
    deleteUserAccount,
  };

  return (
    <AuthContext.Provider value={value}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
