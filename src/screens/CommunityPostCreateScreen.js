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
import RNBlobUtil from "react-native-blob-util"; // 파일 래핑
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function CommunityPostCreateScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

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
          setPhotos((prev) => [...prev, ...res.assets]);
        }
      },
    );
  };

  const handleRemovePhoto = (uri) =>
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));

  /**
   * 로컬 URI를 네이티브 파일 경로로 변환
   */
  const getFilePath = async (uri) => {
    if (Platform.OS === "android" && uri.startsWith("content://")) {
      const stat = await RNBlobUtil.fs.stat(uri);
      return stat.path;
    }
    if (uri.startsWith("file://")) {
      return uri.replace("file://", "");
    }
    return uri;
  };

  /**
   * Supabase에 파일 업로드 (RNBlobUtil.wrap 사용)
   */
  const uploadToSupabase = async (photo) => {
    let path = await getFilePath(photo.uri);
    // RNBlobUtil.wrap으로 파일 객체 래핑
    const fileWrapper = RNBlobUtil.wrap(path);

    const ext = photo.type.split("/")[1] || "jpg";
    const fileName = `${user.id}_${Date.now()}.${ext}`;
    const storagePath = `community-posts/${fileName}`;

    // 직접 래핑 객체를 전달하여 업로드
    const { data, error } = await supabase.storage
      .from("post-images")
      .upload(storagePath, fileWrapper, {
        contentType: photo.type,
        upsert: false,
      });
    if (error) throw new Error(`사진 업로드 실패: ${error.message}`);

    const { publicUrl, error: urlError } = supabase.storage
      .from("post-images")
      .getPublicUrl(storagePath);
    if (urlError) throw new Error(`URL 가져오기 실패: ${urlError.message}`);
    return publicUrl;
  };

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
      const imageUrls = await Promise.all(
        photos.map((p) => uploadToSupabase(p)),
      );
      const { error } = await supabase.from("community_posts").insert({
        title: title.trim(),
        content: content.trim(),
        user_id: user.id,
        image_urls: imageUrls.length ? imageUrls : null,
      });
      if (error) throw error;

      Alert.alert("작성 완료", "게시글이 성공적으로 등록되었습니다.");
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
      />

      <Text style={styles.label}>사진 첨부 (최대 3장)</Text>
      <View style={styles.photoContainer}>
        {photos.map((p) => (
          <View key={p.uri} style={styles.photoWrapper}>
            <Image source={{ uri: p.uri }} style={styles.thumbnail} />
            <TouchableOpacity onPress={() => handleRemovePhoto(p.uri)}>
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
          <ActivityIndicator />
        ) : (
          <Button title="등록하기" onPress={handleSubmit} />
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
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  textArea: { height: 150, textAlignVertical: "top" },
  label: { fontSize: 16, marginBottom: 10 },
  photoContainer: { flexDirection: "row", flexWrap: "wrap" },
  photoWrapper: {
    position: "relative",
    width: 80,
    height: 80,
    marginRight: 10,
    marginBottom: 10,
  },
  thumbnail: { width: "100%", height: "100%", borderRadius: 8 },
  addButton: {
    width: 80,
    height: 80,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  addButtonText: { fontSize: 12, color: "#868e96", marginTop: 4 },
  buttonContainer: { marginTop: 20 },
});
