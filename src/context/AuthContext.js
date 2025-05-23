import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

const USER_SESSION_KEY = 'supabaseUserSession';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // 전체 앱의 초기 로딩 상태

  useEffect(() => {
    let mounted = true;

    const fetchAndSetProfile = async (authUserId) => {
      if (!authUserId || !mounted) return;
      console.log('[AuthContext] Fetching profile for user:', authUserId);
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', authUserId)
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116: Row not found, 괜찮음
          console.error(
            '[AuthContext] Error fetching profile (non-PGRST116):',
            error.message,
          );
          throw error;
        }
        if (mounted) {
          console.log('[AuthContext] Profile fetched:', data);
          setProfile(data || null);
        }
      } catch (error) {
        console.error(
          '[AuthContext] Error in fetchAndSetProfile:',
          error.message,
        );
        if (mounted) {
          setProfile(null);
        }
      }
    };

    // 앱 시작 시 세션 복원 및 확인
    const initializeAuth = async () => {
      console.log('[AuthContext] initializeAuth started.');
      try {
        const storedSessionString =
          await AsyncStorage.getItem(USER_SESSION_KEY);
        if (storedSessionString) {
          const storedSession = JSON.parse(storedSessionString);
          if (storedSession?.access_token && storedSession?.refresh_token) {
            console.log('[AuthContext] Restoring session from AsyncStorage.');
            const { error: sessionSetError } = await supabase.auth.setSession({
              access_token: storedSession.access_token,
              refresh_token: storedSession.refresh_token,
            });
            if (sessionSetError) {
              console.warn(
                '[AuthContext] Failed to set session from storage, clearing:',
                sessionSetError.message,
              );
              await AsyncStorage.removeItem(USER_SESSION_KEY);
            }
          }
        }
      } catch (e) {
        console.error(
          '[AuthContext] AsyncStorage error during session load:',
          e,
        );
      }

      // setSession 후에도 getSession을 호출하여 현재 유효한 세션 확인
      const {
        data: { session },
        error: getSessionError,
      } = await supabase.auth.getSession();
      console.log(
        '[AuthContext] getSession result - session:',
        session,
        'error:',
        getSessionError,
      );

      if (getSessionError) {
        console.error(
          '[AuthContext] Error in getSession (in initializeAuth):',
          getSessionError.message,
        );
      }

      if (session?.user) {
        if (mounted) {
          setUser(session.user);
          await fetchAndSetProfile(session.user.id);
          // AsyncStorage 저장은 onAuthStateChange에서 처리하거나, 여기서도 중복으로 할 수 있음.
          // 일관성을 위해 onAuthStateChange에서 주로 처리.
        }
      } else {
        if (mounted) {
          setUser(null);
          setProfile(null);
          await AsyncStorage.removeItem(USER_SESSION_KEY);
        }
      }
      // 초기화 과정의 마지막에 isLoading을 false로 설정하는 것은 onAuthStateChange의 INITIAL_SESSION 이벤트에 맡김
      // 여기서 바로 false로 하면 INITIAL_SESSION 이벤트가 오기 전에 화면이 넘어갈 수 있음
      console.log(
        '[AuthContext] initializeAuth finished. Waiting for INITIAL_SESSION or other auth events.',
      );
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        console.log(
          `[AuthContext] onAuthStateChange: event='${event}'`,
          session,
        );

        // INITIAL_SESSION 이벤트는 앱 로드 시 한 번 발생
        if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            setUser(session.user);
            await fetchAndSetProfile(session.user.id);
            await AsyncStorage.setItem(
              USER_SESSION_KEY,
              JSON.stringify(session),
            );
          } else {
            setUser(null);
            setProfile(null);
            await AsyncStorage.removeItem(USER_SESSION_KEY);
          }
          setIsLoading(false); // INITIAL_SESSION 처리 후 로딩 완료
        } else if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          await fetchAndSetProfile(session.user.id);
          await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
          setIsLoading(false); // 로그인 완료 후 로딩 상태 해제
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          await AsyncStorage.removeItem(USER_SESSION_KEY);
          setIsLoading(false); // 로그아웃 완료 후 로딩 상태 해제
        } else if (event === 'TOKEN_REFRESHED' && session) {
          setUser(session.user); // 사용자 정보가 변경되었을 수 있음
          await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
        } else if (event === 'USER_UPDATED' && session?.user) {
          setUser(session.user);
          await fetchAndSetProfile(session.user.id); // 프로필 정보 갱신
        }
      },
    );

    return () => {
      mounted = false;
      console.log('[AuthContext] Unsubscribing auth listener.');
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const signUpWithEmail = async (email, password, additionalData) => {
    console.log('[AuthContext] Attempting signUpWithEmail for:', email);
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        {
          email,
          password,
        },
      );

      if (signUpError) throw signUpError;
      if (!authData.user)
        throw new Error('User not created in Supabase Auth during signup.');

      console.log(
        '[AuthContext] User signed up in Auth, user ID:',
        authData.user.id,
      );
      const { name, phoneNumber, nationalId, jobType } = additionalData;
      const { error: profileError } = await supabase.from('users').insert({
        auth_user_id: authData.user.id,
        name,
        phone_number: phoneNumber,
        national_id: nationalId,
        job_type: jobType,
      });

      if (profileError) {
        console.error(
          '[AuthContext] Failed to save profile during signup:',
          profileError,
        );
        // 롤백 로직 (프로덕션에서는 중요): 생성된 auth 사용자 삭제
        // const { error: deleteUserError } = await supabase.auth.admin.deleteUser(authData.user.id);
        // if (deleteUserError) console.error('[AuthContext] Failed to delete auth user after profile error:', deleteUserError.message);
        throw profileError;
      }
      console.log('[AuthContext] Profile saved for new user.');
      // onAuthStateChange가 SIGNED_IN 이벤트 처리
      return { success: true, user: authData.user };
    } catch (error) {
      console.error('[AuthContext] signUpWithEmail failed:', error);
      Alert.alert(
        '회원가입 실패',
        error.message || '알 수 없는 오류가 발생했습니다.',
      );
      return { success: false, error };
    }
  };

  const signInWithEmail = async (email, password) => {
    console.log('[AuthContext] Attempting signInWithEmail for:', email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      console.log(
        '[AuthContext] signInWithPassword response - data:',
        data,
        'error:',
        error,
      );

      if (error) throw error;
      if (!data.user)
        throw new Error('Login failed, user data not returned from Supabase.');

      // 성공 시 onAuthStateChange가 SIGNED_IN 이벤트 처리.
      // 해당 리스너에서 setUser, setProfile, AsyncStorage 저장 및 setIsLoading(false) 처리.
      return { success: true, user: data.user };
    } catch (error) {
      console.error('[AuthContext] signInWithEmail failed:', error);
      // Alert.alert('로그인 실패', error.message || '이메일 또는 비밀번호를 확인해주세요.'); // SignInScreen에서 처리하는게 나을수도
      return { success: false, error }; // 에러 객체를 반환하여 호출부에서 처리
    }
  };

  const signOutUser = async () => {
    console.log('[AuthContext] Attempting signOutUser.');
    // setIsLoading(true); // 로그아웃 시작 시 로딩 (선택적, 화면에서 isSubmitting 등으로 관리)
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[AuthContext] signOutUser failed:', error);
      Alert.alert('로그아웃 실패', error.message);
    } else {
      console.log('[AuthContext] signOutUser successful.');
    }
    // onAuthStateChange가 SIGNED_OUT 이벤트 처리 및 setIsLoading(false) 호출
    // setIsLoading(false); // 여기서 호출하면 onAuthStateChange보다 빠를 수 있음. 리스너에 위임.
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
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
