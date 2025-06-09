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
import { useAuth } from "../context/AuthContext";

function UpdatePasswordScreen({ navigation }) {
  const { user, supabase } = useAuth(); // AuthContext에서 Supabase 클라이언트 직접 가져오기
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdatePassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert("입력 오류", "새 비밀번호와 확인을 모두 입력해주세요.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("입력 오류", "비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("입력 오류", "비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setIsLoading(true);
    // Supabase는 딥링크를 통해 앱에 접속하면 자동으로 세션을 복구합니다.
    // 이 상태에서 updateUser를 호출하면 됩니다.
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (error) {
      Alert.alert("업데이트 실패", error.message);
    } else {
      Alert.alert(
        "성공",
        "비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요.",
        [{ text: "확인", onPress: () => navigation.navigate("SignIn") }],
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>새 비밀번호 설정</Text>
      <TextInput
        style={styles.input}
        placeholder="새 비밀번호 (6자 이상)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="새 비밀번호 확인"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      {isLoading ? (
        <ActivityIndicator size="large" color="#3d5afe" />
      ) : (
        <Button
          title="비밀번호 변경"
          onPress={handleUpdatePassword}
          color="#3d5afe"
        />
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
});

export default UpdatePasswordScreen;
