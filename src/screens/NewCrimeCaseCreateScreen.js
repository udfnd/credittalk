// src/screens/NewCrimeCaseCreateScreen.js
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
import RNBlobUtil from "react-native-blob-util"; // ✅ react-native-blob-util
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function NewCrimeCaseCreateScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [method, setMethod] = useState("");
  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // 사진 선택 핸들러
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
          setPhotos((prev) => [...prev, ...response.assets]);
        }
      },
    );
  };

  // 사진 제거 핸들러
  const handleRemovePhoto = (uri) => {
    setPhotos((prev) => prev.filter((photo) => photo.uri !== uri));
  };

  /**
   * 로컬 URI -> Blob-like 객체 생성
   * Android의 content:// URI 처리
   */
  const uriToBlob = async (uri) => {
    let filePath = uri;
    if (Platform.OS === "android" && uri.startsWith("content://")) {
      const stat = await RNBlobUtil.fs.stat(uri);
      filePath = stat.path;
    }
    return RNBlobUtil.wrap(filePath);
  };

  /**
   * Blob-like 객체 업로드 후 publicUrl 반환
   */
  const uploadToSupabase = async (uri, mimeType) => {
    // 1) Blob-like 객체 생성
    const blob = await uriToBlob(uri);
    // 2) 파일명/경로 구성
    const ext = mimeType.split("/")[1] || "jpg";
    const fileName = `${user.id}_${Date.now()}.${ext}`;
    const storagePath = `new-crime-cases/${fileName}`;

    // 3) Supabase Storage 업로드
    const { data, error } = await supabase.storage
      .from("post-images")
      .upload(storagePath, blob, { contentType: mimeType });
    if (error) throw new Error(`사진 업로드 실패: ${error.message}`);

    // 4) 퍼블릭 URL 얻기
    const { publicUrl } = supabase.storage
      .from("post-images")
      .getPublicUrl(storagePath);
    return publicUrl;
  };

  // 폼 제출 핸들러
  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!method.trim()) {
      Alert.alert("입력 오류", "범죄 수법을 입력해주세요.");
      return;
    }
    if (!user) {
      Alert.alert("오류", "로그인 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      // 1) 사진이 있으면 업로드
      const imageUrls = [];
      for (const photo of photos) {
        const url = await uploadToSupabase(photo.uri, photo.type);
        imageUrls.push(url);
      }

      // 2) 데이터베이스에 삽입
      const { error } = await supabase.from("new_crime_cases").insert({
        method: method.trim(),
        user_id: user.id,
        image_urls: imageUrls.length > 0 ? imageUrls : null,
      });
      if (error) throw error;

      Alert.alert("작성 완료", "사례가 성공적으로 등록되었습니다.");
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        "작성 실패",
        err.message || "사례 등록 중 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>신종 범죄 수법 등록</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="알고 계신 신종 범죄 수법이나 피해 사례를 자유롭게 작성해주세요."
        value={method}
        onChangeText={setMethod}
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
    marginTop: 30,
    marginBottom: 40,
  },
});
