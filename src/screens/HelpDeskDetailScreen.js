import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  RefreshControl
} from "react-native";
import { supabase } from "../lib/supabaseClient";
import { useFocusEffect } from "@react-navigation/native";

export default function HelpDeskDetailScreen({ route }) {
  const { questionId } = route.params;
  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQuestion = async () => {
    setLoading(true);
    // RLS 정책에 의해 본인 글이 아니면 data가 null로 반환됩니다.
    const { data, error } = await supabase
      .from("help_questions")
      .select(`*, help_answers(*)`)
      .eq("id", questionId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: 일치하는 행 없음
      console.error("Error fetching question details:", error);
      Alert.alert("오류", "문의 내용을 불러오는 데 실패했습니다.");
    } else {
      setQuestion(data);
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchQuestion();
    }, [questionId])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQuestion().then(() => setRefreshing(false));
  }, [questionId]);


  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  if (!question) {
    return (
      <View style={styles.centered}>
        <Text>문의 내역을 찾을 수 없거나 접근 권한이 없습니다.</Text>
      </View>
    );
  }

  const DetailItem = ({ label, value }) =>
    value ? (
      <View style={styles.detailItem}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    ) : null;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>문의 내용</Text>
        <DetailItem label="이름" value={question.user_name} />
        <DetailItem label="연락처" value={question.user_phone} />
        <DetailItem label="대화 계기" value={question.conversation_reason} />
        <DetailItem label="상대방 계좌" value={question.opponent_account} />
        <DetailItem label="상대방 연락처" value={question.opponent_phone} />
        <DetailItem label="상대방 SNS" value={question.opponent_sns} />
        <DetailItem label="사건 개요" value={question.case_summary} />
      </View>

      {question.help_answers && question.help_answers.length > 0 ? (
        <View style={[styles.section, styles.answerSection]}>
          <Text style={styles.sectionTitle}>관리자 답변</Text>
          {question.help_answers.map((answer) => (
            <View key={answer.id}>
              <Text style={styles.answerContent}>{answer.content}</Text>
              <Text style={styles.answerDate}>
                {new Date(answer.created_at).toLocaleString('ko-KR')}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.section, styles.pendingSection]}>
          <Text style={styles.pendingText}>답변을 준비중입니다.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  section: {
    backgroundColor: "white",
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 15,
    borderRadius: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#343a40",
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
    paddingBottom: 10,
  },
  detailItem: {
    marginBottom: 18,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#868e96",
    marginBottom: 5,
  },
  detailValue: {
    fontSize: 16,
    color: "#212529",
    lineHeight: 24,
  },
  answerSection: {
    backgroundColor: "#e7f5ff",
  },
  answerContent: {
    fontSize: 16,
    lineHeight: 24,
    color: "#1864ab",
  },
  answerDate: {
    fontSize: 12,
    color: "#1c7ed6",
    textAlign: "right",
    marginTop: 15,
  },
  pendingSection: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  pendingText: {
    fontSize: 16,
    color: "#868e96",
    fontWeight: "600"
  },
});
