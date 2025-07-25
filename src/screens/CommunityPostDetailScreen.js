// src/screens/CommunityPostDetailScreen.js
import React, { useState, useEffect, useCallback } from "react";
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
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import CommentsSection from "../components/CommentsSection";

const { width } = Dimensions.get("window");

function CommunityPostDetailScreen({ route }) {
  const navigation = useNavigation();
  const { postId, postTitle } = route.params;
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (postTitle) {
      navigation.setOptions({ title: postTitle });
    }
  }, [postTitle, navigation]);

  const fetchPostDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("community_posts_with_author_profile")
        .select(
          "id, title, content, created_at, author_auth_id, author_name, views, image_urls",
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

      if (data && data.author_auth_id !== user?.id) {
        const { error: rpcError } = await supabase.rpc("increment_post_view", {
          post_id_input: postId,
        });
        if (rpcError)
          console.error("Failed to increment view count:", rpcError);
      }
    } catch (err) {
      console.error("Error in fetchPostDetail:", err);
      setError(err.message || "게시글 상세 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [postId, user]);

  useEffect(() => {
    fetchPostDetail();
  }, [fetchPostDetail]);

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
            // --- (수정된 부분) ---
            // 1. Storage에서 실제 경로를 기반으로 이미지들을 삭제합니다.
            if (post.image_urls && post.image_urls.length > 0) {
              const filePaths = post.image_urls.map(url => {
                // Public URL에서 버킷 이름 뒷부분의 경로(폴더 포함)를 정확히 추출합니다.
                // 예: 'community-posts/image-001.png'
                const path = url.split('/post-images/')[1];
                return path;
              });

              const { error: storageError } = await supabase.storage
                .from('post-images') // 실제 버킷 이름: 'post-images'
                .remove(filePaths);

              if (storageError) {
                // Storage에서 파일 삭제에 실패하더라도 DB 삭제는 시도하도록 throw하지 않습니다.
                console.warn('Storage 이미지 삭제 실패:', storageError.message);
              }
            }

            // 2. 데이터베이스에서 게시글 레코드를 삭제합니다.
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

  const handleScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    setCurrentImageIndex(index);
  };

  const renderImages = () => {
    if (!post?.image_urls || post.image_urls.length === 0) {
      return null;
    }

    return (
      <View style={styles.imageGalleryContainer}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {post.image_urls.map((url, index) => (
            <Image
              key={index}
              source={{ uri: url }}
              style={styles.galleryImage}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
        {post.image_urls.length > 1 && (
          <View style={styles.indicatorContainer}>
            {post.image_urls.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.indicator,
                  index === currentImageIndex ? styles.activeIndicator : null,
                ]}
              />
            ))}
          </View>
        )}
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
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>{post.title}</Text>
          {user && post.author_auth_id === user.id && (
            <TouchableOpacity
              onPress={handleDeletePost}
              style={styles.deleteButton}
            >
              <Icon name="delete-outline" size={24} color="#e74c3c" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.metaContainer}>
          <Text style={styles.author}>작성자: {post.author_name || "익명"}</Text>
          <Text style={styles.date}>
            게시일: {new Date(post.created_at).toLocaleString()}
          </Text>
        </View>

        {renderImages()}

        <View style={styles.contentContainer}>
          <Text style={styles.content}>{post.content || "내용이 없습니다."}</Text>
        </View>

        <CommentsSection postId={postId} boardType="community_posts" />
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
    backgroundColor: '#f8f9fa',
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContainer: {
    paddingBottom: 40,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2c3e50",
    flex: 1,
    marginRight: 10,
  },
  deleteButton: {
    padding: 5
  },
  metaContainer: {
    flexDirection: "column",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ecf0f1",
    paddingHorizontal: 20,
  },
  author: {
    fontSize: 14,
    color: "#3498db",
    marginBottom: 5
  },
  date: {
    fontSize: 14,
    color: "#7f8c8d"
  },
  imageGalleryContainer: {
    width: width,
    height: width * 0.75,
    marginBottom: 20,
  },
  galleryImage: {
    width: width,
    height: '100%',
    backgroundColor: '#e9ecef',
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 10,
    width: '100%',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    marginHorizontal: 4,
  },
  activeIndicator: {
    backgroundColor: '#fff',
  },
  contentContainer: {
    marginBottom: 25,
    paddingHorizontal: 20,
  },
  content: {
    fontSize: 16,
    lineHeight: 26,
    color: "#34495e",
    textAlign: "justify",
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: "#e74c3c",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#7f8c8d"
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
    fontSize: 16
  },
});

export default CommunityPostDetailScreen;
