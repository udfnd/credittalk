// src/screens/HelpDeskEditScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

// --- 상수 정의 (CreateScreen과 동일) ---
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
const 피해자_유형 = ['개인', '사업자'];
const 피해_카테고리 = ['불법사금융', '보이스피싱', '사기', '기타'];

// --- 재사용 가능한 컴포넌트 (CreateScreen과 동일) ---

const InputField = React.memo(
  ({
    label,
    value,
    onChangeText,
    placeholder,
    required = false,
    multiline = false,
    keyboardType = 'default',
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
      />
    </View>
  ),
);

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

export default function HelpDeskEditScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { questionId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formState, setFormState] = useState({
    userName: '',
    userPhone: '',
    birthDate: '',
    province: '',
    city: '',
    victimType: '',
    damageCategory: '',
    conversationReason: '',
    opponentAccount: '',
    opponentPhone: '',
    opponentSns: '',
    caseSummary: '',
    // title과 content는 create 화면에는 없지만 edit에는 있으므로 유지
    title: '',
    content: '',
  });

  const handleInputChange = useCallback((name, value) => {
    setFormState(prevState => ({ ...prevState, [name]: value }));
  }, []);

  useEffect(() => {
    if (!questionId) {
      Alert.alert('오류', '문의 ID가 없습니다.', [
        { text: '확인', onPress: () => navigation.goBack() },
      ]);
      return;
    }

    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('help_questions')
        .select('*')
        .eq('id', questionId)
        .single();

      if (error) {
        console.error(error);
        Alert.alert('오류', '문의를 불러오지 못했습니다.', [
          { text: '확인', onPress: () => navigation.goBack() },
        ]);
      } else if (data && mounted) {
        if (data.user_id !== user?.id) {
          Alert.alert('권한 없음', '내가 작성한 문의만 수정할 수 있습니다.', [
            { text: '확인', onPress: () => navigation.goBack() },
          ]);
        } else if (data.is_answered) {
          Alert.alert('수정 불가', '답변 완료된 문의는 수정할 수 없습니다.', [
            { text: '확인', onPress: () => navigation.goBack() },
          ]);
        } else {
          setFormState({
            userName: data.user_name ?? '',
            userPhone: data.user_phone ?? '',
            birthDate: data.birth_date ?? '',
            province: data.province ?? '',
            city: data.city ?? '',
            victimType: data.victim_type ?? '',
            damageCategory: data.damage_category ?? '',
            conversationReason: data.conversation_reason ?? '',
            opponentAccount: data.opponent_account ?? '',
            opponentPhone: data.opponent_phone ?? '',
            opponentSns: data.opponent_sns ?? '',
            caseSummary: data.case_summary ?? '',
            title: data.title ?? '',
            content: data.content ?? '',
          });
        }
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [questionId, user, navigation]);

  const onSave = async () => {
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
      !userName ||
      !userPhone ||
      !birthDate ||
      !province ||
      !city ||
      !victimType ||
      !damageCategory ||
      !conversationReason ||
      !caseSummary
    ) {
      Alert.alert('입력 오류', '필수 항목(*)을 모두 입력해주세요.');
      return;
    }

    setSaving(true);
    const payload = {
      user_name: formState.userName.trim(),
      user_phone: formState.userPhone.trim(),
      birth_date: formState.birthDate.trim(),
      province: formState.province.trim(),
      city: formState.city.trim(),
      victim_type: formState.victimType.trim(),
      damage_category: formState.damageCategory.trim(),
      conversation_reason: formState.conversationReason.trim(),
      opponent_account: formState.opponentAccount.trim(),
      opponent_phone: formState.opponentPhone.trim(),
      opponent_sns: formState.opponentSns.trim(),
      case_summary: formState.caseSummary.trim(),
      title: `${formState.userName.trim()}님의 ${formState.damageCategory} 관련 문의`, // 제목 자동 업데이트
      content: formState.caseSummary.trim(), // 본문도 사건 개요로 업데이트
    };

    const { error } = await supabase
      .from('help_questions')
      .update(payload)
      .eq('id', questionId);

    setSaving(false);

    if (error) {
      console.error(error);
      Alert.alert('오류', '수정 중 오류가 발생했습니다.');
      return;
    }

    Alert.alert('완료', '수정되었습니다.', [
      { text: '확인', onPress: () => navigation.goBack() },
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 50 }}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.header}>문의 수정</Text>

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
          label="생년월일"
          value={formState.birthDate}
          onChangeText={text => handleInputChange('birthDate', text)}
          placeholder="YYYY-MM-DD 형식으로 입력"
          keyboardType="number-pad"
          required
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
          options={피해자_유형}
          selectedValue={formState.victimType}
          onValueChange={value => handleInputChange('victimType', value)}
          required
        />
        <PickerField
          label="피해 카테고리"
          value={formState.damageCategory}
          onValueChange={value => handleInputChange('damageCategory', value)}
          placeholder="피해 유형을 선택해주세요"
          items={피해_카테고리}
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

        <TouchableOpacity
          style={[styles.submitButton, saving && styles.disabledButton]}
          onPress={onSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>수정 완료</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// CreateScreen의 스타일과 EditScreen 기존 스타일을 조합
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 25,
    color: '#343a40',
  },
  inputContainer: { marginBottom: 18 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#495057' },
  required: { color: '#e03131' },
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
  textArea: { height: 150, textAlignVertical: 'top' },
  pickerText: { fontSize: 16, color: '#212529' },
  placeholderText: { color: '#adb5bd' },
  radioGroupContainer: { flexDirection: 'row', gap: 10 },
  radioButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  radioButtonSelected: { backgroundColor: '#3d5afe', borderColor: '#3d5afe' },
  radioButtonText: { fontSize: 16, color: '#495057', fontWeight: '500' },
  radioButtonTextSelected: { color: '#fff', fontWeight: 'bold' },
  submitButton: {
    backgroundColor: '#3d5afe',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  disabledButton: { backgroundColor: '#adb5bd' },
  submitButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
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
  modalItemText: { fontSize: 18, textAlign: 'center' },
  modalCloseButton: {
    marginTop: 20,
    backgroundColor: '#3d5afe',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  modalCloseButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});
