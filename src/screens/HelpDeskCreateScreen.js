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
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ensureSafeContent } from '../lib/contentSafety';

// 대한민국 주요 시/도 리스트
const KOREAN_PROVINCES = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
];

const victimType = ['개인', '사업자'];
const victimCategory = ['불법사금융', '보이스피싱', '사기', '기타'];

// --- 재사용 가능한 컴포넌트 ---

const InputField = React.memo(
  ({
    label,
    value,
    onChangeText,
    placeholder,
    required = false,
    multiline = false,
    keyboardType = 'default',
    maxLength, // maxLength prop 추가
  }) => (
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
        maxLength={maxLength} // maxLength 적용
      />
    </View>
  ),
);

// 선택(Picker) 컴포넌트
const PickerField = ({
  label,
  value,
  onValueChange,
  placeholder,
  items,
  required = false,
}) => {
  const [modalVisible, setModalVisible] = useState(false);

  const handleSelect = itemValue => {
    onValueChange(itemValue);
    setModalVisible(false);
  };

  return (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
      <TouchableOpacity
        style={styles.input}
        onPress={() => setModalVisible(true)}>
        <Text style={[styles.pickerText, !value && styles.placeholderText]}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>
      <Modal
        transparent={true}
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>{label} 선택</Text>
            <FlatList
              data={items}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => handleSelect(item)}>
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

// 라디오 버튼 그룹 컴포넌트
const RadioGroupField = ({
  label,
  options,
  selectedValue,
  onValueChange,
  required = false,
}) => (
  <View style={styles.inputContainer}>
    <Text style={styles.label}>
      {label} {required && <Text style={styles.required}>*</Text>}
    </Text>
    <View style={styles.radioGroupContainer}>
      {options.map(option => (
        <TouchableOpacity
          key={option}
          style={[
            styles.radioButton,
            selectedValue === option && styles.radioButtonSelected,
          ]}
          onPress={() => onValueChange(option)}>
          <Text
            style={[
              styles.radioButtonText,
              selectedValue === option && styles.radioButtonTextSelected,
            ]}>
            {option}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

// --- 메인 스크린 컴포넌트 ---

export default function HelpDeskCreateScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState({
    userName: '',
    userPhone: '',
    birthDate: '', // 생년월일
    province: '', // 지역 (시/도)
    city: '', // 세부 지역
    victimType: '', // 피해자 해당사항
    damageCategory: '', // 피해 카테고리
    conversationReason: '',
    opponentAccount: '',
    opponentPhone: '',
    opponentSns: '',
    caseSummary: '',
  });

  // ✨ 여기가 수정된 부분입니다 ✨
  const handleInputChange = useCallback((name, value) => {
    // 생년월일 입력 시 자동 하이픈 추가 로직
    if (name === 'birthDate') {
      const cleaned = value.replace(/[^\d]/g, ''); // 숫자 이외의 문자 제거
      let formatted = cleaned;

      if (cleaned.length > 4) {
        // YYYY-MM 형식
        formatted = `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
      }
      if (cleaned.length > 6) {
        // YYYY-MM-DD 형식
        formatted = `${cleaned.slice(0, 4)}-${cleaned.slice(
          4,
          6,
        )}-${cleaned.slice(6, 8)}`;
      }

      setFormState(prevState => ({ ...prevState, [name]: formatted }));
    } else {
      // 다른 필드는 기존 로직 유지
      setFormState(prevState => ({ ...prevState, [name]: value }));
    }
  }, []);

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('오류', '상담 요청을 하시려면 로그인이 필요합니다.');
      return;
    }

    const {
      userName,
      userPhone,
      birthDate,
      province,
      city,
      victimType,
      damageCategory,
      conversationReason,
      caseSummary,
    } = formState;

    if (
      !userName.trim() ||
      !userPhone.trim() ||
      !birthDate.trim() ||
      !province.trim() ||
      !city.trim() ||
      !victimType.trim() ||
      !damageCategory.trim() ||
      !conversationReason.trim() ||
      !caseSummary.trim()
    ) {
      Alert.alert('입력 오류', '필수 항목(*)을 모두 입력해주세요.');
      return;
    }

    // 생년월일 형식 유효성 검사 (자동 포맷팅으로 인해 이 부분은 통과하기 쉬워짐)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) {
      Alert.alert('입력 오류', '생년월일을 YYYY-MM-DD 형식으로 입력해주세요.');
      return;
    }

    let sanitized;
    try {
      sanitized = ensureSafeContent([
        { key: 'userName', label: '이름', value: userName, allowEmpty: false },
        {
          key: 'conversationReason',
          label: '대화 계기',
          value: conversationReason,
          allowEmpty: false,
        },
        {
          key: 'caseSummary',
          label: '사건 개요',
          value: caseSummary,
          allowEmpty: false,
        },
        {
          key: 'opponentAccount',
          label: '상대방 계좌',
          value: formState.opponentAccount,
        },
        {
          key: 'opponentPhone',
          label: '상대방 전화번호',
          value: formState.opponentPhone,
        },
        {
          key: 'opponentSns',
          label: '상대방 SNS',
          value: formState.opponentSns,
        },
      ]);
    } catch (error) {
      Alert.alert('등록 불가', error.message);
      return;
    }

    setLoading(true);

    const { error } = await supabase.from('help_questions').insert({
      user_id: user.id,
      user_name: sanitized.userName,
      user_phone: userPhone.trim(),
      birth_date: birthDate.trim(),
      province: province.trim(),
      city: city.trim(),
      victim_type: victimType.trim(),
      damage_category: damageCategory.trim(),
      conversation_reason: sanitized.conversationReason,
      opponent_account: sanitized.opponentAccount || null,
      opponent_phone: sanitized.opponentPhone || null,
      opponent_sns: sanitized.opponentSns || null,
      case_summary: sanitized.caseSummary,
      title: `${sanitized.userName}님의 ${damageCategory} 관련 문의`,
      content: sanitized.caseSummary,
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
        {/* ✨ 생년월일 입력 필드에 maxLength 추가 */}
        <InputField
          label="생년월일"
          value={formState.birthDate}
          onChangeText={text => handleInputChange('birthDate', text)}
          placeholder="YYYYMMDD 형식으로 입력"
          keyboardType="number-pad"
          required
          maxLength={10}
        />

        <PickerField
          label="지역 (시/도)"
          value={formState.province}
          onValueChange={value => handleInputChange('province', value)}
          placeholder="거주 지역을 선택해주세요"
          items={KOREAN_PROVINCES}
          required
        />

        <InputField
          label="세부 지역"
          value={formState.city}
          onChangeText={text => handleInputChange('city', text)}
          placeholder="시/군/구 이하 상세주소를 입력해주세요"
          required
        />
        <RadioGroupField
          label="피해자 해당사항"
          options={victimType}
          selectedValue={formState.victimType}
          onValueChange={value => handleInputChange('victimType', value)}
          required
        />

        <PickerField
          label="피해 카테고리"
          value={formState.damageCategory}
          onValueChange={value => handleInputChange('damageCategory', value)}
          placeholder="피해 유형을 선택해주세요"
          items={victimCategory}
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
    justifyContent: 'center',
    minHeight: 48,
  },
  textArea: {
    height: 150,
    textAlignVertical: 'top',
  },
  pickerText: {
    fontSize: 16,
    color: '#212529',
  },
  placeholderText: {
    color: '#adb5bd',
  },
  radioGroupContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  radioButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  radioButtonSelected: {
    backgroundColor: '#3d5afe',
    borderColor: '#3d5afe',
  },
  radioButtonText: {
    fontSize: 16,
    color: '#495057',
    fontWeight: '500',
  },
  radioButtonTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  modalItemText: {
    fontSize: 18,
    textAlign: 'center',
  },
  modalCloseButton: {
    marginTop: 20,
    backgroundColor: '#3d5afe',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
