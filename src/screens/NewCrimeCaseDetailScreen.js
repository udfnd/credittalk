// src/screens/NewCrimeCaseDetailScreen.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { supabase } from "../lib/supabaseClient";
import { useNavigation } from "@react-navigation/native";
import CommentsSection from "../components/CommentsSection";

const { width } = Dimensions.get("window");

function NewCrimeCaseDetailScreen({ route }) {
  const navigation = useNavigation();
  const { caseId } = route.params;

  const [caseDetail, setCaseDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    navigation.setOptions({ title: "사례 상세 정보" });
  }, [navigation]);

  const fetchCaseDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("new_crime_cases")
        .select("id, created_at, method, image_urls")
        .eq("id", caseId)
        .eq("is_published", true)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          throw new Error("사례를 찾을 수 없거나 접근 권한이 없습니다.");
        }
        throw fetchError;
      }
      setCaseDetail(data);
    } catch (err) {
      setError(err.message || "사례 상세 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchCaseDetail();
  }, [fetchCaseDetail]);

  if (isLoading) {
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
        <TouchableOpacity onPress={fetchCaseDetail} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!caseDetail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>사례 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.header}>
        <Text style={styles.label}>범죄 수법</Text>
        <Text style={styles.date}>
          게시일: {new Date(caseDetail.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.content}>{caseDetail.method}</Text>
      </View>

      {Array.isArray(caseDetail.image_urls) &&
        caseDetail.image_urls.length > 0 && (
          <View style={styles.imageSection}>
            <Text style={styles.label}>첨부 사진</Text>
            {caseDetail.image_urls.map((url, index) => (
              <Image
                key={index}
                source={{ uri: url }}
                style={styles.image}
                resizeMode="contain"
              />
            ))}
          </View>
        )}
        <CommentsSection postId={caseId} boardType="new_crime_cases" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f8f9fa",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ecf0f1",
  },
  label: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 8,
  },
  date: {
    fontSize: 13,
    color: "#7f8c8d",
    textAlign: "right",
  },
  contentContainer: {
    marginBottom: 25,
  },
  content: {
    fontSize: 16,
    lineHeight: 26,
    color: "#34495e",
  },
  imageSection: {
    marginTop: 10,
  },
  image: {
    width: "100%",
    height: width * 0.8,
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: "#e9ecef",
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: "#e74c3c",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#7f8c8d",
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: "#3d5afe",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: { color: "white", fontSize: 16 },
});

export default NewCrimeCaseDetailScreen;
