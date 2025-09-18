import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const InputField = React.memo(
  ({
    label,
    value,
    onChangeText,
    placeholder,
    required = false,
    multiline = false,
    keyboardType = 'default',
  }) => {
    return (
      <View style={styles.inputContainer}>
        <Text style={styles.label}>
          {label} {required && <Text style={styles.required}>*</Text>}
        </Text>
        <TextInput
          style={[styles.input, multiline && styles.textArea]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#adb5bd"
          multiline={multiline}
          numberOfLines={multiline ? 5 : 1}
          keyboardType={keyboardType}
        />
      </View>
    );
  },
);

export default function HelpDeskCreateScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState({
    userName: '',
    userPhone: '',
    conversationReason: '',
    opponentAccount: '',
    opponentPhone: '',
    opponentSns: '',
    caseSummary: '',
  });

  // useCallback을 사용하여 함수가 불필요하게 다시 생성되는 것을 방지합니다.
  const handleInputChange = useCallback((name, value) => {
    setFormState(prevState => ({
      ...prevState,
      [name]: value,
    }));
  }, []);

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('오류', '상담 요청을 하시려면 로그인이 필요합니다.');
      return;
    }

    const { userName, userPhone, conversationReason, caseSummary } = formState;

    if (
      !userName.trim() ||
      !userPhone.trim() ||
      !conversationReason.trim() ||
      !caseSummary.trim()
    ) {
      Alert.alert('입력 오류', '필수 항목(*)을 모두 입력해주세요.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.from('help_questions').insert({
      user_id: user.id,
      user_name: formState.userName.trim(),
      user_phone: formState.userPhone.trim(),
      conversation_reason: formState.conversationReason.trim(),
      opponent_account: formState.opponentAccount.trim() || null,
      opponent_phone: formState.opponentPhone.trim() || null,
      opponent_sns: formState.opponentSns.trim() || null,
      case_summary: formState.caseSummary.trim(),
      title: `${formState.userName.trim()}님의 상담 요청: ${formState.caseSummary.trim().substring(0, 20)}...`,
      content: formState.caseSummary.trim(),
    });

    setLoading(false);

    if (error) {
      console.error('Error inserting question:', error);
      Alert.alert(
        '오류',
        '상담 요청을 등록하는 데 실패했습니다: ' + error.message,
      );
    } else {
      Alert.alert('성공', '상담 요청이 성공적으로 등록되었습니다.');
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 50 }}>
        <Text style={styles.header}>1:1 문의하기</Text>
        <InputField
          label="본인 이름"
          value={formState.userName}
          onChangeText={text => handleInputChange('userName', text)}
          placeholder="성함을 입력해주세요"
          required
        />
        <InputField
          label="본인 전화번호"
          value={formState.userPhone}
          onChangeText={text => handleInputChange('userPhone', text)}
          placeholder="연락받으실 전화번호를 입력해주세요"
          keyboardType="phone-pad"
          required
        />
        <InputField
          label="상대방과 대화를 하게된 계기"
          value={formState.conversationReason}
          onChangeText={text => handleInputChange('conversationReason', text)}
          placeholder="예: 중고거래 앱, 오픈채팅방 등"
          required
        />
        <InputField
          label="상대방이 입금 요청한 계좌"
          value={formState.opponentAccount}
          onChangeText={text => handleInputChange('opponentAccount', text)}
          placeholder="은행명과 계좌번호 (선택)"
          keyboardType="default"
        />
        <InputField
          label="상대방 전화번호"
          value={formState.opponentPhone}
          onChangeText={text => handleInputChange('opponentPhone', text)}
          placeholder="전화번호 (선택)"
          keyboardType="phone-pad"
        />
        <InputField
          label="상대방 SNS 닉네임"
          value={formState.opponentSns}
          onChangeText={text => handleInputChange('opponentSns', text)}
          placeholder="카카오톡 ID, 텔레그램 ID 등 (선택)"
        />
        <InputField
          label="사건 개요"
          value={formState.caseSummary}
          onChangeText={text => handleInputChange('caseSummary', text)}
          placeholder="언제, 어디서, 어떻게 피해를 입었는지 육하원칙에 따라 상세히 작성해주세요."
          multiline
          required
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            분석 의뢰를 하고 싶은 자료가 있으실 경우, 카카오톡 아이디
            “leekd5904”를 추가하신 뒤, 성함을 밝히시고 자료를 첨부해주세요.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitButtonText}>문의 등록하기</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 25,
    color: '#343a40',
  },
  inputContainer: {
    marginBottom: 18,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#495057',
  },
  required: {
    color: '#e03131',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
    color: '#212529',
  },
  textArea: {
    height: 150,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#3d5afe',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  disabledButton: {
    backgroundColor: '#adb5bd',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 25,
    padding: 15,
    backgroundColor: '#f1f3f5',
    borderRadius: 8,
    borderLeftWidth: 5,
    borderLeftColor: '#3d5afe',
  },
  footerText: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 22,
  },
});
