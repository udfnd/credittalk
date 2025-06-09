import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Button,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../lib/supabaseClient";

const HelpDeskCreateScreen = () => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("오류", "제목과 내용을 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("오류", "로그인이 필요합니다.");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("help_questions")
      .insert([{ title, content, user_id: user.id }]);

    setLoading(false);

    if (error) {
      console.error("Error creating question:", error);
      Alert.alert("오류", "질문 등록에 실패했습니다.");
    } else {
      Alert.alert("성공", "질문이 등록되었습니다.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>제목</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="제목을 입력하세요"
      />
      <Text style={styles.label}>내용</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={content}
        onChangeText={setContent}
        placeholder="궁금한 점을 자세히 적어주세요."
        multiline
      />
      {loading ? (
        <ActivityIndicator size="large" color="#6200ee" />
      ) : (
        <Button title="제출하기" onPress={handleSubmit} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "white" },
  label: { fontSize: 16, fontWeight: "bold", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    borderRadius: 5,
    fontSize: 16,
    marginBottom: 20,
  },
  textArea: {
    height: 200,
    textAlignVertical: "top",
  },
});

export default HelpDeskCreateScreen;
