import React, { createContext, useState, useEffect, useContext } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 이 useEffect는 오직 인증 상태(세션, 사용자)만을 담당합니다.
  useEffect(() => {
    // 앱 시작 시, 현재 세션을 가져와 초기 user 상태를 설정합니다.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      // 초기 세션 확인이 끝나면 로딩 상태를 해제합니다.
      setIsLoading(false);
    });

    // 로그인, 로그아웃 등 인증 상태 변경을 감지합니다.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // 이 useEffect는 user 상태가 변경될 때만 실행되어 프로필을 관리합니다.
  useEffect(() => {
    // 로그아웃 등으로 user가 없어지면 profile도 null로 설정합니다.
    if (!user) {
      setProfile(null);
      return;
    }

    // 사용자는 있지만 프로필 정보가 아직 로드되지 않았을 경우에만 DB에서 조회합니다.
    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("auth_user_id", user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }
        // 프로필이 있으면 설정하고, 없으면 null로 유지합니다. (AdditionalInfoScreen으로 유도)
        setProfile(data || null);
      } catch (e) {
        console.error("Error fetching profile:", e.message);
        setProfile(null);
      }
    };

    fetchProfile();
  }, [user]); // user 객체가 변경될 때만 이 로직이 실행됩니다.

  const value = {
    user,
    profile,
    isLoading,
    setProfile, // AdditionalInfoScreen에서 프로필을 직접 설정하기 위해 전달합니다.
    supabase,
    signInWithEmail: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) Alert.alert("로그인 실패", error.message);
      return { data, error };
    },
    signOutUser: () => {
      // 로그아웃 시 상태를 즉시 초기화하여 빠른 UI 반응을 유도합니다.
      setProfile(null);
      setUser(null);
      supabase.auth.signOut();
    },
    signUpWithEmail: async (email, password, additionalData) => {
      try {
        const { data: authData, error: signUpError } =
          await supabase.auth.signUp({ email, password });
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
        Alert.alert(
          "회원가입 요청됨",
          "가입 확인을 위해 이메일을 확인해주세요.",
        );
        return { success: true, user: authData.user };
      } catch (error) {
        Alert.alert(
          "회원가입 실패",
          error.message || "알 수 없는 오류가 발생했습니다.",
        );
        return { success: false, error };
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
