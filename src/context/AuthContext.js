import React, { createContext, useState, useEffect, useContext } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 프로필 정보를 가져오는 함수. 이전과 동일.
  const fetchAndSetProfile = async (authUserId) => {
    if (!authUserId) {
      setProfile(null);
      return false;
    }
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("auth_user_id", authUserId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }
      setProfile(data || null);
      return !!data;
    } catch (e) {
      console.error("Error fetching profile:", e.message);
      setProfile(null);
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;

    // --- START: 수정된 부분 ---

    // 1. 앱 시작 시 실행되는 초기 세션 및 프로필 로드 로직
    const loadInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (mounted) {
          const currentUser = session?.user ?? null;
          setUser(currentUser);
          if (currentUser) {
            await fetchAndSetProfile(currentUser.id);
          }
        }
      } catch (e) {
        console.error("Error loading initial session:", e.message);
        // 오류 발생 시에도 사용자 상태는 null로 유지
        setUser(null);
        setProfile(null);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadInitialSession();

    // 2. 인증 상태 변경을 감지하는 리스너 로직 (더욱 견고하게 수정)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;

        setIsLoading(true); // 상태 변경 시작 시 로딩

        const currentUser = session?.user ?? null;
        setUser(currentUser);

        // 사용자가 있으면 프로필을 가져오고, 없으면 null로 설정
        if (currentUser) {
          await fetchAndSetProfile(currentUser.id);
        } else {
          setProfile(null);
        }

        setIsLoading(false); // 모든 작업 완료 후 로딩 종료
      },
    );

    // --- END: 수정된 부분 ---

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // 이메일 로그인 함수: 여기서 더 이상 setIsLoading을 호출하지 않음
  const signInWithEmail = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (!data.user) throw new Error("Login failed, user data not returned.");
      // 성공 시 onAuthStateChange 리스너가 모든 상태 업데이트를 처리
      return { success: true, user: data.user };
    } catch (error) {
      Alert.alert(
        "로그인 실패",
        error.message || "이메일 또는 비밀번호를 확인해주세요.",
      );
      return { success: false, error };
    }
  };

  // 로그아웃 함수: 여기서 더 이상 setIsLoading을 호출하지 않음
  const signOutUser = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("로그아웃 실패", error.message);
    }
    // 성공/실패 여부와 관계없이 onAuthStateChange 리스너가 상태를 처리
  };

  // signUpWithEmail 함수는 클라이언트 상태를 직접 바꾸지 않으므로 수정 불필요
  const signUpWithEmail = async (email, password, additionalData) => {
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        { email, password },
      );
      if (signUpError) throw signUpError;
      if (!authData.user)
        throw new Error("User not created in Supabase Auth during signup.");

      const { name, phoneNumber, nationalId, jobType } = additionalData;
      const { error: profileError } = await supabase.from("users").insert({
        auth_user_id: authData.user.id,
        name,
        phone_number: phoneNumber,
        national_id: nationalId,
        job_type: jobType,
      });
      if (profileError) {
        throw profileError;
      }
      Alert.alert("회원가입 요청됨", "가입 확인을 위해 이메일을 확인해주세요.");
      return { success: true, user: authData.user };
    } catch (error) {
      Alert.alert(
        "회원가입 실패",
        error.message || "알 수 없는 오류가 발생했습니다.",
      );
      return { success: false, error };
    }
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
        supabase,
        fetchAndSetProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
