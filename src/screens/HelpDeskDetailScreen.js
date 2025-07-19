import React, { useState, useCallback } from "react";
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

// 각 질문 항목을 위한 재사용 가능한 컴포넌트
const DetailItem = ({ label, value }) => {
  // 값이 없는 경우 아무것도 렌더링하지 않음
  if (!value) return null;
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
};

// 각 답변 항목을 위한 재사용 가능한 컴포넌트
const AnswerItem = ({ answer }) => {
  return (
    <View style={styles.answerItemContainer}>
      <Text style={styles.answerContent}>{answer.content}</Text>
      <Text style={styles.answerDate}>
        {/* 날짜 형식을 'ko-KR' 로캘에 맞춰 더 읽기 쉽게 변경 */}
        {new Date(answer.created_at).toLocaleString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
};

export default function HelpDeskDetailScreen({ route }) {
  const { questionId } = route.params;
  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 데이터를 가져오는 핵심 로직
  const fetchQuestion = useCallback(async () => {
    // RLS 정책에 의해 본인 글이 아니면 data가 null로 반환됩니다.
    const { data, error } = await supabase
      .from("help_questions")
      .select(`*, help_answers(*)`) // help_answers 테이블과 join
      .eq("id", questionId)
      .single();

    // 에러 처리: PGRST116(일치하는 행 없음) 코드는 실제 에러가 아니므로 제외
    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching question details:", error);
      Alert.alert("오류", "문의 내용을 불러오는 데 실패했습니다.");
      setQuestion(null);
    } else {
      setQuestion(data);
    }
  }, [questionId]);


  // 화면이 포커스될 때마다 데이터를 다시 가져옴
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchQuestion().finally(() => setLoading(false));
    }, [fetchQuestion])
  );

  // "당겨서 새로고침" 기능 구현
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQuestion().then(() => setRefreshing(false));
  }, [fetchQuestion]);


  // 로딩 중일 때 표시되는 화면
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#5262F5" />
      </View>
    );
  }

  // 질문 데이터가 없을 경우 (접근 권한 포함)
  if (!question) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>문의 내역을 찾을 수 없거나 접근 권한이 없습니다.</Text>
      </View>
    );
  }

  const answers = Array.isArray(question.help_answers)
    ? question.help_answers
    : [question.help_answers]; // object면 배열로 감쌈


  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#5262F5"]} />
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

      {answers.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>관리자 답변</Text>
          {answers.map((answer) => (
            <AnswerItem key={answer.id} answer={answer} />
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
    padding: 20,
    backgroundColor: "#f8f9fa",
  },
  infoText: {
    fontSize: 16,
    color: '#495057',
  },
  section: {
    backgroundColor: "white",
    padding: 20,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2, // for Android shadow
    shadowColor: "#000", // for iOS shadow
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#343a40",
  },
  detailItem: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#868e96",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 16,
    color: "#212529",
    lineHeight: 24,
  },
  // --- 답변 관련 스타일 ---
  answerItemContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    // 여러 답변이 있을 경우를 대비해 하단 마진 추가
    marginBottom: 10,
  },
  answerContent: {
    fontSize: 16,
    lineHeight: 24,
    color: '#343a40',
  },
  answerDate: {
    fontSize: 12,
    color: "#868e96",
    textAlign: "right",
    marginTop: 12,
  },
  pendingSection: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#fff',
    elevation: 0,
    shadowOpacity: 0,
  },
  pendingText: {
    fontSize: 16,
    color: "#495057",
    fontWeight: "500"
  },
});
