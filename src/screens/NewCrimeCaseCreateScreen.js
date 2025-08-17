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
import { Buffer } from "buffer";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function NewCrimeCaseCreateScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [method, setMethod] = useState("");
  const [category, setCategory] = useState(""); // <-- 1. 카테고리 state 추가
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

  const handleRemovePhoto = (uri) => {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  };

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

  const uploadToSupabase = async (photo) => {
    const path = await getFilePath(photo.uri);
    const base64Data = await RNBlobUtil.fs.readFile(path, "base64");
    const arrayBuffer = Buffer.from(base64Data, "base64");
    const ext = photo.fileName?.split(".").pop() || "jpg";
    const fileName = `${user.id}_${Date.now()}.${ext}`;
    const storagePath = `new-crime-cases/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("post-images")
      .upload(storagePath, arrayBuffer, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`사진 업로드 실패: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from("post-images")
      .getPublicUrl(storagePath);

    if (!urlData || !urlData.publicUrl) {
      throw new Error("URL 생성에 실패했습니다.");
    }

    return urlData.publicUrl;
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!title.trim()) {
      Alert.alert("입력 오류", "제목을 입력해주세요.");
      return;
    }
    if (!method.trim()) {
      Alert.alert("입력 오류", "범죄 수법 및 내용을 입력해주세요.");
      return;
    }
    if (!user) {
      Alert.alert("오류", "로그인 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const imageUrls = await Promise.all(
        photos.map((p) => uploadToSupabase(p)),
      );

      const { error } = await supabase.from("new_crime_cases").insert({
        title: title.trim(),
        method: method.trim(),
        category: category.trim() || null, // category 추가
        user_id: user.id,
        image_urls: imageUrls.length ? imageUrls : null,
      });
      if (error) throw error;

      Alert.alert("작성 완료", "사례가 성공적으로 등록되었습니다.");
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        "작성 실패",
        err.message || "알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>신종 범죄 수법 등록</Text>
      <Text style={styles.label}>제목</Text>
      <TextInput
        style={styles.input}
        placeholder="사건의 특징을 요약하는 제목을 입력하세요."
        placeholderTextColor="#6c757d"
        value={title}
        onChangeText={setTitle}
        maxLength={50}
      />
      <Text style={styles.label}>카테고리</Text>
      <TextInput
        style={styles.input}
        placeholder="예) 보이스피싱, 중고거래 사기, 스미싱"
        placeholderTextColor="#6c757d"
        value={category}
        onChangeText={setCategory}
        maxLength={20}
      />
      <Text style={styles.label}>범죄 수법 및 내용</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="알고 계신 신종 범죄 수법이나 피해 사례를 자유롭게 작성해주세요."
        placeholderTextColor="#6c757d"
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
    marginTop: 20,
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
