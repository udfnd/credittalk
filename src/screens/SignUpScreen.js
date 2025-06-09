import React, { useState } from "react";
import {
  View,
  TextInput,
  Button,
  Text,
  Alert,
  StyleSheet,
  Keyboard,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

const jobTypes = ["일반", "사업자"];

function SignUpScreen() {
  const navigation = useNavigation();
  const { signUpWithEmail, isLoading: authIsLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [jobType, setJobType] = useState("일반");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 이메일 중복 확인 관련 상태
  const [isEmailChecking, setIsEmailChecking] = useState(false);
  const [isEmailAvailable, setIsEmailAvailable] = useState(null);
  const [emailMessage, setEmailMessage] = useState("");

  const validateEmailFormat = (text) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);

  const handleEmailChange = (text) => {
    setEmail(text);
    // 이메일이 변경되면 중복 확인 상태 초기화
    if (isEmailAvailable !== null) {
      setIsEmailAvailable(null);
      setEmailMessage("");
    }
  };

  const handleCheckEmail = async () => {
    Keyboard.dismiss();
    if (!validateEmailFormat(email)) {
      Alert.alert("입력 오류", "올바른 이메일 형식이 아닙니다.");
      return;
    }

    setIsEmailChecking(true);
    setEmailMessage("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "check-email-availability",
        {
          body: { email: email.trim() },
        },
      );

      if (error) throw error;

      if (data.available) {
        setIsEmailAvailable(true);
        setEmailMessage("사용 가능한 이메일입니다.");
      } else {
        setIsEmailAvailable(false);
        setEmailMessage("이미 사용 중인 이메일입니다.");
      }
    } catch (err) {
      setIsEmailAvailable(null);
      setEmailMessage("확인 중 오류가 발생했습니다.");
      Alert.alert("오류", err.message);
    } finally {
      setIsEmailChecking(false);
    }
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (isEmailAvailable !== true) {
      Alert.alert("입력 오류", "이메일 중복 확인을 완료해주세요.");
      return;
    }
    // ... (기존 유효성 검사 로직)
    if (
      !email.trim() ||
      !password.trim() ||
      !name.trim() ||
      !phoneNumber.trim() ||
      !nationalId.trim() ||
      !jobType
    ) {
      Alert.alert("입력 오류", "모든 필수 항목을 입력해주세요.");
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

    setIsSubmitting(true);
    const additionalData = {
      name: name.trim(),
      phoneNumber: phoneNumber.trim(),
      nationalId: nationalId.trim(),
      jobType,
    };
    const result = await signUpWithEmail(
      email.trim(),
      password,
      additionalData,
    );
    setIsSubmitting(false);

    if (result.success) navigation.navigate("SignIn");
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <Text style={styles.title}>회원가입</Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.inputField}
            placeholder="이메일 주소"
            value={email}
            onChangeText={handleEmailChange}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.checkButton}
            onPress={handleCheckEmail}
            disabled={isEmailChecking}
          >
            {isEmailChecking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.checkButtonText}>중복확인</Text>
            )}
          </TouchableOpacity>
        </View>
        {emailMessage && (
          <Text
            style={[
              styles.message,
              isEmailAvailable ? styles.successMessage : styles.errorMessage,
            ]}
          >
            {emailMessage}
          </Text>
        )}

        <TextInput
          style={styles.input}
          placeholder="비밀번호 (6자 이상)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호 확인"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="이름"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="전화번호 (예: 01012345678)"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          maxLength={11}
        />
        <TextInput
          style={styles.input}
          placeholder="주민등록번호 (13자리, - 제외)"
          value={nationalId}
          onChangeText={setNationalId}
          keyboardType="number-pad"
          maxLength={13}
          secureTextEntry
        />

        <Text style={styles.label}>직업 유형</Text>
        <View style={styles.jobTypeContainer}>
          {jobTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.jobTypeButton,
                jobType === type && styles.jobTypeButtonSelected,
              ]}
              onPress={() => setJobType(type)}
            >
              <Text
                style={[
                  styles.jobTypeButtonText,
                  jobType === type && styles.jobTypeButtonTextSelected,
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isSubmitting || authIsLoading ? (
          <ActivityIndicator
            size="large"
            color="#3d5afe"
            style={styles.spinner}
          />
        ) : (
          <Button title="회원가입" onPress={handleSubmit} color="#3d5afe" />
        )}

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate("SignIn")}
        >
          <Text style={styles.linkText}>
            이미 회원가입 하셨나요? 로그인하기
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { flexGrow: 1, justifyContent: "center" },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f8f9fa",
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
    color: "#1e3a5f",
  },
  input: {
    height: 50,
    borderColor: "#ced4da",
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: "white",
    fontSize: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  inputField: {
    flex: 1,
    height: 50,
    borderColor: "#ced4da",
    borderWidth: 1,
    paddingHorizontal: 15,
    backgroundColor: "white",
    fontSize: 16,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  checkButton: {
    height: 50,
    paddingHorizontal: 12,
    backgroundColor: "#6c757d",
    justifyContent: "center",
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  checkButtonText: { color: "#fff", fontWeight: "bold" },
  message: { marginTop: -7, marginBottom: 12, fontSize: 12, paddingLeft: 5 },
  successMessage: { color: "green" },
  errorMessage: { color: "red" },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: "600",
    color: "#495057",
    marginTop: 5,
  },
  jobTypeContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 25,
    marginTop: 5,
  },
  jobTypeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#adb5bd",
    backgroundColor: "#e9ecef",
  },
  jobTypeButtonSelected: { backgroundColor: "#3d5afe", borderColor: "#3d5afe" },
  jobTypeButtonText: { fontSize: 16, color: "#495057" },
  jobTypeButtonTextSelected: { color: "white", fontWeight: "bold" },
  linkButton: { marginTop: 20, alignItems: "center" },
  linkText: { color: "#3d5afe", fontSize: 15, textDecorationLine: "underline" },
  spinner: { marginVertical: Platform.OS === "ios" ? 18 : 19 },
});

export default SignUpScreen;
