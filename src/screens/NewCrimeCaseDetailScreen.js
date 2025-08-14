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
  Linking,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { supabase } from "../lib/supabaseClient";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import CommentsSection from "../components/CommentsSection";

const { width } = Dimensions.get("window");

function NewCrimeCaseDetailScreen({ route }) {
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const { caseId } = route.params;

  const [caseDetail, setCaseDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const incrementView = async () => {
      if (!caseId) return;

      try {
        const { error: rpcError } = await supabase.rpc('increment_new_crime_case_view', {
          case_id_input: caseId
        });

        if (rpcError) {
          console.error("Failed to increment view count:", rpcError);
        }
      } catch (err) {
        console.error("An unexpected error occurred while incrementing view count:", err);
      }
    };

    incrementView();
  }, [caseId]);


  const fetchCaseDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // ## [CORE MODIFICATION] ##
      // Added `views` to the select query to fetch the view count.
      const { data, error: fetchError } = await supabase
        .from("new_crime_cases")
        .select("id, created_at, title, method, image_urls, link_url, views") // `views` column added
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
      navigation.setOptions({ title: data.title || "사례 상세 정보" });
    } catch (err) {
      setError(err.message || "사례 상세 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [caseId, navigation]);

  useEffect(() => {
    fetchCaseDetail();
  }, [fetchCaseDetail]);

  const sanitizeUrl = (raw) => {
    if (!raw) return "";
    return String(raw).trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "").replace(/\s+/g, "");
  };

  const handleLinkPress = async (rawUrl) => {
    const url = sanitizeUrl(rawUrl);
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert("오류", `이 링크를 열 수 없습니다: ${e.message}`);
    }
  };

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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.kbWrapper}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>{caseDetail.title}</Text>
            <View style={styles.metaContainer}>
              <Text style={styles.date}>
                게시일: {new Date(caseDetail.created_at).toLocaleDateString()}
              </Text>
              {/* ## [CORE MODIFICATION] ## Display the fetched view count */}
              <Text style={styles.date}>
                조회수: {caseDetail.views || 0}
              </Text>
            </View>
          </View>

          <View style={styles.contentContainer}>
            <Text style={styles.content}>{caseDetail.method}</Text>
          </View>

          {Array.isArray(caseDetail.image_urls) && caseDetail.image_urls.length > 0 && (
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

          {caseDetail.link_url && (
            <TouchableOpacity style={styles.linkButton} onPress={() => handleLinkPress(caseDetail.link_url)}>
              <Icon name="link-variant" size={20} color="#fff" />
              <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <CommentsSection postId={caseId} boardType="new_crime_cases" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  kbWrapper: { flex: 1, backgroundColor: "#fff" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f8f9fa",
  },
  errorText: { marginTop: 10, fontSize: 16, color: "#e74c3c", textAlign: "center" },
  emptyText: { fontSize: 16, color: "#7f8c8d" },
  retryButton: {
    marginTop: 20, backgroundColor: "#3d5afe", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5,
  },
  retryButtonText: { color: "white", fontSize: 16 },
  header: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ecf0f1",
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: "#fff",
  },
  title: { fontSize: 22, fontWeight: "bold", color: "#2c3e50", marginBottom: 12 },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  label: { fontSize: 18, fontWeight: "bold", color: "#2c3e50", marginBottom: 8 },
  date: { fontSize: 13, color: "#7f8c8d" },
  contentContainer: { marginBottom: 25, paddingHorizontal: 20, backgroundColor: "#fff" },
  content: { fontSize: 16, lineHeight: 26, color: "#34495e" },
  imageSection: { marginTop: 10, paddingHorizontal: 20, backgroundColor: "#fff" },
  image: {
    width: "100%",
    height: width * 0.8,
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: "#e9ecef",
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3d5afe',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    marginHorizontal: 20,
  },
  linkButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
});

export default NewCrimeCaseDetailScreen;
