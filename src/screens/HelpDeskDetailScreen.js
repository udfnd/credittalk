import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { supabase } from "../lib/supabaseClient";

const HelpDeskDetailScreen = () => {
  const route = useRoute();
  const { questionId } = route.params;
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    // Fetch Question
    const { data: questionData, error: questionError } = await supabase
      .from("help_questions")
      .select("*")
      .eq("id", questionId)
      .single();

    if (questionError) console.error("Error fetching question:", questionError);
    else setQuestion(questionData);

    // Fetch Answer if question exists
    if (questionData) {
      const { data: answerData, error: answerError } = await supabase
        .from("help_answers")
        .select("*")
        .eq("question_id", questionId)
        .single();

      if (answerError && answerError.code !== "PGRST116") {
        // Ignore 'range not satisfiable' error for no answer
        console.error("Error fetching answer:", answerError);
      } else {
        setAnswer(answerData);
      }
    }
    setLoading(false);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData().then(() => setRefreshing(false));
  }, [questionId]);

  // Initial fetch
  useState(() => {
    fetchData();
  }, [questionId]);

  if (loading && !refreshing) {
    return <ActivityIndicator style={styles.loader} size="large" />;
  }

  if (!question) {
    return (
      <View style={styles.container}>
        <Text>질문을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>나의 질문</Text>
        <Text style={styles.title}>{question.title}</Text>
        <Text style={styles.content}>{question.content}</Text>
        <Text style={styles.date}>
          {new Date(question.created_at).toLocaleString()}
        </Text>
      </View>

      {answer ? (
        <View style={[styles.card, styles.answerCard]}>
          <Text style={styles.cardTitle}>관리자 답변</Text>
          <Text style={styles.content}>{answer.content}</Text>
          <Text style={styles.date}>
            {new Date(answer.created_at).toLocaleString()}
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.noAnswerText}>
            아직 답변이 등록되지 않았습니다.
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5", padding: 10 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 8,
    marginBottom: 15,
    elevation: 2,
  },
  answerCard: { backgroundColor: "#e8f5e9" },
  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#666",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 5,
  },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 15 },
  content: { fontSize: 16, lineHeight: 24, marginBottom: 15 },
  date: { fontSize: 12, color: "gray", textAlign: "right" },
  noAnswerText: {
    fontSize: 16,
    color: "gray",
    textAlign: "center",
    paddingVertical: 20,
  },
});

export default HelpDeskDetailScreen;
