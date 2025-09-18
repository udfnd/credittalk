// src/screens/DeleteAccountScreen.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

function DeleteAccountScreen() {
  const { deleteUserAccount } = useAuth();
  const [confirmationText, setConfirmationText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const requiredText = '탈퇴합니다';

  const handleDelete = async () => {
    if (confirmationText !== requiredText) {
      Alert.alert(
        '입력 오류',
        `계정을 삭제하시려면 '${requiredText}'라고 정확히 입력해주세요.`,
      );
      return;
    }

    Alert.alert(
      '정말로 탈퇴하시겠습니까?',
      '모든 데이터는 영구적으로 삭제되며 복구할 수 없습니다. 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            await deleteUserAccount();
            // deleteUserAccount 함수 내에서 로그아웃까지 처리됩니다.
            setIsLoading(false);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.warningTitle}>⚠️ 계정 삭제 경고</Text>
      <Text style={styles.warningText}>
        계정을 삭제하면 프로필, 게시물, 댓글 등 모든 활동 기록이 영구적으로
        삭제되며 다시는 복구할 수 없습니다.
      </Text>
      <Text style={styles.instructionText}>
        계정 삭제를 진행하시려면 아래 입력창에 똑같이 입력해주세요:
      </Text>
      <Text style={styles.requiredText}>{requiredText}</Text>
      <TextInput
        style={styles.input}
        value={confirmationText}
        onChangeText={setConfirmationText}
        placeholder={`'${requiredText}' 라고 입력`}
        autoCapitalize="none"
      />
      {isLoading ? (
        <ActivityIndicator size="large" color="#d9534f" />
      ) : (
        <Button
          title="계정 영구 삭제"
          color="#d9534f"
          onPress={handleDelete}
          disabled={confirmationText !== requiredText}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  warningTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#d9534f',
    marginBottom: 10,
  },
  warningText: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
    color: '#333',
  },
  instructionText: {
    fontSize: 16,
    marginBottom: 5,
  },
  requiredText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3d5afe',
    marginBottom: 10,
    alignSelf: 'center',
  },
  input: {
    height: 50,
    borderColor: '#ced4da',
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 15,
    borderRadius: 8,
    fontSize: 16,
  },
});

export default DeleteAccountScreen;
