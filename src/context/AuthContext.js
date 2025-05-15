import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

const USER_SESSION_KEY = 'supabaseUserSession'; // AsyncStorage 키

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Supabase Auth User 객체
  const [profile, setProfile] = useState(null); // public.users 테이블의 프로필 정보
  const [isLoading, setIsLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      // 1. AsyncStorage에서 세션 로드 시도 (앱 재시작 시 초기 로딩 속도 개선 목적)
      try {
        const storedSessionString =
          await AsyncStorage.getItem(USER_SESSION_KEY);
        if (storedSessionString) {
          const storedSession = JSON.parse(storedSessionString);
          if (storedSession?.user) {
            // 세션 복원 시도
            const { error: sessionError } =
              await supabase.auth.setSession(storedSession);
            if (sessionError) {
              console.warn(
                'Failed to set session from storage, clearing:',
                sessionError.message,
              );
              await AsyncStorage.removeItem(USER_SESSION_KEY); // 유효하지 않은 세션 제거
            }
          }
        }
      } catch (e) {
        console.error('AsyncStorage error during session load:', e);
      }

      // 2. Supabase의 현재 세션 가져오기
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Error getting session:', sessionError.message);
        setIsLoading(false);
        setAuthInitialized(true);
        return;
      }

      if (session?.user) {
        setUser(session.user);
        await fetchAndSetProfile(session.user.id);
        await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
      }
      setIsLoading(false);
      setAuthInitialized(true);
    };

    initializeAuth();

    // 3. Auth 상태 변경 리스너 설정
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setIsLoading(true);
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          await fetchAndSetProfile(session.user.id);
          await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          await AsyncStorage.removeItem(USER_SESSION_KEY);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // 토큰 갱신 시 AsyncStorage에도 업데이트
          await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
          setUser(session.user); // 사용자 정보도 갱신될 수 있으므로
        } else if (event === 'USER_UPDATED' && session?.user) {
          setUser(session.user);
          // 필요시 프로필도 다시 fetch
        }
        setIsLoading(false);
      },
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const fetchAndSetProfile = async (authUserId) => {
    if (!authUserId) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116: Row not found
        throw error;
      }
      setProfile(data || null);
    } catch (error) {
      console.error('Error fetching profile:', error.message);
      setProfile(null); // 프로필 조회 실패 시 null 처리
    }
  };

  const signUpWithEmail = async (email, password, additionalData) => {
    setIsLoading(true);
    try {
      // 1. Supabase Auth로 사용자 생성
      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        {
          email,
          password,
        },
      );

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('User not created in Supabase Auth.');

      // 2. public.users 테이블에 추가 정보 저장
      const { name, phoneNumber, nationalId, jobType } = additionalData;
      const { error: profileError } = await supabase.from('users').insert({
        auth_user_id: authData.user.id, // Supabase Auth 사용자의 ID 연결
        name,
        phone_number: phoneNumber,
        national_id: nationalId,
        job_type: jobType,
      });

      if (profileError) {
        // 프로필 저장 실패 시 Auth 사용자 롤백 (선택적: 또는 관리자에게 알림)
        console.error(
          'Failed to save profile, attempting to delete auth user:',
          profileError,
        );
        // await supabase.auth.admin.deleteUser(authData.user.id); // Admin API 필요
        throw profileError;
      }

      // onAuthStateChange가 Signed_IN 이벤트를 처리하므로 여기서 setUser/setProfile 호출 불필요.
      // Alert.alert('회원가입 성공', '가입이 완료되었습니다. 자동으로 로그인됩니다.');
      return { success: true, user: authData.user };
    } catch (error) {
      console.error('Sign up failed:', error);
      Alert.alert(
        '회원가입 실패',
        error.message || '알 수 없는 오류가 발생했습니다.',
      );
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithEmail = async (email, password) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error('Login failed, user data not returned.');

      // onAuthStateChange가 Signed_IN 이벤트를 처리.
      // Alert.alert('로그인 성공', `${data.user.email}님, 환영합니다!`);
      return { success: true, user: data.user };
    } catch (error) {
      console.error('Sign in failed:', error);
      Alert.alert(
        '로그인 실패',
        error.message || '이메일 또는 비밀번호를 확인해주세요.',
      );
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  const signOutUser = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('로그아웃 실패', error.message);
    }
    // onAuthStateChange가 SIGNED_OUT 이벤트를 처리.
    setIsLoading(false);
  };

  // authInitialized 상태를 추가하여 초기 로딩과 실제 유저 상태 로딩을 구분
  const contextIsLoading = isLoading || !authInitialized;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading: contextIsLoading,
        signInWithEmail,
        signOutUser,
        signUpWithEmail,
      }}
    >
      {children}
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
