// src/screens/VoiceAnalysisScreen.js
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Platform,
} from "react-native";
import { pick, isCancel, types } from "@react-native-documents/picker";
import { supabase } from "../lib/supabaseClient";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { FFmpegKit } from "ffmpeg-kit-react-native";
import RNFS from "react-native-fs";
import { Buffer } from "buffer"; // Buffer polyfill import

const ResultModal = ({ isVisible, onClose, result }) => {
  if (!result) return null;

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Icon
            name={result.detected ? "alert-circle" : "check-circle"}
            size={50}
            color={result.detected ? "#e74c3c" : "#2ecc71"}
          />
          <Text style={styles.modalTitle}>
            {result.detected ? "주의! 보이스피싱 의심" : "분석 완료"}
          </Text>
          <Text style={styles.modalMessage}>
            {result.detected
              ? "통화 내용에서 보이스피싱 의심 단어가 감지되었습니다. 금전이나 재화를 요구했다면 즉시 관계 기관에 신고하세요."
              : "통화 내용에서 특별한 위험 단어가 감지되지 않았습니다."}
          </Text>
          {result.detected && result.keywords?.length > 0 && (
            <View>
              <Text style={styles.detectedKeywordsTitle}>감지된 단어:</Text>
              <Text style={styles.detectedKeywords}>
                {result.keywords.join(", ")}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

function VoiceAnalysisScreen({ navigation }) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [result, setResult] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleFilePickAndAnalyze = useCallback(async () => {
    try {
      // 1. 파일 선택
      const [res] = await pick({
        type: [types.audio],
      });

      if (!res) return;

      setIsLoading(true);
      setResult(null);
      setLoadingMessage("오디오 파일 변환 중...");

      const originalUri = res.uri;
      const outputName = `${Date.now()}.wav`;
      const outputPath = `${RNFS.CachesDirectoryPath}/${outputName}`;

      // 2. FFmpeg를 사용하여 WAV로 변환
      console.log(`[FFmpeg] 변환 시작: ${originalUri} -> ${outputPath}`);
      const session = await FFmpegKit.execute(
        `-y -i "${originalUri}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`,
      );
      const returnCode = await session.getReturnCode();

      if (!returnCode.isValueSuccess()) {
        const logs = await session.getOutput();
        throw new Error(`FFmpeg 변환 실패. 로그: ${logs}`);
      }
      console.log("[FFmpeg] 변환 성공.");

      // 3. 변환된 WAV 파일 Supabase에 업로드
      setLoadingMessage("파일 업로드 중...");
      const filePath = `voice-files/${outputName}`;

      // --- [핵심 수정] ---
      // RNFS로 읽는 대신, fetch API를 사용하여 파일을 Blob으로 만듭니다.
      // 이것이 다른 화면에서도 사용된 가장 안정적인 방식입니다.
      const fileUriForUpload =
        Platform.OS === "android" ? `file://${outputPath}` : outputPath;
      const response = await fetch(fileUriForUpload);
      const blob = await response.blob();

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("voice-analysis")
        .upload(filePath, blob, {
          contentType: "audio/wav",
          upsert: true, // 덮어쓰기 허용
        });

      if (uploadError) throw uploadError;
      console.log("[Supabase] 파일 업로드 성공:", uploadData.path);

      // 업로드 후 변환된 로컬 파일 삭제
      await RNFS.unlink(outputPath);
      console.log(`[Local] 임시 파일 삭제 완료: ${outputPath}`);

      // 4. Supabase Edge Function 호출
      setLoadingMessage("AI가 통화 내용을 분석 중입니다...");
      const { data: functionData, error: functionError } =
        await supabase.functions.invoke("analyze-audio-file", {
          body: { filePath },
        });

      if (functionError) {
        throw new Error(
          functionError.context?.errorMessage || functionError.message,
        );
      }

      console.log(
        "[Supabase] 함수 호출 성공. 분석 결과:",
        JSON.stringify(functionData, null, 2),
      );
      setResult(functionData);
      setIsModalVisible(true);
    } catch (err) {
      if (isCancel(err)) {
        console.log("파일 선택이 사용자에 의해 취소되었습니다.");
      } else {
        console.error("분석 과정 중 에러 발생:", err);
        Alert.alert("오류 발생", err.message);
      }
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  }, []);

  return (
    <View style={styles.container}>
      <Icon
        name="phone-voice-outline"
        size={80}
        color="#3d5afe"
        style={styles.icon}
      />
      <Text style={styles.title}>통화 녹음 파일 분석</Text>
      <Text style={styles.description}>
        보이스피싱이 의심되는 통화의 녹음 파일을 업로드하여 AI로 분석합니다.
        파일은 분석 즉시 서버에서 삭제됩니다.
      </Text>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3d5afe" />
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleFilePickAndAnalyze}
        >
          <Icon name="file-upload-outline" size={24} color="white" />
          <Text style={styles.actionButtonText}>녹음 파일 선택 및 분석</Text>
        </TouchableOpacity>
      )}

      <ResultModal
        isVisible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        result={result}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f8f9fa",
  },
  icon: { marginBottom: 20 },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#343a40",
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    color: "#6c757d",
    marginBottom: 30,
  },
  actionButton: {
    flexDirection: "row",
    backgroundColor: "#3d5afe",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 30,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  actionButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
  },
  loadingContainer: {
    alignItems: "center",
    marginVertical: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#3d5afe",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    width: "85%",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginVertical: 10 },
  modalMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 15,
    lineHeight: 24,
  },
  detectedKeywordsTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#34495e",
    marginBottom: 5,
    textAlign: "center",
  },
  detectedKeywords: {
    fontSize: 14,
    color: "#e74c3c",
    marginBottom: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  closeButton: {
    backgroundColor: "#3d5afe",
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 5,
  },
  closeButtonText: { color: "white", fontSize: 16 },
});

export default VoiceAnalysisScreen;
