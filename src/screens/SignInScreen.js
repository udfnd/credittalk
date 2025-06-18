// src/screens/SignInScreen.js
import React, { useState } from "react";
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
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../lib/supabaseClient";
import NaverLogin from "@react-native-seoul/naver-login";
import { login } from "@react-native-seoul/kakao-login";

const naverLogo = require("../assets/images/naver_logo.png"); // 네이버 로고 이미지 경로
const kakaoLogo = require("../assets/images/kakao_logo.png"); // 카카오 로고 이미지 경로

function SignInScreen() {
  const { signInWithEmail, isLoading } = useAuth();
  const navigation = useNavigation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [socialLoading, setSocialLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("입력 오류", "이메일과 비밀번호를 모두 입력해주세요.");
      return;
    }
    await signInWithEmail(email, password);
  };

  const handleSocialLogin = async (provider) => {
    setSocialLoading(true);
    try {
      let token;
      if (provider === "naver") {
        const result = await NaverLogin.login({
          appName: "크레디톡",
          consumerKey: "YOUR_NAVER_CLIENT_ID",
          consumerSecret: "YOUR_NAVER_CLIENT_SECRET",
          serviceUrlScheme: "naver-YOUR_NAVER_CLIENT_ID", // iOS 설정
        });
        if (!result?.success) throw new Error("네이버 로그인에 실패했습니다.");
        token = result.successResponse.accessToken;
      } else if (provider === "kakao") {
        const result = await login();
        token = result.idToken; // Supabase는 idToken을 사용합니다.
      }

      if (!token) throw new Error(`${provider} 토큰을 가져오지 못했습니다.`);

      const { error } = await supabase.auth.signInWithIdToken({
        provider,
        token,
      });

      if (error) throw error;
      // AuthProvider의 onAuthStateChange가 후속 처리를 담당합니다.
    } catch (error) {
      if (error.code !== "E_CANCELLED_OPERATION") {
        Alert.alert(
          `${provider === "naver" ? "네이버" : "카카오"} 로그인 실패`,
          error.message,
        );
      }
    } finally {
      setSocialLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CreditTalk</Text>

      <TextInput
        style={styles.input}
        placeholder="이메일 주소"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="비밀번호"
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
          <TouchableOpacity
            style={[styles.socialButton, styles.kakaoButton]}
            onPress={() => handleSocialLogin("kakao")}
          >
            <Image source={kakaoLogo} style={styles.socialIcon} />
            <Text style={styles.kakaoButtonText}>카카오 로그인</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.socialButton, styles.naverButton]}
            onPress={() => handleSocialLogin("naver")}
          >
            <Image source={naverLogo} style={styles.socialIcon} />
            <Text style={styles.naverButtonText}>네이버 로그인</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.linksContainer}>
        <TouchableOpacity onPress={() => navigation.navigate("FindEmail")}>
          <Text style={styles.linkText}>아이디 찾기</Text>
        </TouchableOpacity>
        <Text style={styles.separator}>|</Text>
        <TouchableOpacity onPress={() => navigation.navigate("ResetPassword")}>
          <Text style={styles.linkText}>비밀번호 찾기</Text>
        </TouchableOpacity>
        <Text style={styles.separator}>|</Text>
        <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
          <Text style={styles.linkText}>회원가입</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f8f9fa",
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 40,
    color: "#1e3a5f",
  },
  input: {
    height: 50,
    borderColor: "#ced4da",
    borderWidth: 1,
    marginBottom: 15,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: "white",
    fontSize: 16,
  },
  linksContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  linkText: {
    color: "#495057",
    fontSize: 14,
  },
  separator: {
    color: "#ced4da",
    marginHorizontal: 10,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 8,
    marginBottom: 10,
  },
  kakaoButton: {
    backgroundColor: "#FEE500",
  },
  naverButton: {
    backgroundColor: "#03C75A",
  },
  socialIcon: {
    width: 24,
    height: 24,
    marginRight: 10,
  },
  kakaoButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
  naverButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default SignInScreen;
