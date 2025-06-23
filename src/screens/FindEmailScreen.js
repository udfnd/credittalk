import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../lib/supabaseClient";

function FindEmailScreen({ navigation }) {
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleFindEmail = async () => {
    if (!name.trim() || !phoneNumber.trim()) {
      Alert.alert("입력 오류", "이름과 휴대폰 번호를 모두 입력해주세요.");
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "find-email-by-profile",
        { body: { name: name.trim(), phoneNumber: phoneNumber.trim() } },
      );

      if (error) {
        if (error.context?.status === 404) {
          Alert.alert("조회 실패", "일치하는 사용자 정보가 없습니다.");
        } else {
          throw new Error(error.message);
        }
      } else if (data.email) {
        Alert.alert(
          "아이디(이메일) 찾기 성공",
          `회원님의 아이디는 ${data.email} 입니다.`,
        );
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert(
        "오류 발생",
        err.message || "아이디를 찾는 중 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>아이디(이메일) 찾기</Text>

      {/* 이름 입력 */}
      <TextInput
        style={styles.input}
        placeholder="이름"
        placeholderTextColor="#6c757d"
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
      />

      {/* 휴대폰 번호 입력 */}
      <TextInput
        style={styles.input}
        placeholder="휴대폰 번호 (- 제외)"
        placeholderTextColor="#6c757d"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType="number-pad"
      />

      {/* 버튼 또는 로딩 */}
      {isLoading ? (
        <ActivityIndicator size="large" color="#3d5afe" />
      ) : (
        <Button title="아이디 찾기" onPress={handleFindEmail} color="#3d5afe" />
      )}
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
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
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
    color: "#000",
  },
});

export default FindEmailScreen;
