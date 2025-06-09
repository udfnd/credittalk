import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { supabase } from "../lib/supabaseClient";

const HelpDeskListScreen = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  const fetchQuestions = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("User not logged in");
      setLoading(false);
      return;
    }

    // '내 질문만' 가져오는 .eq() 조건을 삭제하여 모든 질문을 가져오도록 수정
    const { data, error } = await supabase
      .from("help_questions")
      .select("id, title, created_at, is_answered")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching questions:", error);
    } else {
      setQuestions(data);
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchQuestions();
    }, []),
  );

  if (loading) {
    return <ActivityIndicator style={styles.loader} size="large" />;
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.itemContainer}
      onPress={() =>
        navigation.navigate("HelpDeskDetail", { questionId: item.id })
      }
    >
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <View
          style={
            item.is_answered ? styles.statusAnswered : styles.statusPending
          }
        >
          <Text style={styles.statusText}>
            {item.is_answered ? "답변 완료" : "대기중"}
          </Text>
        </View>
      </View>
      <Text style={styles.itemDate}>
        {new Date(item.created_at).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={questions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={
          <Text style={styles.emptyText}>등록된 질문이 없습니다.</Text>
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("HelpDeskCreate")}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  itemContainer: {
    backgroundColor: "white",
    padding: 15,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
    elevation: 1,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemTitle: { fontSize: 16, fontWeight: "bold", flex: 1 },
  itemDate: { fontSize: 12, color: "gray", marginTop: 5 },
  emptyText: { textAlign: "center", marginTop: 50, fontSize: 16 },
  statusAnswered: {
    backgroundColor: "#4CAF50",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusPending: {
    backgroundColor: "#FFC107",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusText: { color: "white", fontSize: 12, fontWeight: "bold" },
  fab: {
    position: "absolute",
    right: 30,
    bottom: 30,
    backgroundColor: "#6200ee",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
  },
  fabText: { fontSize: 30, color: "white" },
});

export default HelpDeskListScreen;
