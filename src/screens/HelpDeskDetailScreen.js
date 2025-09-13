// src/screens/HelpDeskDetailScreen.js
import React, { useCallback, useLayoutEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

const maskNameMiddle = (name) => {
  if (!name || typeof name !== "string" || name.length <= 1) return name || "";
  if (name.length === 2) return `${name[0]}*`;
  const middleIndex = Math.floor(name.length / 2);
  return `${name.substring(0, middleIndex)}*${name.substring(middleIndex + 1)}`;
};

const maskPhoneNumberCustom = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") return phoneNumber || "";
  const clean = phoneNumber.replace(/-/g, "");
  const len = clean.length;
  if (len === 11) {
    const p1 = clean.substring(0, 3);
    const p2 = clean.substring(3, 7);
    const p3 = clean.substring(7, 11);
    const maskedP2 = `${p2[0]}*${p2.substring(2)}`;
    const maskedP3 = `${p3[0]}*${p3.substring(2)}`;
    return `${p1}-${maskedP2}-${maskedP3}`;
  }
  if (len === 10) {
    if (clean.startsWith("02")) {
      const p1 = clean.substring(0, 2);
      const p2 = clean.substring(2, 6);
      const p3 = clean.substring(6, 10);
      const maskedP2 = `${p2[0]}*${p2.substring(2)}`;
      const maskedP3 = `${p3[0]}*${p3.substring(2)}`;
      return `${p1}-${maskedP2}-${maskedP3}`;
    } else {
      const p1 = clean.substring(0, 3);
      const p2 = clean.substring(3, 6);
      const p3 = clean.substring(6, 10);
      const maskedP2 = `${p2[0]}*${p2[2]}`;
      const maskedP3 = `${p3[0]}*${p3.substring(2)}`;
      return `${p1}-${maskedP2}-${maskedP3}`;
    }
  }
  const mid = Math.floor(len / 2) - 1;
  if (mid <= 0) return clean;
  return clean.substring(0, mid) + "*" + clean.substring(mid + 1);
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || typeof accountNumber !== "string") return accountNumber || "";
  const clean = accountNumber.replace(/-/g, "");
  if (clean.length < 6) return accountNumber;
  const PREFIX_COUNT = 2;
  const MASK_COUNT = 4;
  const start = PREFIX_COUNT;
  const end = PREFIX_COUNT + MASK_COUNT;
  return clean.substring(0, start) + "*".repeat(MASK_COUNT) + clean.substring(end);
};

const DetailItem = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
};

const AnswerItem = ({ answer }) => {
  return (
    <View style={styles.answerItemContainer}>
      <Text style={styles.answerContent}>{answer.content}</Text>
      <Text style={styles.answerDate}>
        {new Date(answer.created_at).toLocaleString("ko-KR")}
      </Text>
    </View>
  );
};

export default function HelpDeskDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { questionId } = route.params || {};

  const [question, setQuestion] = useState(null);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQuestion = useCallback(async () => {
    const { data, error } = await supabase
      .from("help_questions")
      .select(`*, help_answers(*)`)
      .eq("id", questionId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching question details:", error);
      Alert.alert("오류", "문의 내용을 불러오는 데 실패했습니다.");
      setQuestion(null);
      return;
    }

    if (data) {
      setQuestion(data);
      // 공개 여부(연동 케이스 존재 여부)
      const { count } = await supabase
        .from("new_crime_cases")
        .select("id", { count: "exact", head: true })
        .eq("source_help_question_id", questionId);

      setIsPublic(!!count && count > 0);
    } else {
      setQuestion(null);
    }
  }, [questionId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchQuestion().finally(() => setLoading(false));
    }, [fetchQuestion])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQuestion().finally(() => setRefreshing(false));
  }, [fetchQuestion]);

  const currentUserId = user?.id || user?.uid;
  const isOwner = question?.user_id === currentUserId;

  // 헤더에 '수정' 버튼 (소유자 & 미답변)
  useLayoutEffect(() => {
    const canEdit = !!question && isOwner && !question.is_answered;
    navigation.setOptions({
      headerRight: () =>
        canEdit ? (
          <TouchableOpacity
            onPress={() => navigation.navigate("HelpDeskEdit", { questionId })}
            style={{ paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ color: "#3d5afe", fontWeight: "600" }}>수정</Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, question, isOwner, questionId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#5262F5" />
      </View>
    );
  }

  if (!question) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>문의 내역을 찾을 수 없거나 접근 권한이 없습니다.</Text>
      </View>
    );
  }

  // 비공개 + 소유자 아님 → 접근 불가
  if (!isOwner && !isPublic) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>비공개 문의입니다. 작성자만 볼 수 있어요.</Text>
      </View>
    );
  }

  const shouldMaskData = isPublic && !isOwner;

  // help_answers를 항상 배열로
  let answers = [];
  if (question?.help_answers) {
    if (Array.isArray(question.help_answers)) {
      answers = question.help_answers.filter(Boolean);
    } else if (typeof question.help_answers === "object") {
      answers = [question.help_answers];
    }
  }
  const hasAnswer = answers.length > 0;
  const canViewAnswer = (isOwner || isPublic) && hasAnswer;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#5262F5"]} />
      }
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>문의 내용</Text>
        <DetailItem label="이름" value={shouldMaskData ? maskNameMiddle(question.user_name) : question.user_name} />
        <DetailItem label="연락처" value={shouldMaskData ? maskPhoneNumberCustom(question.user_phone) : question.user_phone} />
        <DetailItem label="대화 계기" value={question.conversation_reason} />
        <DetailItem label="상대방 계좌" value={shouldMaskData ? maskAccountNumber(question.opponent_account) : question.opponent_account} />
        <DetailItem label="상대방 연락처" value={shouldMaskData ? maskPhoneNumberCustom(question.opponent_phone) : question.opponent_phone} />
        <DetailItem label="상대방 SNS" value={shouldMaskData ? maskNameMiddle(question.opponent_sns) : question.opponent_sns} />
        <DetailItem label="사건 개요" value={question.case_summary} />
      </View>

      {canViewAnswer ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>관리자 답변</Text>
          {answers.map((answer) => (
            <AnswerItem key={answer.id} answer={answer} />
          ))}
        </View>
      ) : (
        isOwner &&
        !hasAnswer && (
          <View style={[styles.section, styles.pendingSection]}>
            <Text style={styles.pendingText}>답변을 준비중입니다.</Text>
          </View>
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "#f8f9fa" },
  infoText: { fontSize: 16, color: "#495057" },
  section: {
    backgroundColor: "white",
    padding: 20,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#343a40" },
  detailItem: { marginBottom: 16 },
  detailLabel: { fontSize: 14, fontWeight: "600", color: "#868e96", marginBottom: 6 },
  detailValue: { fontSize: 16, color: "#212529", lineHeight: 24 },
  answerItemContainer: { backgroundColor: "#f1f3f5", borderRadius: 8, padding: 16, marginBottom: 10 },
  answerContent: { fontSize: 16, lineHeight: 24, color: "#343a40" },
  answerDate: { fontSize: 12, color: "#868e96", textAlign: "right", marginTop: 12 },
  pendingSection: { alignItems: "center", paddingVertical: 30, backgroundColor: "#fff", elevation: 0, shadowOpacity: 0 },
  pendingText: { fontSize: 16, color: "#495057", fontWeight: "500" },
});
