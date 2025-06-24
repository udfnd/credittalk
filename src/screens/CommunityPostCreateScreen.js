// src/screens/CommunityPostCreateScreen.js
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  TouchableOpacity,
  Image,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { launchImageLibrary } from "react-native-image-picker";
import RNBlobUtil from "react-native-blob-util";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function CommunityPostCreateScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // 사진 선택
  const handleChoosePhotos = () => {
    const limit = 3 - photos.length;
    if (limit <= 0) {
      Alert.alert("알림", "사진은 최대 3장까지 등록할 수 있습니다.");
      return;
    }
    launchImageLibrary(
      { mediaType: "photo", selectionLimit: limit, quality: 0.7 },
      (res) => {
        if (res.didCancel) return;
        if (res.errorCode) {
          Alert.alert("오류", `사진 선택 오류: ${res.errorMessage}`);
        } else if (res.assets) {
          setPhotos((p) => [...p, ...res.assets]);
        }
      },
    );
  };

  // 사진 삭제
  const handleRemovePhoto = (uri) =>
    setPhotos((p) => p.filter((x) => x.uri !== uri));

  /**
   * 로컬 URI → Blob-like 객체 생성
   * Android content:// URI 는 fs.stat 으로 변환
   */
  const uriToBlob = async (uri) => {
    let filePath = uri;
    if (Platform.OS === "android" && uri.startsWith("content://")) {
      const stat = await RNBlobUtil.fs.stat(uri);
      filePath = stat.path;
    }
    return RNBlobUtil.wrap(filePath);
  };

  // Supabase 업로드 유틸
  const uploadToSupabase = async (uri, mimeType) => {
    // 1) Blob-like 생성
    const blob = await uriToBlob(uri);

    // 2) 파일명·경로 구성 (보안상 user.id 등으로 고유명 부여)
    const ext = mimeType.split("/")[1] || "jpg";
    const fileName = `${user.id}_${Date.now()}.${ext}`;
    const storagePath = `community-posts/${fileName}`;

    // 3) 업로드
    const { data, error } = await supabase.storage
      .from("post-images")
      .upload(storagePath, blob, { contentType: mimeType });
    if (error) throw new Error(`업로드 실패: ${error.message}`);

    // 4) 퍼블릭 URL 반환
    const { publicUrl } = supabase.storage
      .from("post-images")
      .getPublicUrl(storagePath);
    return publicUrl;
  };

  // 폼 제출
  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!title.trim() || !content.trim()) {
      Alert.alert("입력 오류", "제목과 내용을 모두 입력해주세요.");
      return;
    }
    if (!user) {
      Alert.alert("오류", "로그인 정보가 없습니다.");
      return;
    }

    setIsLoading(true);
    try {
      // 1) 사진이 있으면 업로드
      const urls = [];
      for (const photo of photos) {
        const url = await uploadToSupabase(photo.uri, photo.type);
        urls.push(url);
      }

      // 2) 게시글 테이블에 삽입
      const { error } = await supabase.from("community_posts").insert({
        title: title.trim(),
        content: content.trim(),
        user_id: user.id,
        image_urls: urls.length ? urls : null,
      });
      if (error) throw error;

      Alert.alert("작성 완료", "게시글이 등록되었습니다.");
      navigation.goBack();
    } catch (err) {
      Alert.alert("작성 실패", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>새 게시글 작성</Text>
      <TextInput
        style={styles.input}
        placeholder="제목"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="내용"
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.label}>사진 첨부 (최대 3장)</Text>
      <View style={styles.photoContainer}>
        {photos.map((p) => (
          <View key={p.uri} style={styles.photoWrapper}>
            <Image source={{ uri: p.uri }} style={styles.thumbnail} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemovePhoto(p.uri)}
            >
              <Icon name="close-circle" size={24} color="#e74c3c" />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < 3 && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleChoosePhotos}
          >
            <Icon name="camera-plus" size={30} color="#868e96" />
            <Text style={styles.addButtonText}>사진 추가</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.buttonContainer}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#3d5afe" />
        ) : (
          <Button title="등록하기" onPress={handleSubmit} color="#3d5afe" />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f8f9fa" },
  pageTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    color: "#34495e",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    backgroundColor: "#fff",
  },
  textArea: { height: 150 },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 10 },
  photoContainer: { flexDirection: "row", flexWrap: "wrap" },
  photoWrapper: {
    position: "relative",
    width: 80,
    height: 80,
    marginRight: 10,
    marginBottom: 10,
  },
  thumbnail: { width: "100%", height: "100%", borderRadius: 8 },
  removeButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  addButton: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ced4da",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  addButtonText: { fontSize: 12, color: "#868e96", marginTop: 4 },
  buttonContainer: { marginTop: 20 },
});
