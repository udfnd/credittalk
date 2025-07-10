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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // 로그인한 사용자만 기록합니다.
    if (user) {
      logPageView(user.id, 'HelpDeskListScreen');
    }
  }, [user]);

  const fetchQuestions = async () => {
    if (!user) {
      setQuestions([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("help_questions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching questions:", error);
      Alert.alert("오류", "문의 목록을 불러오는 데 실패했습니다.");
    } else {
      setQuestions(data);
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchQuestions();
    }, [user])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQuestions().then(() => setRefreshing(false));
  }, [user]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.itemContainer}
      onPress={() => navigation.navigate("HelpDeskDetail", { questionId: item.id })}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.case_summary || item.title || "상세 내용 없음"}
        </Text>
        <Text style={styles.itemDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Text style={item.is_answered ? styles.statusAnswered : styles.statusPending}>
        {item.is_answered ? "답변 완료" : "답변 대기중"}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Icon name="login" size={60} color="#ced4da" />
        <Text style={styles.emptyText}>로그인이 필요합니다</Text>
        <Text style={styles.emptySubText}>
          1:1 문의 기능을 사용하려면 로그인해주세요.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {questions.length === 0 ? (
        <View style={styles.centered}>
          <Icon name="chat-question-outline" size={60} color="#ced4da" />
          <Text style={styles.emptyText}>작성한 문의 내역이 없습니다.</Text>
          <Text style={styles.emptySubText}>
            아래 버튼을 눌러 새 문의를 작성해보세요.
          </Text>
        </View>
      ) : (
        <FlatList
          data={questions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
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
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#495057",
    marginTop: 15,
  },
  emptySubText: {
    fontSize: 14,
    color: "#868e96",
    marginTop: 8,
    textAlign: "center",
  },
  itemContainer: {
    backgroundColor: "white",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#343a40",
    flex: 1,
    marginRight: 10,
  },
  itemDate: {
    fontSize: 12,
    color: "#868e96",
  },
  statusAnswered: {
    fontSize: 14,
    color: "#3d5afe",
    fontWeight: '600',
  },
  statusPending: {
    fontSize: 14,
    color: "#f03e3e",
    fontWeight: '600',
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    backgroundColor: "#3d5afe",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
