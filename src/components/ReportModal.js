import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const ReportModal = ({
  isVisible,
  onClose,
  contentId,
  contentType,
  authorId,
}) => {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleReportSubmit = async () => {
    if (!reason.trim()) {
      Alert.alert('신고 사유를 입력해주세요.');
      return;
    }
    if (!user) {
      Alert.alert('로그인이 필요합니다.');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from('reports').insert([
        {
          content_id: contentId,
          content_type: contentType,
          reason: reason.trim(),
          reporter_id: user.id,
          author_id: authorId,
        },
      ]);

      if (error) throw error;

      Alert.alert('신고 완료', '신고가 성공적으로 접수되었습니다.');
      onClose();
      setReason('');
    } catch (err) {
      console.error('Report submission error:', err);
      Alert.alert(
        '신고 실패',
        err.message || '신고 처리 중 오류가 발생했습니다.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}>
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>신고하기</Text>
          <Text style={styles.modalText}>
            신고 사유를 구체적으로 작성해주세요. 허위 신고 시 불이익을 받을 수
            있습니다.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="예: 욕설, 비방, 불법 정보 등"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.buttonClose]}
              onPress={onClose}
              disabled={isLoading}>
              <Text style={styles.textStyle}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonSubmit]}
              onPress={handleReportSubmit}
              disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.textStyle}>제출</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalText: {
    marginBottom: 20,
    textAlign: 'center',
    color: '#555',
  },
  input: {
    width: '100%',
    height: 100,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    textAlignVertical: 'top',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    borderRadius: 8,
    padding: 12,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  buttonClose: {
    backgroundColor: '#7f8c8d',
  },
  buttonSubmit: {
    backgroundColor: '#e74c3c',
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default ReportModal;
