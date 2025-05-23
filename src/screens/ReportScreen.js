import React, { useState } from 'react';
import {
  View,
  TextInput,
  Button,
  Text,
  Alert,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient'; //

const categories = [
  '노쇼',
  '불법 사채',
  '보이스피싱',
  '중고나라 사기',
  '사기',
  '전세 사기',
  '알바 사기',
  '절도',
]; //

const scamReportSources = [
  '지인소개',
  '포털사이트',
  '문자',
  '카톡',
  '텔레그램',
]; //

const companyTypes = ['법인', '개인']; //

function ReportScreen({ navigation }) {
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [category, setCategory] = useState('');
  const [scamReportSource, setScamReportSource] = useState('');
  const [companyType, setCompanyType] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('');
  const [phoneMiddle, setPhoneMiddle] = useState('');
  const [phoneLast, setPhoneLast] = useState('');
  const [nationalIdFront, setNationalIdFront] = useState('');
  const [nationalIdBack, setNationalIdBack] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [address, setAddress] = useState('');

  const clearInputs = () => {
    setName('');
    setNickname('');
    setAccountNumber('');
    setCategory('');
    setScamReportSource('');
    setCompanyType('');
    setPhonePrefix('');
    setPhoneMiddle('');
    setPhoneLast('');
    setNationalIdFront('');
    setNationalIdBack('');
    setDescription('');
    setAddress('');
  }; //

  const handleSubmit = async () => {
    Keyboard.dismiss();

    // 필수 항목 검사: 체크박스/선택 항목들만 필수로 남김
    if (
      !category || // 카테고리는 필수
      !scamReportSource || // 사기 경로도 필수
      !companyType // 법인/개인도 필수
    ) {
      Alert.alert(
        '입력 오류',
        '카테고리, 사기 경로, 법인/개인 유형은 반드시 선택해주세요.',
      );
      return;
    }

    // 전화번호와 주민번호는 일부만 입력되었을 경우 경고 또는 처리 (선택적)
    const fullPhoneNumber =
      phonePrefix || phoneMiddle || phoneLast
        ? phonePrefix + phoneMiddle + phoneLast
        : null;
    const fullNationalId =
      nationalIdFront || nationalIdBack
        ? nationalIdFront + nationalIdBack
        : null;

    // 전화번호가 입력된 경우, 전체 길이가 유효한지 확인 (선택적 강화)
    if (
      fullPhoneNumber &&
      (fullPhoneNumber.length < 9 || fullPhoneNumber.length > 11) &&
      !/^\d+$/.test(fullPhoneNumber)
    ) {
      // (정규식으로 숫자만 있는지 확인도 가능)
      // Alert.alert('입력 오류', '연락처를 올바르게 입력해주세요 (9~11자리 숫자).');
      // return;
      // 선택 사항이므로, 여기서는 경고 없이 진행하거나 더 유연하게 처리
    }
    // 주민번호가 입력된 경우, 전체 길이가 유효한지 확인 (선택적 강화)
    if (
      fullNationalId &&
      fullNationalId.length !== 13 &&
      !/^\d+$/.test(fullNationalId)
    ) {
      // Alert.alert('입력 오류', '주민등록번호는 13자리 숫자로 입력해주세요.');
      // return;
    }

    setIsLoading(true);
    const reportData = {
      name: name.trim() || null, // 빈 문자열이면 null로
      nickname: nickname.trim() || null,
      phone_number: fullPhoneNumber,
      account_number: accountNumber.trim() || null,
      national_id: fullNationalId,
      category, // 필수
      scam_report_source: scamReportSource, // 필수
      company_type: companyType, // 필수
      address: address.trim() || null,
      description: description.trim() || null,
    };

    try {
      const { data, error } = await supabase.functions.invoke(
        'insert-scammer-report',
        { body: reportData },
      );
      if (error) {
        throw error;
      }
      Alert.alert('등록 완료', '사기 정보가 성공적으로 등록되었습니다.');
      clearInputs();
      navigation.goBack();
    } catch (invokeError) {
      console.error('등록 실패:', invokeError);
      const message =
        invokeError?.data?.error || // Edge function에서 반환된 에러 메시지 확인
        invokeError?.details ||
        invokeError?.message ||
        '알 수 없는 오류';
      Alert.alert('등록 실패', `오류 발생: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryChange = (categoryName) => {
    if (category === categoryName) {
      setCategory('');
    } else {
      setCategory(categoryName);
    }
  }; //

  const handleScamReportSourceChange = (source) => {
    setScamReportSource(source); // 단일 선택이므로 바로 설정
  }; //

  const handleCompanyTypeChange = (type) => {
    setCompanyType(type); // 단일 선택이므로 바로 설정
  }; //

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>사기 정보 입력</Text>
      <Text style={styles.guidance}>* 표시된 항목은 필수 입력입니다.</Text>

      <View style={styles.inputRow}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>이름</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="이름 (선택)"
          />
        </View>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>
            법인/개인 <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.optionSelectorContainer}>
            {companyTypes.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.optionButton,
                  companyType === type && styles.optionButtonSelected,
                ]}
                onPress={() => handleCompanyTypeChange(type)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    companyType === type && styles.optionButtonTextSelected,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.label}>닉네임</Text>
      <TextInput
        style={styles.input}
        value={nickname}
        onChangeText={setNickname}
        placeholder="닉네임 (선택)"
      />

      <Text style={styles.label}>연락처</Text>
      <View style={styles.phoneInputContainer}>
        <TextInput
          style={[styles.input, styles.phoneInputSegment]}
          value={phonePrefix}
          onChangeText={setPhonePrefix}
          placeholder="000"
          keyboardType="number-pad"
          maxLength={3}
        />
        <TextInput
          style={[styles.input, styles.phoneInputSegment]}
          value={phoneMiddle}
          onChangeText={setPhoneMiddle}
          placeholder="0000"
          keyboardType="number-pad"
          maxLength={4}
        />
        <TextInput
          style={[styles.input, styles.phoneInputSegment]}
          value={phoneLast}
          onChangeText={setPhoneLast}
          placeholder="0000"
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>

      <Text style={styles.label}>계좌번호</Text>
      <TextInput
        style={styles.input}
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder="계좌번호 (선택)"
        keyboardType="number-pad"
      />

      <Text style={styles.label}>주민등록번호</Text>
      <View style={styles.splitInputContainer}>
        <TextInput
          style={[styles.input, styles.splitInput]}
          value={nationalIdFront}
          onChangeText={setNationalIdFront}
          placeholder="앞 6자리"
          keyboardType="number-pad"
          maxLength={6}
        />
        <Text style={styles.hyphen}>-</Text>
        <TextInput
          style={[
            styles.input,
            styles.splitInput,
            { letterSpacing: nationalIdBack.length > 0 ? 2 : 0 },
          ]} // 마지막 글자 보안입력처럼
          value={nationalIdBack}
          onChangeText={setNationalIdBack}
          placeholder="뒤 7자리"
          keyboardType="number-pad"
          maxLength={7}
          secureTextEntry // 뒷자리는 민감 정보
        />
      </View>

      <Text style={styles.label}>주소</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="전체 주소 (선택)"
      />

      <Text style={styles.label}>
        카테고리 <Text style={styles.required}>*</Text>
      </Text>
      <View style={styles.checkboxContainer}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={styles.checkboxItem}
            onPress={() => handleCategoryChange(cat)}
          >
            <Icon
              name={
                category === cat
                  ? 'checkbox-marked-outline'
                  : 'checkbox-blank-outline'
              }
              size={24}
              color={category === cat ? '#3d5afe' : '#555'}
            />
            <Text style={styles.checkboxLabel}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>
        사기를 당하게 된 경로 <Text style={styles.required}>*</Text>
      </Text>
      <View style={styles.checkboxContainer}>
        {scamReportSources.map((source) => (
          <TouchableOpacity
            key={source}
            style={styles.checkboxItem}
            onPress={() => handleScamReportSourceChange(source)}
          >
            <Icon
              name={
                scamReportSource === source
                  ? 'checkbox-marked-outline'
                  : 'checkbox-blank-outline'
              }
              size={24}
              color={scamReportSource === source ? '#3d5afe' : '#555'}
            />
            <Text style={styles.checkboxLabel}>{source}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>상세 내용</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="피해 내용, 사기꾼 특징 등을 간략히 기재 (선택)"
        numberOfLines={4}
      />

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
  container: { flex: 1, padding: 20, backgroundColor: '#f8f9fa' },
  guidance: {
    fontSize: 13,
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10, // guidance text와의 간격
    color: '#343a40',
  },
  label: { fontSize: 16, marginBottom: 8, fontWeight: '600', color: '#495057' },
  required: { color: '#e03131', fontSize: 16, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ced4da',
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    paddingHorizontal: 12,
    marginBottom: 18,
    borderRadius: 8,
    backgroundColor: 'white',
    fontSize: 16,
    color: '#212529',
    height: 50,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  phoneInputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between', // 각 필드 사이 간격
  },
  phoneInputSegment: {
    flex: 1, // 각 필드가 공간을 균등하게 차지하도록
    marginHorizontal: 2, // 필드 간 약간의 간격
  },
  splitInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18, // input과 동일하게
  },
  splitInput: { flex: 1, marginBottom: 0, textAlign: 'center' },
  hyphen: { fontSize: 18, marginHorizontal: 8, color: '#868e96' },
  buttonContainer: { marginTop: 25, marginBottom: 50 },

  optionSelectorContainer: {
    // companyType 용
    flexDirection: 'row',
    // justifyContent: 'space-around',
    alignItems: 'center',
    height: 50, // input과 높이 맞춤
    marginBottom: 18,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  optionButtonSelected: {
    backgroundColor: '#3d5afe',
    borderColor: '#3d5afe',
  },
  optionButtonText: {
    fontSize: 16,
    color: '#495057',
  },
  optionButtonTextSelected: {
    color: 'white',
    fontWeight: 'bold',
  },
  checkboxContainer: {
    flexDirection: 'row', // 가로 배치
    flexWrap: 'wrap', // 자동 줄바꿈
    marginBottom: 18,
    // justifyContent: 'space-between',
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginRight: 15, // 체크박스 간 가로 간격
    paddingVertical: 5,
  },
  checkboxLabel: { fontSize: 16, marginLeft: 8, color: '#333' },
  // checkedBox, uncheckedBox 스타일 제거 (Icon으로 대체)
  inputRow: {
    flexDirection: 'row',
    // justifyContent: 'space-between', // 아래 inputContainer에서 flex:1로 처리
  },
  inputContainer: { flex: 1, marginRight: 5 }, // 마지막 자식은 marginRight 제거
});

export default ReportScreen;
