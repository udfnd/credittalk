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
import { supabase } from '../lib/supabaseClient';

const categories = [
  '노쇼',
  '불법 사채',
  '보이스피싱',
  '중고나라 사기',
  '사기',
  '전세 사기',
  '알바 사기', // 추가된 카테고리
  '절도', // 추가된 카테고리
];

const scamReportSources = [
  '지인소개',
  '포털사이트',
  '문자',
  '카톡',
  '텔레그램',
];

const companyTypes = ['법인', '개인']; // 법인/개인 선택

function ReportScreen({ navigation }) {
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState(''); // 닉네임
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
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (
      !accountNumber ||
      !category ||
      !scamReportSource ||
      !companyType ||
      !phonePrefix ||
      !phoneMiddle ||
      !phoneLast ||
      !nationalIdFront ||
      !nationalIdBack ||
      !address
    ) {
      Alert.alert('입력 오류', '필수 항목을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    const fullPhoneNumber = phonePrefix + phoneMiddle + phoneLast;
    const fullNationalId = nationalIdFront + nationalIdBack;
    const reportData = {
      name,
      nickname,
      phone_number: fullPhoneNumber,
      account_number: accountNumber,
      national_id: fullNationalId,
      category,
      scam_report_source: scamReportSource,
      company_type: companyType,
      address,
      description: description || null,
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
        invokeError?.details || invokeError?.message || '알 수 없는 오류';
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
  };

  const handleScamReportSourceChange = (source) => {
    setScamReportSource(source);
  };

  const handleCompanyTypeChange = (type) => {
    setCompanyType(type);
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>사기 정보 입력</Text>

      {/* 이름, 닉네임 입력란 */}
      <View style={styles.inputRow}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>이름</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="이름 입력"
          />
        </View>

        {/* 법인/개인 선택란 */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>법인/개인</Text>
          <View style={styles.companyTypeCheckboxContainer}>
            {companyTypes.map((type) => (
              <View style={styles.checkboxItem} key={type}>
                <TouchableOpacity onPress={() => handleCompanyTypeChange(type)}>
                  <View
                    style={
                      companyType === type
                        ? styles.checkedBox
                        : styles.uncheckedBox
                    }
                  >
                    {companyType === type && (
                      <Icon name="checkbox-marked" size={20} color="white" />
                    )}
                    {companyType !== type && (
                      <Icon
                        name="checkbox-blank-outline"
                        size={20}
                        color="black"
                      />
                    )}
                  </View>
                </TouchableOpacity>
                <Text style={styles.checkboxLabel}>{type}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 닉네임 */}
      <Text style={styles.label}>닉네임 (선택)</Text>
      <TextInput
        style={styles.input}
        value={nickname}
        onChangeText={setNickname}
        placeholder="닉네임 입력 (선택)"
      />

      {/* 연락처 입력란 */}
      <Text style={styles.label}>연락처</Text>
      <View style={styles.phoneInputContainer}>
        <TextInput
          style={[styles.input, styles.phoneInputMiddle]}
          value={phonePrefix}
          onChangeText={setPhonePrefix}
          placeholder="000"
          keyboardType="number-pad"
          maxLength={3}
        />
        <TextInput
          style={[styles.input, styles.phoneInputMiddle]}
          value={phoneMiddle}
          onChangeText={setPhoneMiddle}
          placeholder="000"
          keyboardType="number-pad"
          maxLength={4}
        />
        <TextInput
          style={[styles.input, styles.phoneInputLast]}
          value={phoneLast}
          onChangeText={setPhoneLast}
          placeholder="000"
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>

      {/* 계좌번호 입력란 */}
      <Text style={styles.label}>계좌번호</Text>
      <TextInput
        style={styles.input}
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder="계좌번호"
      />

      {/* 주민등록번호 입력란 */}
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
          style={[styles.input, styles.splitInput]}
          value={nationalIdBack}
          onChangeText={setNationalIdBack}
          placeholder="뒤 7자리"
          keyboardType="number-pad"
          maxLength={7}
        />
      </View>

      {/* 주소 입력란 */}
      <Text style={styles.label}>주소</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="전체 주소 입력"
      />

      {/* 카테고리 선택 */}
      <Text style={styles.label}>카테고리</Text>
      <View style={styles.checkboxContainer}>
        {categories.map((cat) => (
          <View style={styles.checkboxItem} key={cat}>
            <TouchableOpacity onPress={() => handleCategoryChange(cat)}>
              <View
                style={
                  category === cat ? styles.checkedBox : styles.uncheckedBox
                }
              >
                {category === cat && (
                  <Icon name="checkbox-marked" size={20} color="white" />
                )}
                {category !== cat && (
                  <Icon name="checkbox-blank-outline" size={20} color="black" />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.checkboxLabel}>{cat}</Text>
          </View>
        ))}
      </View>

      {/* 사기 경로 선택 */}
      <Text style={styles.label}>사기를 당하게 된 경로</Text>
      <View style={styles.checkboxContainer}>
        {scamReportSources.map((source) => (
          <View style={styles.checkboxItem} key={source}>
            <TouchableOpacity
              onPress={() => handleScamReportSourceChange(source)}
            >
              <View
                style={
                  scamReportSource === source
                    ? styles.checkedBox
                    : styles.uncheckedBox
                }
              >
                {scamReportSource === source && (
                  <Icon name="checkbox-marked" size={20} color="white" />
                )}
                {scamReportSource !== source && (
                  <Icon name="checkbox-blank-outline" size={20} color="black" />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.checkboxLabel}>{source}</Text>
          </View>
        ))}
      </View>

      {/* 상세 내용 */}
      <Text style={styles.label}>상세 내용</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="피해 내용, 사기꾼 특징 등을 간략히 기재 (선택)"
        numberOfLines={4}
      />

      {/* 제출 버튼 */}
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
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#343a40',
  },
  label: { fontSize: 16, marginBottom: 8, fontWeight: '600', color: '#495057' },
  required: { color: '#e03131' },
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
    alignItems: 'center',
  },
  phoneInputMiddle: { flex: 1, marginRight: 8 },
  phoneInputLast: { flex: 1 },
  splitInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  splitInput: { flex: 1, marginBottom: 0, textAlign: 'center' },
  hyphen: { fontSize: 18, marginHorizontal: 8, color: '#868e96' },
  buttonContainer: { marginTop: 25, marginBottom: 50 },
  companyTypeCheckboxContainer: {
    alignItems: 'center',
    gap: 18,
    marginTop: 10,
    flexDirection: 'row',
  },
  checkboxContainer: { marginBottom: 18 },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkboxLabel: { fontSize: 16, marginLeft: 8 },
  checkedBox: {
    width: 20,
    height: 20,
    backgroundColor: 'black',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uncheckedBox: {
    width: 20,
    height: 20,
    borderColor: '#ced4da',
    borderRadius: 5,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  inputContainer: { flex: 1, marginRight: 8 },
});

export default ReportScreen;
