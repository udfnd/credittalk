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
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { launchImageLibrary } from "react-native-image-picker";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

function CommunityPostCreateScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleChoosePhotos = () => {
    const selectionLimit = 3 - photos.length;
    if (selectionLimit <= 0) {
      Alert.alert("알림", "사진은 최대 3장까지 등록할 수 있습니다.");
      return;
    }

    launchImageLibrary(
      { mediaType: "photo", selectionLimit, quality: 0.7 },
      (response) => {
        if (response.didCancel) return;
        if (response.errorCode) {
          Alert.alert("오류", `사진 선택 오류: ${response.errorMessage}`);
        } else if (response.assets && response.assets.length > 0) {
          setPhotos((prevPhotos) => [...prevPhotos, ...response.assets]);
        }
      },
    );
  };

  const handleRemovePhoto = (uri) => {
    setPhotos((prevPhotos) => prevPhotos.filter((photo) => photo.uri !== uri));
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!title.trim() || !content.trim()) {
      Alert.alert("입력 오류", "제목과 내용을 모두 입력해주세요.");
      return;
    }
    if (!user) {
      Alert.alert("오류", "로그인 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const imageUrls = [];
      if (photos.length > 0) {
        for (const photo of photos) {
          const fileExt = photo.uri.split(".").pop();
          const fileName = `${user.id}_${Date.now()}.${fileExt}`;
          const filePath = `community-posts/${fileName}`;

          const response = await fetch(photo.uri);
          const blob = await response.blob();

          const { data, error: uploadError } = await supabase.storage
            .from("post-images")
            .upload(filePath, blob, { contentType: photo.type });

          if (uploadError) {
            throw new Error(`사진 업로드 실패: ${uploadError.message}`);
          }

          const { data: urlData } = supabase.storage
            .from("post-images")
            .getPublicUrl(data.path);
          imageUrls.push(urlData.publicUrl);
        }
      }

      const { error } = await supabase.from("community_posts").insert({
        title: title.trim(),
        content: content.trim(),
        user_id: user.id,
        image_urls: imageUrls.length > 0 ? imageUrls : null,
      });

      if (error) throw error;

      Alert.alert("작성 완료", "게시글이 성공적으로 등록되었습니다.");
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        "작성 실패",
        err.message || "게시글 등록 중 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>새 게시글 작성</Text>
      <TextInput
        style={styles.input}
        placeholder="제목을 입력하세요"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="내용을 입력하세요"
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={10}
        textAlignVertical="top"
      />

      <Text style={styles.label}>사진 첨부 (최대 3장)</Text>
      <View style={styles.photoContainer}>
        {photos.map((photo) => (
          <View key={photo.uri} style={styles.photoWrapper}>
            <Image source={{ uri: photo.uri }} style={styles.thumbnail} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemovePhoto(photo.uri)}
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
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f8f9fa",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 25,
    color: "#34495e",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#495057",
    marginBottom: 10,
    marginTop: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ced4da",
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderRadius: 8,
    backgroundColor: "white",
    fontSize: 16,
    color: "#212529",
  },
  textArea: {
    minHeight: 200,
    textAlignVertical: "top",
  },
  photoContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  photoWrapper: {
    position: "relative",
    width: 100,
    height: 100,
    marginRight: 10,
    marginBottom: 10,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#e9ecef",
  },
  removeButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "white",
    borderRadius: 12,
  },
  addButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#e9ecef",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ced4da",
    borderStyle: "dashed",
  },
  addButtonText: {
    fontSize: 12,
    color: "#868e96",
    marginTop: 4,
  },
  buttonContainer: {
    marginTop: 20,
    marginBottom: 40,
  },
});

export default CommunityPostCreateScreen;
