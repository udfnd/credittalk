// src/screens/NewCrimeCaseListScreen.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { logPageView } from "../lib/pageViewLogger";

function NewCrimeCaseListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 로그인한 사용자만 기록합니다.
    if (user) {
      logPageView(user.id, 'NewCrimeCaseListScreen');
    }
  }, [user]);

  const fetchCases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("new_crime_cases")
        .select("id, created_at, method")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setCases(data || []);
    } catch (err) {
      console.error("Error in fetchCases:", err);
      setError(err.message || "데이터를 불러오는데 실패했습니다.");
      setCases([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      fetchCases();
    }
  }, [fetchCases, isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCases();
  }, [fetchCases]);

  const handleCreateCase = () => {
    if (!user) {
      Alert.alert("로그인 필요", "글을 작성하려면 로그인이 필요합니다.", [
        { text: "로그인", onPress: () => navigation.navigate("SignIn") },
        { text: "취소", style: "cancel" },
      ]);
      return;
    }
    navigation.navigate("NewCrimeCaseCreate");
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.caseItem}
      onPress={() =>
        navigation.navigate("NewCrimeCaseDetail", { caseId: item.id })
      }
    >
      <Text style={styles.caseText} numberOfLines={3}>
        {item.method}
      </Text>
      <View style={styles.itemFooter}>
        <Text style={styles.caseDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
        <Icon name="chevron-right" size={20} color="#7f8c8d" />
      </View>
    </TouchableOpacity>
  );

  if (isLoading && !refreshing && cases.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={50} color="#e74c3c" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchCases} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={cases}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.centered}>
              <Icon name="alert-decagram-outline" size={50} color="#bdc3c7" />
              <Text style={styles.emptyText}>등록된 사례가 없습니다.</Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#3d5afe"]}
          />
        }
      />
      <TouchableOpacity style={styles.fab} onPress={handleCreateCase}>
        <Icon name="plus" size={30} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f2f5",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  listContainer: {
    padding: 15,
  },
  caseItem: {
    backgroundColor: "#ffffff",
    padding: 15,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: "#e74c3c",
    elevation: 2,
    justifyContent: "space-between",
    minHeight: 100,
  },
  caseText: {
    fontSize: 16,
    color: "#34495e",
    lineHeight: 24,
    flex: 1,
  },
  itemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  caseDate: {
    fontSize: 12,
    color: "#7f8c8d",
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: "#e74c3c",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: "#7f8c8d",
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 10,
    bottom: 10,
    backgroundColor: "#3d5afe",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: "#3d5afe",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: "white",
    fontSize: 16,
  },
});

export default NewCrimeCaseListScreen;
