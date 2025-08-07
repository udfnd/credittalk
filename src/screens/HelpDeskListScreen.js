import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert
} from "react-native";
import { supabase } from "../lib/supabaseClient";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { logPageView } from "../lib/pageViewLogger";

export default function HelpDeskListScreen({ navigation }) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [publicIdSet, setPublicIdSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      logPageView(user.id, 'HelpDeskListScreen');
    }
  }, [user]);

  // [최종 수정] 가장 안정적이고 효율적인 2-Step 방식으로 데이터 조회 로직을 변경합니다.
  const fetchQuestionsAndPublicStatus = async () => {
    if (!user) {
      setQuestions([]);
      setLoading(false);
      return;
    }

    // 1. 모든 질문 목록을 가져옵니다.
    const { data: questionsData, error: questionsError } = await supabase
      .from("help_questions")
      .select("*")
      .order("created_at", { ascending: false });

    if (questionsError) {
      console.error("Error fetching questions:", questionsError);
      Alert.alert("오류", "문의 목록을 불러오는 데 실패했습니다.");
      setLoading(false);
      return;
    }

    if (!questionsData || questionsData.length === 0) {
      setQuestions([]);
      setPublicIdSet(new Set());
      setLoading(false);
      return;
    }

    // 2. 가져온 질문들의 ID만 추출합니다.
    const questionIds = questionsData.map(q => q.id);

    // 3. [핵심] new_crime_cases 테이블에 단 한 번만 쿼리하여 공개된 질문 ID 목록을 가져옵니다.
    const { data: publicCases, error: publicError } = await supabase
      .from('new_crime_cases')
      .select('source_help_question_id')
      .in('source_help_question_id', questionIds);

    if (publicError) {
      console.error("Error fetching public status:", publicError);
    } else {
      // 4. O(1) 시간 복잡도로 빠른 조회를 위해 Set 자료구조에 저장합니다.
      const publicSet = new Set(publicCases.map(p => p.source_help_question_id));
      setPublicIdSet(publicSet);
    }

    setQuestions(questionsData);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchQuestionsAndPublicStatus();
    }, [user])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQuestionsAndPublicStatus().then(() => setRefreshing(false));
  }, [user]);

  const renderItem = ({ item }) => {
    // Set에 ID가 있는지 확인하여 공개 여부를 결정합니다.
    const isPublic = publicIdSet.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.itemContainer,
          // 비공개일 때 클릭이 안 되는 것처럼 보이게 스타일 추가
          !isPublic && styles.disabledItem
        ]}
        // 비공개 질문은 클릭을 완전히 비활성화합니다.
        disabled={!isPublic}
        onPress={() => {
          // 클릭 시, 공개된 질문만 상세 페이지로 이동합니다.
          if (isPublic) {
            navigation.navigate("HelpDeskDetail", { questionId: item.id });
          }
          // 비공개 질문은 disabled 속성으로 인해 이 함수가 실행되지 않습니다.
        }}
      >
        <View style={styles.itemHeader}>
          <Icon
            name={isPublic ? 'lock-open-variant-outline' : 'lock-outline'}
            size={16}
            color={isPublic ? "#228be6" : "#868e96"}
            style={styles.iconStyle}
          />
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.case_summary || item.title || "상세 내용 없음"}
          </Text>
          <Text style={styles.itemDate}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.statusContainer}>
          <Text style={[styles.statusTag, isPublic ? styles.publicTag : styles.privateTag]}>
            {isPublic ? "공개된 질문" : "비공개 질문"}
          </Text>
          <Text style={item.is_answered ? styles.statusAnswered : styles.statusPending}>
            {item.is_answered ? "답변 완료" : "답변 대기중"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#3d5afe" /></View>;
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Icon name="login" size={60} color="#ced4da" />
        <Text style={styles.emptyText}>로그인이 필요합니다</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {questions.length === 0 ? (
        <View style={styles.centered}>
          <Icon name="chat-question-outline" size={60} color="#ced4da" />
          <Text style={styles.emptyText}>작성한 문의 내역이 없습니다.</Text>
        </View>
      ) : (
        <FlatList
          data={questions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("HelpDeskCreate")}
      >
        <Icon name="pencil-plus" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  emptyText: { fontSize: 18, fontWeight: "600", color: "#495057", marginTop: 15 },
  itemContainer: { backgroundColor: "white", paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#e9ecef" },
  disabledItem: {
    backgroundColor: '#f8f9fa',
    opacity: 0.6
  },
  itemHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  iconStyle: { marginRight: 8 },
  itemTitle: { fontSize: 16, fontWeight: "bold", color: "#343a40", flex: 1 },
  itemDate: { fontSize: 12, color: "#868e96", marginLeft: 10 },
  statusContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  statusTag: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, overflow: 'hidden' },
  publicTag: { backgroundColor: '#dbe4ff', color: '#3d5afe' },
  privateTag: { backgroundColor: '#e9ecef', color: '#868e96' },
  statusAnswered: { fontSize: 14, color: "#3d5afe", fontWeight: '600' },
  statusPending: { fontSize: 14, color: "#f03e3e", fontWeight: '600' },
  fab: { position: "absolute", right: 20, bottom: 20, backgroundColor: "#3d5afe", width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center", elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },
});
