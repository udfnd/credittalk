// src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabaseClient'; // AsyncStorage 설정된 클라이언트

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    const fetchAndSetProfile = async (authUserId) => {
      if (!authUserId || !mounted) {
        if (mounted) setProfile(null);
        return false;
      }
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', authUserId)
          .single();

        if (error && error.code !== 'PGRST116') {
          if (mounted) setProfile(null);
          return false;
        }
        if (mounted) {
          setProfile(data || null);
          return !!data;
        }
      } catch (e) {
        if (mounted) setProfile(null);
        return false;
      }
      return false;
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            setUser(session.user);
            await fetchAndSetProfile(session.user.id);
          } else {
            setUser(null);
            setProfile(null);
          }
          if (mounted) setIsLoading(false);
        } else if (event === 'SIGNED_IN' && session?.user) {
          if (mounted) setIsLoading(true);
          setUser(session.user);
          await fetchAndSetProfile(session.user.id);
          if (mounted) setIsLoading(false);
        } else if (event === 'SIGNED_OUT') {
          if (mounted) setIsLoading(true);
          setUser(null);
          setProfile(null);
          if (mounted) setIsLoading(false);
        } else if (
          (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
          session?.user
        ) {
          setUser(session.user);
          await fetchAndSetProfile(session.user.id);
        }
      },
    );

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const signUpWithEmail = async (email, password, additionalData) => {
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        { email, password },
      );
      if (signUpError) throw signUpError;
      if (!authData.user)
        throw new Error('User not created in Supabase Auth during signup.');

      const { name, phoneNumber, nationalId, jobType } = additionalData;
      const { error: profileError } = await supabase.from('users').insert({
        auth_user_id: authData.user.id,
        name,
        phone_number: phoneNumber,
        national_id: nationalId,
        job_type: jobType,
      });
      if (profileError) {
        throw profileError;
      }
      Alert.alert('회원가입 요청됨', '가입 확인을 위해 이메일을 확인해주세요.');
      return { success: true, user: authData.user };
    } catch (error) {
      Alert.alert(
        '회원가입 실패',
        error.message || '알 수 없는 오류가 발생했습니다.',
      );
      return { success: false, error };
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
      // onAuthStateChange가 setIsLoading(false)를 처리합니다.
      return { success: true, user: data.user };
    } catch (error) {
      setIsLoading(false);
      Alert.alert(
        '로그인 실패',
        error.message || '이메일 또는 비밀번호를 확인해주세요.',
      );
      return { success: false, error };
    }
  };

  const signOutUser = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('로그아웃 실패', error.message);
      setIsLoading(false);
    }
    // onAuthStateChange가 setIsLoading(false)를 처리합니다.
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
