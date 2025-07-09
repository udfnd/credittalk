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

    // 로그인, 로그아웃 등 인증 상태 변경을 감지하는 리스너입니다.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // onAuthStateChange가 호출되면 user 상태가 업데이트되고,
      // 아래에 있는 프로필을 가져오는 useEffect가 자동으로 실행됩니다.
      setUser(session?.user ?? null);
    });

    // 컴포넌트가 언마운트될 때 리스너를 정리합니다.
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // 이 useEffect는 user 상태가 변경될 때만 실행되어 프로필 정보를 관리합니다.
  useEffect(() => {
    // 로그아웃 등으로 user가 없어지면 profile도 null로 설정하고 종료합니다.
    if (!user) {
      setProfile(null);
      return;
    }

    // 사용자는 있지만 프로필 정보가 아직 없을 경우 DB에서 조회합니다.
    const fetchProfile = async () => {
      try {
        // select("*")는 id, nickname을 포함한 모든 프로필 정보를 가져옵니다.
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("auth_user_id", user.id)
          .single();

        // PGRST116: 'exact-one' (single) 쿼리에서 결과가 0개일 때 발생하는 정상적인 오류 코드입니다.
        // 예를 들어, 회원가입 직후 아직 프로필이 생성되지 않았을 때 발생합니다.
        if (error && error.code !== "PGRST116") {
          throw error;
        }

        // 조회된 프로필이 있으면 상태를 업데이트합니다.
        setProfile(data || null);

      } catch (e) {
        // 실제 네트워크 오류 등이 발생했을 경우
        console.error("Error fetching profile:", e.message);
        Alert.alert("프로필 정보 로딩 실패", "프로필 정보를 불러오는 중 문제가 발생했습니다.");
        setProfile(null);
      }
    };

    fetchProfile();
  }, [user]); // 오직 user 객체가 변경될 때만 이 로직이 실행됩니다.

  const value = {
    user,
    profile,
    isLoading,
    setProfile, // 사용자가 추가 정보를 입력했을 때 프로필을 수동으로 업데이트하기 위해 전달합니다.
    signInWithEmail: (email, password) => {
      // signInWithPassword는 onAuthStateChange를 트리거하므로,
      // 프로필 로딩은 위의 useEffect에서 자동으로 처리됩니다.
      return supabase.auth.signInWithPassword({ email, password });
    },
    signOutUser: () => {
      // signOut 역시 onAuthStateChange를 트리거하여 user와 profile 상태를 자동으로 null로 만듭니다.
      // 따라서 여기서는 signOut()만 호출하는 것이 가장 깔끔합니다.
      supabase.auth.signOut();
    },
    signUpWithEmail: async (email, password, additionalData) => {
      try {
        const { data: authData, error: signUpError } =
          await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!authData.user)
          throw new Error("User not created in Supabase Auth during signup.");

        // 추가 정보와 함께 users 테이블에 프로필 데이터를 생성합니다.
        const { error: profileError } = await supabase.from("users").insert({
          auth_user_id: authData.user.id,
          ...additionalData, // name, nickname, job_type 등 추가 정보를 여기에 포함
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
