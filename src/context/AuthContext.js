// src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabaseClient"; // supabaseClient에서 직접 import

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
    if (!user) {
      setProfile(null);
      return;
    }

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
        setProfile(data || null);
      } catch (e) {
        console.error("Error fetching profile:", e.message);
        Alert.alert("프로필 정보 로딩 실패", "프로필 정보를 불러오는 중 문제가 발생했습니다.");
        setProfile(null);
      }
    };

    fetchProfile();
  }, [user]);

  const value = {
    user,
    profile,
    isLoading,
    setProfile,
    // --- (핵심 수정 부분) ---
    // supabase 클라이언트를 value 객체에 포함시켜 자식 컴포넌트에 전달합니다.
    supabase,
    signInWithEmail: (email, password) => {
      return supabase.auth.signInWithPassword({ email, password });
    },
    signOutUser: () => {
      supabase.auth.signOut();
    },
    signUpWithEmail: async (email, password, additionalData) => {
      try {
        const { data: authData, error: signUpError } =
          await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!authData.user)
          throw new Error("User not created in Supabase Auth during signup.");

        const { error: profileError } = await supabase.from("users").insert({
          auth_user_id: authData.user.id,
          ...additionalData,
        });

        if (profileError) throw profileError;

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

  return <AuthContext.Provider value={value}>{!isLoading && children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
