// src/screens/NoticeDetailScreen.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
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

const { width } = Dimensions.get("window");

function NoticeDetailScreen({ route, navigation }) {
  const { noticeId, noticeTitle } = route.params;
  const [notice, setNotice] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (noticeTitle) {
      navigation.setOptions({ title: noticeTitle });
    }
  }, [noticeTitle, navigation]);

  const fetchNoticeDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("notices")
        .select(
          "id, title, content, created_at, author_name, image_urls, link_url", // image_url을 image_urls로 변경
        )
        .eq("id", noticeId)
        .eq("is_published", true)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          // Not found
          throw new Error("공지사항을 찾을 수 없거나 접근 권한이 없습니다.");
        }
        throw fetchError;
      }
      setNotice(data);
    } catch (err) {
      setError(err.message || "공지사항 상세 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [noticeId]);

  useEffect(() => {
    fetchNoticeDetail();
  }, [fetchNoticeDetail]);

  const handleLinkPress = () => {
    if (notice?.link_url) {
      Linking.openURL(notice.link_url).catch(() =>
        Alert.alert("오류", "링크를 열 수 없습니다."),
      );
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
        <TouchableOpacity
          onPress={fetchNoticeDetail}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!notice) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>공지사항 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainerScrollView}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{notice.title}</Text>
        <View style={styles.metaContainer}>
          {notice.author_name && (
            <Text style={styles.author}>작성자: {notice.author_name}</Text>
          )}
          <Text style={styles.date}>
            게시일: {new Date(notice.created_at).toLocaleDateString()}
          </Text>
        </View>
      </View>

      {/* 이미지 렌더링 수정: notice.image_urls 배열을 순회하며 Image 컴포넌트 렌더링 */}
      {notice.image_urls && notice.image_urls.length > 0 && (
        <View style={styles.imageSection}>
          {notice.image_urls.slice(0, 3).map((url, index) => (
            <Image
              key={index}
              source={{ uri: url }}
              style={styles.mainImage}
              resizeMode="contain"
            />
          ))}
        </View>
      )}

      <View style={styles.contentWrapper}>
        <Text style={styles.content}>
          {notice.content || "내용이 없습니다."}
        </Text>
      </View>

      {notice.link_url && (
        <TouchableOpacity style={styles.linkButton} onPress={handleLinkPress}>
          <Icon name="link-variant" size={20} color="white" />
          <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  contentContainerScrollView: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 10,
  },
  metaContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ecf0f1",
  },
  author: {
    fontSize: 14,
    color: "#7f8c8d",
  },
  date: {
    fontSize: 14,
    color: "#7f8c8d",
  },
  // 이미지 섹션 스타일 추가
  imageSection: {
    marginBottom: 20,
  },
  mainImage: {
    width: "100%",
    height: width * 0.6,
    borderRadius: 8,
    marginBottom: 15, // 이미지 간 간격
    backgroundColor: "#e9ecef",
  },
  contentWrapper: {
    marginTop: 10,
  },
  content: {
    fontSize: 16,
    lineHeight: 26,
    color: "#34495e",
    textAlign: "left",
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
    marginBottom: 30,
    backgroundColor: "#3d5afe",
    borderRadius: 8,
    paddingVertical: 14,
    elevation: 2,
  },
  linkButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
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
  retryButtonText: {
    color: "white",
    fontSize: 16,
  },
});

export default NoticeDetailScreen;
