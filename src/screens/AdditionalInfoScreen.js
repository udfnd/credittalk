// src/screens/AdditionalInfoScreen.js
import React, { useState } from "react";
import {
  View,
  Text,
  Button,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useAuth } from "../context/AuthContext";

const jobTypes = ["일반", "사업자"];

function AdditionalInfoScreen() {
  const { user, fetchAndSetProfile, supabase } = useAuth();
  const [jobType, setJobType] = useState("일반");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert("오류", "사용자 세션이 만료되었습니다. 다시 로그인해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("users").insert({
        auth_user_id: user.id,
        name:
          user.user_metadata?.full_name || user.user_metadata?.name || "사용자",
        job_type: jobType,
        // 소셜 로그인이므로 전화번호, 주민번호는 null로 둡니다.
        // 필요 시 이 화면에서 입력받도록 확장할 수 있습니다.
      });

      if (error) throw error;

      await fetchAndSetProfile(user.id); // 프로필 정보 갱신
    } catch (err) {
      Alert.alert("오류", "추가 정보 저장에 실패했습니다: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>추가 정보 입력</Text>
      <Text style={styles.subtitle}>
        원활한 서비스 이용을 위해 직업 유형을 선택해주세요.
      </Text>
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
      {isSubmitting ? (
        <ActivityIndicator size="large" color="#3d5afe" />
      ) : (
        <Button
          title="저장하고 시작하기"
          onPress={handleSubmit}
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
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
    color: "#1e3a5f",
  },
  subtitle: {
    fontSize: 16,
    color: "gray",
    textAlign: "center",
    marginBottom: 40,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#495057",
    marginBottom: 10,
  },
  jobTypeContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 40,
  },
  jobTypeButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#adb5bd",
    backgroundColor: "#e9ecef",
  },
  jobTypeButtonSelected: { backgroundColor: "#3d5afe", borderColor: "#3d5afe" },
  jobTypeButtonText: { fontSize: 16, color: "#495057" },
  jobTypeButtonTextSelected: { color: "white", fontWeight: "bold" },
});

export default AdditionalInfoScreen;
