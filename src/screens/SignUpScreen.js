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
import { supabase } from "../lib/supabaseClient";

const jobTypes = ["일반", "사업자"];

function SignUpScreen() {
  const navigation = useNavigation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [jobType, setJobType] = useState("일반");

  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [emailMessage, setEmailMessage] = useState("");
  const [isEmailAvailable, setIsEmailAvailable] = useState(null);

  const [nicknameMessage, setNicknameMessage] = useState("");
  const [isNicknameAvailable, setIsNicknameAvailable] = useState(null);

  const validateEmailFormat = (text) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);

  const handleEmailChange = (text) => {
    setEmail(text);
    if (isEmailAvailable !== null) {
      setIsEmailAvailable(null);
      setEmailMessage("");
    }
  };

  const handleNicknameChange = (text) => {
    setNickname(text);
    if (isNicknameAvailable !== null) {
      setIsNicknameAvailable(null);
      setNicknameMessage("");
    }
  };

  const handleCheckNickname = async () => {
    Keyboard.dismiss();
    if (nickname.trim().length < 2) {
      Alert.alert("입력 오류", "닉네임은 2자 이상이어야 합니다.");
      return;
    }

    setIsLoading(true);
    setNicknameMessage("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "check-nickname-availability",
        { body: { nickname: nickname.trim() } },
      );

      if (error) throw error;
      if (data.available) {
        setIsNicknameAvailable(true);
        setNicknameMessage("사용 가능한 닉네임입니다.");
      } else {
        setIsNicknameAvailable(false);
        setNicknameMessage("이미 사용 중인 닉네임입니다.");
      }
    } catch (err) {
      setIsNicknameAvailable(null);
      setNicknameMessage("오류: 닉네임 중복 확인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckEmail = async () => {
    Keyboard.dismiss();
    if (!validateEmailFormat(email)) {
      Alert.alert("입력 오류", "올바른 이메일 형식이 아닙니다.");
      return;
    }

    setIsLoading(true);
    setEmailMessage("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "check-email-availability",
        { body: { email: email.trim() } },
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
      setEmailMessage("오류: 이메일 중복 확인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendVerificationCode = async () => {
    Keyboard.dismiss();

    // 1) 입력 검증: 숫자만 10~11자리인지 확인
    if (!phoneNumber || !/^\d{10,11}$/.test(phoneNumber)) {
      Alert.alert("입력 오류", "올바른 휴대폰 번호를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      // 2) Edge Function 호출
      const { data, error } = await supabase.functions.invoke(
        "send-verification-otp",
        { body: { phone: phoneNumber.trim() } }
      );

      // 3) 서버 측 에러가 내려온 경우
      if (error) {
        // 3-1) Supabase Function 에서 context.errorMessage(JSON) 로 보낸 경우 우선 파싱
        const contextError = error.context?.errorMessage;
        let displayError = "인증번호 발송에 실패했습니다.";

        if (contextError) {
          try {
            const parsed = JSON.parse(contextError);
            displayError = parsed.error || displayError;
          } catch {
            // JSON 파싱 실패 시 원본 문자열 사용
            displayError = contextError;
          }
        }
        // 3-2) 위에 없으면 supabase-js error.message 사용
        else if (error.message) {
          displayError = error.message;
        }

        // 3-3) 에러 문구 키워드에 따라 Alert 제목을 분기
        // 이미 가입된 번호라면 '인증 불가', 그 외엔 '인증번호 발송 실패'
        const title = displayError.includes("가입된")
          ? "인증 불가"
          : "인증번호 발송 실패";

        Alert.alert(title, displayError);
        return;
      }

      // 4) 성공 처리: OTP 발송 완료 표시
      Alert.alert(
        "인증번호 발송",
        "입력하신 휴대폰 번호로 인증번호를 발송했습니다."
      );
      setIsOtpSent(true);

    } catch (err) {
      // 5) 네트워크 오류 등 예기치 못한 에러
      console.error("handleSendVerificationCode error:", err);
      Alert.alert("네트워크 오류", "인증번호 발송 중 문제가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!isOtpSent) {
      Alert.alert("인증 필요", "먼저 휴대폰 인증을 완료해주세요.");
      return;
    }
    if (isEmailAvailable !== true) {
      Alert.alert("이메일 확인 필요", "이메일 중복 확인을 해주세요.");
      return;
    }
    if (isNicknameAvailable !== true) {
      Alert.alert("닉네임 확인 필요", "닉네임 중복 확인을 해주세요.");
      return;
    }
    if (
      !otp.trim() ||
      !email.trim() ||
      !password.trim() ||
      !name.trim() ||
      !nickname.trim()
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

    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke("verify-and-signup", {
        body: {
          email: email.trim(),
          password,
          name: name.trim(),
          nickname: nickname.trim(),
          phoneNumber: phoneNumber.trim(),
          jobType,
          otp: otp.trim(),
        },
      });

      if (error) {
        const contextError = error.context?.errorMessage;
        let displayError = "알 수 없는 오류가 발생했습니다.";
        if (contextError) {
          try {
            const parsedError = JSON.parse(contextError);
            displayError = parsedError.error || displayError;
          } catch (e) {
            displayError = contextError;
          }
        } else {
          displayError = error.message;
        }
        throw new Error(displayError);
      }

      Alert.alert(
        "회원가입 성공",
        "회원가입이 완료되었습니다. 로그인 해주세요.",
        [{ text: "확인", onPress: () => navigation.navigate("SignIn") }],
      );
    } catch (err) {
      Alert.alert("회원가입 실패", err.message);
    } finally {
      setIsLoading(false);
    }
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
            placeholderTextColor="#6c757d"
            value={email}
            onChangeText={handleEmailChange}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.checkButton}
            onPress={handleCheckEmail}
            disabled={isLoading}
          >
            <Text style={styles.checkButtonText}>중복확인</Text>
          </TouchableOpacity>
        </View>
        {emailMessage.length > 0 && (
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
          placeholderTextColor="#6c757d"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호 확인"
          placeholderTextColor="#6c757d"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <TextInput
          style={styles.input}
          placeholder="이름"
          placeholderTextColor="#6c757d"
          value={name}
          onChangeText={setName}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.inputField}
            placeholder="닉네임 (영문, 숫자, 특수문자 가능)"
            placeholderTextColor="#6c757d"
            value={nickname}
            onChangeText={handleNicknameChange}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.checkButton}
            onPress={handleCheckNickname}
            disabled={isLoading}
          >
            <Text style={styles.checkButtonText}>중복확인</Text>
          </TouchableOpacity>
        </View>
        {nicknameMessage.length > 0 && (
          <Text
            style={[
              styles.message,
              isNicknameAvailable ? styles.successMessage : styles.errorMessage,
            ]}
          >
            {nicknameMessage}
          </Text>
        )}

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

        {!isOtpSent ? (
          <>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.inputField}
                placeholder="휴대폰 번호 (예: 01012345678)"
                placeholderTextColor="#6c757d"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                maxLength={11}
              />
              <TouchableOpacity
                style={styles.checkButton}
                onPress={handleSendVerificationCode}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.checkButtonText}>인증요청</Text>
                )}
              </TouchableOpacity>
            </View>
            <View style={{ height: 50 }} />
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="인증번호 6자리"
              placeholderTextColor="#6c757d"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
            />
            {isLoading ? (
              <ActivityIndicator
                size="large"
                color="#3d5afe"
                style={{ marginVertical: Platform.OS === "ios" ? 18 : 19 }}
              />
            ) : (
              <Button
                title="회원가입"
                onPress={handleSubmit}
                color="#3d5afe"
                disabled={isLoading}
              />
            )}
          </>
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
    color: "#000",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  inputField: {
    flex: 1,
    height: 50,
    borderColor: "#ced4da",
    borderWidth: 1,
    paddingHorizontal: 15,
    backgroundColor: "white",
    fontSize: 16,
    color: "#000",
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  checkButton: {
    height: 50,
    paddingHorizontal: 12,
    backgroundColor: "#6c757d",
    justifyContent: "center",
    alignItems: "center",
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    minWidth: 80,
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
  jobTypeButtonSelected: {
    backgroundColor: "#3d5afe",
    borderColor: "#3d5afe",
  },
  jobTypeButtonText: { fontSize: 16, color: "#495057" },
  jobTypeButtonTextSelected: { color: "white", fontWeight: "bold" },
  linkButton: { marginTop: 20, alignItems: "center" },
  linkText: { color: "#3d5afe", fontSize: 15, textDecorationLine: "underline" },
});

export default SignUpScreen;
