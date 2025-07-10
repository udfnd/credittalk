import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { pick, types } from "@react-native-documents/picker";
import { supabase } from "../lib/supabaseClient";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useAuth } from "../context/AuthContext";
import RNBlobUtil from "react-native-blob-util";
import { decode } from "base64-arraybuffer";
import { useNavigation } from "@react-navigation/native";

const ResultModal = ({ isVisible, onClose, result, navigation }) => {
  if (!result) return null;
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeIcon} onPress={onClose}>
              <Icon name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Icon
              name={
                result.status === "completed" && result.detected
                  ? "alert-circle"
                  : result.status === "completed"
                    ? "check-circle"
                    : "alert-octagon"
              }
              size={50}
              color={
                result.status === "completed" && result.detected
                  ? "#e74c3c"
                  : result.status === "completed"
                    ? "#2ecc71"
                    : "#f39c12"
              }
            />
            <Text style={styles.modalTitle}>
              {result.status === "completed" && result.detected
                ? "주의! 보이스피싱 의심"
                : result.status === "completed"
                  ? "분석 완료"
                  : "분석 오류"}
            </Text>
            <Text style={styles.modalMessage}>
              {result.status === "error"
                ? `분석 중 오류가 발생했습니다: ${result.error_message}`
                : result.detected
                  ? "통화내용에서 금융사기 의심단어가 감지되었습니다. 일면식이 없는 사람이라면 개인정보, 금전거래를 급하게 하지마세요."
                  : "통화 내용에서 특별한 위험 단어가 감지되지 않았습니다."}
            </Text>
            {result.status === "completed" && result.detected && (
              <TouchableOpacity
                style={styles.analysisRequestButton}
                onPress={() => {
                  onClose(); // 모달을 닫고
                  navigation.navigate("MainApp", {
                    screen: "HelpCenterTab",
                    params: {
                      screen: "HelpDeskCreate",
                    },
                  });
                }}
              >
                <Text style={styles.analysisRequestButtonText}>
                  사기인지 분석을 의뢰하시겠습니까?
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

export default function VoiceAnalysisScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [result, setResult] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [analysisId, setAnalysisId] = useState(null);

  // 실시간 결과 구독
  useEffect(() => {
    if (!analysisId) return;
    const channel = supabase
      .channel(`analysis-result-${analysisId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "audio_analysis_results",
          filter: `id=eq.${analysisId}`,
        },
        (payload) => {
          const { new: newResult } = payload;
          if (["completed", "error"].includes(newResult.status)) {
            setResult({
              detected: newResult.detected_keywords?.length > 0,
              keywords: newResult.detected_keywords,
              status: newResult.status,
              error_message: newResult.error_message,
              transcribed_text: newResult.transcribed_text,
            });
            setIsLoading(false);
            setIsModalVisible(true);
            setAnalysisId(null);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log(`[REALTIME] Subscribed to channel for analysisId: ${analysisId}`);
        } else {
          console.log("[REALTIME] Subscription failed:", status, err);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [analysisId]);

  const getPathForSafeUpload = async (uri, fileCopyUri) => {
    if (Platform.OS === "android") {
      if (fileCopyUri) {
        return fileCopyUri.replace("file://", "");
      }
      if (uri.startsWith("content://")) {
        try {
          const stat = await RNBlobUtil.fs.stat(uri);
          if (stat.path) {
            return stat.path;
          }
        } catch (e) {
          console.warn("stat 변환 실패:", e);
        }
        return uri;
      }
    }
    return uri.replace("file://", "");
  };

  const handleFilePickAndAnalyze = useCallback(async () => {
    if (!user) {
      Alert.alert("로그인 필요", "파일을 분석하려면 로그인이 필요합니다.");
      return;
    }

    try {
      const documents = await pick({ type: [types.audio] });
      if (!documents?.length) return; // 취소 시
      const res = documents[0];

      if (!res.uri) {
        Alert.alert("파일 처리 오류", "선택한 파일의 경로를 가져올 수 없습니다.");
        return;
      }

      setIsLoading(true);
      setResult(null);
      setLoadingMessage("파일 경로 변환 중...");

      const path = await getPathForSafeUpload(res.uri, res.fileCopyUri);
      if (!path) {
        throw new Error("파일 경로를 변환할 수 없습니다.");
      }

      setLoadingMessage("파일 읽는 중...");
      const base64Data = await RNBlobUtil.fs.readFile(path, "base64");

      const arrayBuffer = decode(base64Data);

      const fileExt = res.name?.split(".").pop() || "m4a";
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `voice-uploads/${fileName}`;
      setLoadingMessage("파일 업로드 중...");
      const { error: uploadError } = await supabase.storage
        .from("voice-analysis")
        .upload(filePath, arrayBuffer, {
          contentType: res.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      setLoadingMessage("AI 분석 요청 중...");
      const { data: analysisRecord, error: insertError } = await supabase
        .from("audio_analysis_results")
        .insert({
          user_id: user.id,
          storage_path: filePath,
          status: "pending",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      // 8) Edge Function 트리거
      setAnalysisId(analysisRecord.id);
      const { error: functionError } = await supabase.functions.invoke(
        "trigger-audio-analysis",
        { body: { analysisId: analysisRecord.id, filePath } }
      );
      if (functionError) {
        // 실패 시 상태 업데이트
        await supabase
          .from("audio_analysis_results")
          .update({ status: "error", error_message: functionError.message })
          .eq("id", analysisRecord.id);
        throw new Error(functionError.context?.errorMessage || functionError.message);
      }

      setLoadingMessage("파일 분석이 시작되었습니다. 화면을 나가지 마세요.");
    } catch (err) {
      console.error("Analysis Error:", err);
      Alert.alert("오류 발생", err.message || "알 수 없는 오류가 발생했습니다.");
      setIsLoading(false);
      setLoadingMessage("");
    }
  }, [user]);

  return (
    <View style={styles.container}>
      <Icon name="phone-voice-outline" size={80} color="#3d5afe" style={styles.icon} />
      <Text style={styles.title}>AI 통화 녹음 분석</Text>
      <Text style={styles.description}>
        보이스피싱이 의심되는 통화의 녹음 파일을 업로드하여 AI로 분석합니다. 지원 형식: m4a, mp3,
        wav 등
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
        navigation={navigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "#f8f9fa" },
  icon: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 10, color: "#343a40" },
  description: { fontSize: 16, textAlign: "center", color: "#6c757d", marginBottom: 30, lineHeight: 24 },
  actionButton: {
    flexDirection: "row",
    backgroundColor: "#3d5afe",
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 30,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  actionButtonText: { color: "white", fontSize: 18, fontWeight: "bold", marginLeft: 10 },
  loadingContainer: { alignItems: "center", marginVertical: 20 },
  loadingText: { marginTop: 15, fontSize: 16, color: "#3d5afe", textAlign: "center" },
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  modalScroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", width: "100%" },
  modalContent: {
    width: "90%",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 25,
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  closeIcon: { position: "absolute", top: 10, right: 10 },
  modalTitle: { fontSize: 22, fontWeight: "bold", marginVertical: 15, color: "#333" },
  modalMessage: { fontSize: 16, textAlign: "center", marginBottom: 20, lineHeight: 24, color: "#555" },
  analysisRequestButton: {
    backgroundColor: "#3498db",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20
  },
  analysisRequestButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  detectedKeywordsTitle: { fontSize: 16, fontWeight: "bold", color: "#34495e", marginBottom: 8, textAlign: "center" },
  detectedKeywords: { fontSize: 15, color: "#c0392b", marginBottom: 20, fontWeight: "600", textAlign: "center", lineHeight: 22 },
  transcriptContainer: { width: "100%", marginTop: 10, backgroundColor: "#f8f9fa", borderRadius: 8, padding: 15, maxHeight: 200 },
  transcriptTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 10, color: "#34495e" },
  transcriptText: { fontSize: 14, color: "#495057" },
});
