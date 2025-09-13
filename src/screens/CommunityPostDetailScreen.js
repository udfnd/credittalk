// src/screens/CommunityPostDetailScreen.js
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  Dimensions,
  Linking,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import CommentsSection from "../components/CommentsSection";
import { useIncrementView } from '../hooks/useIncrementView';
import { AvoidSoftInput } from "react-native-avoid-softinput";
import ImageViewing from "react-native-image-viewing";

const { width } = Dimensions.get("window");

function CommunityPostDetailScreen({ route }) {
  const navigation = useNavigation();
  const { postId, postTitle } = route.params;
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // 이미지 뷰어 상태
  const [isViewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useIncrementView('community_posts', postId);

  useEffect(() => {
    if (postTitle) navigation.setOptions({ title: postTitle });
  }, [postTitle, navigation]);

  useEffect(() => {
    AvoidSoftInput.setShouldMimicIOSBehavior(true);
    return () => {
      AvoidSoftInput.setShouldMimicIOSBehavior(false);
    };
  }, []);

  const fetchPostDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("community_posts_with_author_profile")
        .select(
          "id, title, content, created_at, author_auth_id, author_name, views, image_urls, link_url, views"
        )
        .eq("id", postId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          throw new Error("게시글을 찾을 수 없거나 접근 권한이 없습니다.");
        }
        throw fetchError;
      }
      setPost(data);
    } catch (err) {
      setError(err.message || "게시글 상세 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [postId, user]);

  useEffect(() => {
    fetchPostDetail();
  }, [fetchPostDetail]);

  const sanitizeUrl = (raw) => {
    if (!raw) return "";
    return String(raw)
      .trim()
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
      .replace(/\s+/g, "");
  };

  const handleLinkPress = async (rawUrl) => {
    const url = sanitizeUrl(rawUrl);
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else await Linking.openURL(url);
    } catch (e) {
      Alert.alert("오류", `이 링크를 열 수 없습니다: ${e.message}`);
    }
  };

  const handleDeletePost = async () => {
    if (post?.author_auth_id !== user?.id) {
      Alert.alert("권한 없음", "자신의 글만 삭제할 수 있습니다.");
      return;
    }
    Alert.alert("게시글 삭제", "정말로 이 게시글을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          setIsLoading(true);
          try {
            if (post.image_urls && post.image_urls.length > 0) {
              const filePaths = post.image_urls
                .map((url) => url.split("/post-images/")[1])
                .filter(Boolean);
              if (filePaths.length > 0) {
                const { error: storageError } = await supabase.storage
                  .from("post-images")
                  .remove(filePaths);
                if (storageError) console.warn("Storage 이미지 삭제 실패:", storageError.message);
              }
            }
            const { error: deleteError } = await supabase
              .from("community_posts")
              .delete()
              .eq("id", postId);
            if (deleteError) throw deleteError;

            Alert.alert("삭제 완료", "게시글이 삭제되었습니다.");
            navigation.goBack();
          } catch (err) {
            Alert.alert("삭제 실패", err.message);
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const viewerImages = useMemo(() => {
    if (!Array.isArray(post?.image_urls)) return [];
    return post.image_urls.filter(Boolean).map((uri) => ({ uri }));
  }, [post]);

  const openViewerAt = useCallback((index) => {
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

  const renderImages = () => {
    if (!Array.isArray(post?.image_urls) || post.image_urls.length === 0) return null;
    return (
      <View style={styles.imageSection}>
        <Text style={styles.label}>첨부 사진</Text>
        {post.image_urls.map((url, index) => (
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
    );
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
        <TouchableOpacity onPress={fetchPostDetail} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>게시글 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="always">
        <View style={styles.headerContainer}>
          <Text style={styles.title}>{post.title}</Text>
          {user && post.author_auth_id === user.id && (
            <TouchableOpacity onPress={handleDeletePost} style={styles.deleteButton}>
              <Icon name="delete-outline" size={24} color="#e74c3c" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.metaContainer}>
          <Text style={styles.author}>작성자: {post.author_name || "익명"}</Text>
          <Text style={styles.date}>게시일: {new Date(post.created_at).toLocaleString()}</Text>
          <Text style={styles.date}>조회수: {post.views || 0}</Text>
        </View>

        {renderImages()}

        <View style={styles.contentContainer}>
          <Text style={styles.content}>{post.content || "내용이 없습니다."}</Text>
        </View>

        {post.link_url && (
          <TouchableOpacity style={styles.linkButton} onPress={() => handleLinkPress(post.link_url)}>
            <Icon name="link-variant" size={20} color="#fff" />
            <Text style={styles.linkButtonText}>관련 링크 바로가기</Text>
          </TouchableOpacity>
        )}

        <CommentsSection postId={postId} boardType="community_posts" />
      </ScrollView>

      {/* ✅ 전체화면 이미지 뷰어 (핀치/더블탭 줌 지원) */}
      <ImageViewing
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={isViewerVisible}
        onRequestClose={() => setViewerVisible(false)}
        // iOS에서 전체화면 프레젠테이션
        presentationStyle="fullScreen"
        // 상단 닫기 버튼
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
  centered: {
    flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "#f8f9fa",
  },
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContainer: { paddingBottom: 8 },

  headerContainer: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 10, paddingHorizontal: 20, paddingTop: 20,
  },
  title: {
    fontSize: 24, fontWeight: "bold", color: "#2c3e50", flex: 1, marginRight: 10,
  },
  deleteButton: { padding: 5 },

  metaContainer: {
    flexDirection: "column", marginBottom: 20, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: "#ecf0f1", paddingHorizontal: 20,
  },
  author: { fontSize: 14, color: "#3498db", marginBottom: 5 },
  date: { fontSize: 14, color: "#7f8c8d" },

  imageSection: { marginTop: 10, paddingHorizontal: 20, backgroundColor: "#fff" },
  label: { fontSize: 18, fontWeight: "bold", color: "#2c3e50", marginBottom: 8 },
  image: {
    width: "100%",
    height: width * 0.8,
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: "#e9ecef",
  },

  contentContainer: { marginBottom: 25, paddingHorizontal: 20 },
  content: { fontSize: 16, lineHeight: 26, color: "#34495e", textAlign: "left" },

  errorText: { marginTop: 10, fontSize: 16, color: "#e74c3c", textAlign: "center" },
  emptyText: { fontSize: 16, color: "#7f8c8d" },
  retryButton: {
    marginTop: 20, backgroundColor: "#3d5afe", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5,
  },
  retryButtonText: { color: "white", fontSize: 16 },

  linkButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#3d5afe", paddingVertical: 14, borderRadius: 8, marginTop: 15,
    elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 2,
  },
  linkButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", marginLeft: 8 },

  viewerHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  viewerCloseBtn: { padding: 8 },
});

export default CommunityPostDetailScreen;
