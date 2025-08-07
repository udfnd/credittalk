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
import { useAuth } from "../context/AuthContext"; // AuthContext import 추가

const maskNameMiddle = (name) => {
  if (!name || typeof name !== "string" || name.length <= 1) {
    return name || "";
  }
  if (name.length === 2) {
    return `${name[0]}*`;
  }
  const middleIndex = Math.floor(name.length / 2);
  return `${name.substring(0, middleIndex)}*${name.substring(middleIndex + 1)}`;
};

const maskPhoneNumberCustom = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return phoneNumber || "";
  }
  const clean = phoneNumber.replace(/-/g, "");
  const len = clean.length;

  if (len === 11) {
    const p1 = clean.substring(0, 3);
    const p2 = clean.substring(3, 7);  // 4자리
    const p3 = clean.substring(7, 11); // 4자리

    // 중간 1자리만 마스킹 (index 1)
    const maskedP2 = `${p2[0]}*${p2.substring(2)}`;
    // 끝 1자리만 마스킹 (index 1 of p3)
    const maskedP3 = `${p3[0]}*${p3.substring(2)}`;

    return `${p1}-${maskedP2}-${maskedP3}`;
  }

  if (len === 10) {
    if (clean.startsWith("02")) {
      const p1 = clean.substring(0, 2);
      const p2 = clean.substring(2, 6);  // 4자리
      const p3 = clean.substring(6, 10); // 4자리

      const maskedP2 = `${p2[0]}*${p2.substring(2)}`;
      const maskedP3 = `${p3[0]}*${p3.substring(2)}`;

      return `${p1}-${maskedP2}-${maskedP3}`;
    } else {
      const p1 = clean.substring(0, 3);
      const p2 = clean.substring(3, 6);  // 3자리
      const p3 = clean.substring(6, 10); // 4자리

      // 3자리 중 중간 1자리만 마스킹
      const maskedP2 = `${p2[0]}*${p2[2]}`;
      const maskedP3 = `${p3[0]}*${p3.substring(2)}`;

      return `${p1}-${maskedP2}-${maskedP3}`;
    }
  }

  // 기타 길이: 문자열의 정확한 가운데 한 문자, 그 다음 문자를 남기고 나머지 그대로
  const mid = Math.floor(len / 2) - 1;
  if (mid <= 0) return clean;
  return (
    clean.substring(0, mid) +
    "*" +
    clean.substring(mid + 1)
  );
};

// 계좌번호 마스킹: 앞 2자리, 뒤부터 2자리만 '**' 처리 (변경 없음)
const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || typeof accountNumber !== "string") {
    return accountNumber || "";
  }

  const clean = accountNumber.replace(/-/g, "");
  if (clean.length < 6) {
    return accountNumber;
  }

  const PREFIX_COUNT = 2;
  const MASK_COUNT = 2;
  const endMaskedIndex = PREFIX_COUNT + MASK_COUNT;

  return (
    clean.substring(0, PREFIX_COUNT) +
    "*".repeat(MASK_COUNT) +
    clean.substring(endMaskedIndex)
  );
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
  // ... 기존 AnswerItem 코드는 동일 ...
};

export default function HelpDeskDetailScreen({ route }) {
  const { questionId } = route.params;
  const { user } = useAuth(); // 현재 로그인한 사용자 정보 가져오기
  const [question, setQuestion] = useState(null);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQuestion = useCallback(async () => {
    // 1. 원본 문의 내용과 답변을 가져옵니다.
    const { data, error } = await supabase
      .from("help_questions")
      .select(`*, help_answers(*)`)
      .eq("id", questionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching question details:", error);
      Alert.alert("오류", "문의 내용을 불러오는 데 실패했습니다.");
      setQuestion(null);
      return;
    }

    if (data) {
      setQuestion(data);
      // 2. 해당 글이 공개된 글인지 new_crime_cases 테이블을 통해 확인합니다.
      const { data: publicCase, error: publicError } = await supabase
        .from('new_crime_cases')
        .select('id')
        .eq('source_help_question_id', questionId)
        .single();

      if (publicCase) {
        setIsPublic(true);
      } else {
        setIsPublic(false);
      }
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
    fetchQuestion().then(() => setRefreshing(false));
  }, [fetchQuestion]);


  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#5262F5" /></View>;
  }

  if (!question) {
    return <View style={styles.centered}><Text style={styles.infoText}>문의 내역을 찾을 수 없거나 접근 권한이 없습니다.</Text></View>;
  }

  // [수정됨] 마스킹 여부를 결정하는 로직
  const isOwner = user?.id === question.user_id;
  const shouldMaskData = isPublic && !isOwner;

  const answers = (question && Array.isArray(question.help_answers) && question.help_answers[0] !== null)
    ? question.help_answers
    : [];

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

      {/* [수정됨] 마스킹이 필요하지 않을 때만 답변을 보여줍니다. */}
      {!shouldMaskData && answers.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>관리자 답변</Text>
          {answers.map((answer) => (
            <AnswerItem key={answer.id} answer={answer} />
          ))}
        </View>
      ) : (
        // 본인이 작성한 글이면서 아직 답변이 없는 경우에만 '답변 준비 중' 표시
        isOwner && !question.is_answered && (
          <View style={[styles.section, styles.pendingSection]}>
            <Text style={styles.pendingText}>답변을 준비중입니다.</Text>
          </View>
        )
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
