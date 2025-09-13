// src/screens/NewCrimeCaseDetailScreen.js
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { supabase } from "../lib/supabaseClient";
import { useNavigation } from "@react-navigation/native";
import CommentsSection from "../components/CommentsSection";
import { useIncrementView } from '../hooks/useIncrementView';
import { AvoidSoftInput } from "react-native-avoid-softinput";
import ImageViewing from "react-native-image-viewing"; // ✅ 추가

const { width } = Dimensions.get("window");

function NewCrimeCaseDetailScreen({ route }) {
  const navigation = useNavigation();
  const { caseId } = route.params;

  const [caseDetail, setCaseDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useIncrementView('new_crime_cases', caseId);

  // ✅ 뷰어 상태
  const [isViewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    AvoidSoftInput.setShouldMimicIOSBehavior(true);
    return () => {
      AvoidSoftInput.setShouldMimicIOSBehavior(false);
    };
  }, []);

  const fetchCaseDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("new_crime_cases")
        .select("id, created_at, title, method, image_urls, link_url, views")
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

  const viewerImages = useMemo(() => {
    if (!Array.isArray(caseDetail?.image_urls)) return [];
    return caseDetail.image_urls.filter(Boolean).map((uri) => ({ uri }));
  }, [caseDetail]);

  const openViewerAt = useCallback((index) => {
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

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
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="always">
        <View style={styles.header}>
          <Text style={styles.title}>{caseDetail.title}</Text>
          <View style={styles.metaContainer}>
            <Text style={styles.date}>게시일: {new Date(caseDetail.created_at).toLocaleDateString()}</Text>
            <Text style={styles.date}>조회수: {caseDetail.views || 0}</Text>
          </View>
        </View>

        <View style={styles.contentContainer}>
          <Text style={styles.content}>{caseDetail.method}</Text>
        </View>

        {!!(Array.isArray(caseDetail.image_urls) && caseDetail.image_urls.length) && (
          <View style={styles.imageSection}>
            <Text style={styles.label}>첨부 사진</Text>
            {caseDetail.image_urls.map((url, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.9}
                onPress={() => openViewerAt(index)}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.image}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {caseDetail.link_url && (
          <TouchableOpacity style={styles.linkButton} onPress={() => handleLinkPress(caseDetail.link_url)}>
            <Icon name="link-variant" size={20} color="#fff" />
            <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
          </TouchableOpacity>
        )}

        <CommentsSection postId={caseId} boardType="new_crime_cases" />
      </ScrollView>

      <ImageViewing
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={isViewerVisible}
        onRequestClose={() => setViewerVisible(false)}
        presentationStyle="fullScreen"
        HeaderComponent={() => (
          <View style={styles.viewerHeader}>
            <TouchableOpacity onPress={() => setViewerVisible(false)} style={styles.viewerCloseBtn}>
              <Icon name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3d5afe",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    marginHorizontal: 20,
  },
  linkButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", marginLeft: 8 },

  // 뷰어 헤더
  viewerHeader: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    paddingTop: 12, paddingHorizontal: 12,
    flexDirection: "row", justifyContent: "flex-end",
  },
  viewerCloseBtn: { padding: 8 },
});

export default NewCrimeCaseDetailScreen;
