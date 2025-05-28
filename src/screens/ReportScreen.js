import React, { useState, useEffect } from 'react';
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
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient'; //

const companyTypes = ['법인', '개인'];

// --- 수정된 카테고리 정의 ---
const individualCategories = [
  // 개인 선택 시
  '보이스피싱, 전기통신금융사기, 로맨스 스캠 사기', // A
  '불법사금융 대리구매', // B
  '중고나라 사기', // C
  '투자 사기, 전세 사기', // D
  '게임 비실물', // E
  '암호화폐', // F
  '기타', // G
];

const corporateCategories = [
  // 법인 선택 시
  '노쇼 대리구매 사기', // A
  '공갈 협박 범죄', // B
  '알바 범죄', // C
  '렌탈 사업', // D
  '기타', // E
];
// --- 수정된 카테고리 정의 끝 ---

const scamReportSources = [
  '지인소개',
  '포털사이트',
  '문자',
  '카톡',
  '텔레그램',
];

const victimCircumstanceOptions = [
  '불법 추심',
  '과도한 이자 갈취',
  '폭력',
  '성폭력',
  '기타',
];

const itemCategories = [
  {
    name: 'MP3/PMP/전자사전',
    image: require('../assets/images/items/MP3_PMP_전자사전.png'),
  },
  {
    name: '휴대폰/주변기기',
    image: require('../assets/images/items/휴대폰_주변기기.png'),
  },
  { name: '화폐', image: require('../assets/images/items/화폐.png') },
  {
    name: '피싱/대출/계약',
    image: require('../assets/images/items/피싱_대출_계약.png'),
  },
  {
    name: '패션/의류',
    image: require('../assets/images/items/패션_의류.png'),
  },
  {
    name: '티켓/상품권',
    image: require('../assets/images/items/티켓_상품권.png'),
  },
  {
    name: '태블릿/노트북',
    image: require('../assets/images/items/태블릿_노트북.png'),
  },
  {
    name: '컴퓨터/주변기기',
    image: require('../assets/images/items/컴퓨터_주변기기.png'),
  },
  {
    name: '카메라/주변기기',
    image: require('../assets/images/items/카메라_주변기기.png'),
  },
  {
    name: '취미/인형/피규어',
    image: require('../assets/images/items/취미_인형_피규어.png'),
  },
  {
    name: '자동차/바이크',
    image: require('../assets/images/items/자동차_바이크.png'),
  },
  {
    name: '음악/영화/주변기기',
    image: require('../assets/images/items/음악_영화_주변기기.png'),
  },
  {
    name: '유아동/출산',
    image: require('../assets/images/items/유아동_출산.png'),
  },
  {
    name: '액세서리/귀금속',
    image: require('../assets/images/items/액세서리_귀금속.png'),
  },
  {
    name: '안경/선글라스',
    image: require('../assets/images/items/안경_선글라스.png'),
  },
  { name: '신발', image: require('../assets/images/items/신발.png') },
  {
    name: '식품/음료/의약품',
    image: require('../assets/images/items/식품_음료_의약품.png'),
  },
  { name: '시계', image: require('../assets/images/items/시계.png') },
  {
    name: '스포츠/레저/운동',
    image: require('../assets/images/items/스포츠_레저_운동.png'),
  },
  {
    name: '소프트웨어',
    image: require('../assets/images/items/소프트웨어.png'),
  },
  {
    name: '성인/사행성',
    image: require('../assets/images/items/성인_사행성.png'),
  },
  {
    name: '생활/주방/욕실용품',
    image: require('../assets/images/items/생활_주방_욕실용품.png'),
  },
  {
    name: '뷰티/미용/화장품',
    image: require('../assets/images/items/뷰티_미용_화장품.png'),
  },
  {
    name: '배송비',
    image: require('../assets/images/items/배송비.png'),
  },
  {
    name: '문구/사무/소모품',
    image: require('../assets/images/items/문구_사무_소모품.png'),
  },
  {
    name: '동물/생물/식물/용품',
    image: require('../assets/images/items/동물_생물_식물_용품.png'),
  },
  {
    name: '도서/학습',
    image: require('../assets/images/items/도서_학습.png'),
  },
  { name: '기타', image: require('../assets/images/items/기타.png') },
  {
    name: '공구/중장비/농기구',
    image: require('../assets/images/items/공구_중장비_농기구.png'),
  },
  {
    name: '게임기/주변기기',
    image: require('../assets/images/items/게임기_주변기기.png'),
  },
  {
    name: '가전/전자제품',
    image: require('../assets/images/items/가전_전자제품.png'),
  },
  {
    name: '가방/지갑/잡화',
    image: require('../assets/images/items/가방_지갑_잡화.png'),
  },
  {
    name: '가구/인테리어',
    image: require('../assets/images/items/가구_인테리어.png'),
  },
];

const gameItemCategories = [
  {
    name: '게임 아이템',
    image: require('../assets/images/gameItems/게임_아이템.png'),
  },
  {
    name: '아이디 계정',
    image: require('../assets/images/gameItems/아이디_계정.png'),
  },
  {
    name: '포인트 마일리지',
    image: require('../assets/images/gameItems/포인트_마일리지.png'),
  },
];

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
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentCategories, setCurrentCategories] = useState([]);
  const [perpetratorDialogueTrigger, setPerpetratorDialogueTrigger] =
    useState('');
  const [perpetratorContactPath, setPerpetratorContactPath] = useState('');
  const [victimCircumstances, setVictimCircumstances] = useState('');
  const [showVictimCircumstanceTextInput, setShowVictimCircumstanceTextInput] =
    useState(false);
  const [tradedItemCategory, setTradedItemCategory] = useState('');
  const [isPerpetratorIdentified, setIsPerpetratorIdentified] = useState(null);
  const [caseSummary, setCaseSummary] = useState('');

  useEffect(() => {
    if (companyType === '개인') {
      setCurrentCategories(individualCategories);
    } else if (companyType === '법인') {
      setCurrentCategories(corporateCategories);
    } else {
      setCurrentCategories([]);
    }
    setCategory('');
    setPerpetratorDialogueTrigger('');
    setPerpetratorContactPath('');
    setVictimCircumstances(''); // 초기화
    setShowVictimCircumstanceTextInput(false); // 초기화
    setTradedItemCategory('');
    setCaseSummary('');
  }, [companyType]);

  useEffect(() => {
    setPerpetratorDialogueTrigger('');
    setPerpetratorContactPath('');
    setVictimCircumstances(''); // 카테고리 변경 시 피해 정황 초기화
    setShowVictimCircumstanceTextInput(false); // 초기화
    setTradedItemCategory('');
  }, [category]);

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
    setAddress('');
    setPerpetratorDialogueTrigger('');
    setPerpetratorContactPath('');
    setVictimCircumstances('');
    setShowVictimCircumstanceTextInput(false);
    setTradedItemCategory('');
    setIsPerpetratorIdentified(null);
    setCaseSummary('');
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (
      !companyType ||
      !category ||
      !scamReportSource ||
      isPerpetratorIdentified === null
    ) {
      Alert.alert('입력 오류', '필수 항목을 모두 입력/선택해주세요.');
      return;
    }

    // "개인 - 불법사금융 대리구매" 또는 "법인 - 기타" 이면서 "기타 직접입력"이 선택되었지만, 텍스트가 비어있는 경우
    const isCheckboxCircumstance =
      category === individualCategories[1] ||
      category === corporateCategories[4];
    if (
      isCheckboxCircumstance &&
      victimCircumstances.includes('기타 직접입력') &&
      victimCircumstances.replace('기타 직접입력', '').trim() === ''
    ) {
      Alert.alert(
        '입력 오류',
        '피해 정황 "기타 직접입력"을 선택하신 경우, 상세 내용을 입력해주세요.',
      );
      return;
    }

    setIsLoading(true);
    const fullPhoneNumber =
      phonePrefix || phoneMiddle || phoneLast
        ? `${phonePrefix}${phoneMiddle}${phoneLast}`
        : null;
    const fullNationalId =
      nationalIdFront || nationalIdBack
        ? `${nationalIdFront}${nationalIdBack}`
        : null;

    const reportData = {
      name: name.trim() || null,
      nickname: nickname.trim() || null,
      phone_number: fullPhoneNumber,
      account_number: accountNumber.trim() || null,
      national_id: fullNationalId,
      category,
      scam_report_source: scamReportSource,
      company_type: companyType,
      address: address.trim() || null,
      description: caseSummary.trim() || null,
      perpetrator_dialogue_trigger: perpetratorDialogueTrigger.trim() || null,
      perpetrator_contact_path: perpetratorContactPath.trim() || null,
      victim_circumstances: victimCircumstances.trim() || null, // 단일 텍스트로 저장
      traded_item_category: tradedItemCategory || null,
      perpetrator_identified: isPerpetratorIdentified,
    };

    try {
      const { error } = await supabase.functions.invoke(
        'insert-scammer-report',
        { body: reportData },
      );
      if (error) {
        const errorMessage =
          error.context?.errorMessage || error.message || '알 수 없는 오류';
        throw new Error(errorMessage);
      }
      Alert.alert('등록 완료', '사기 정보가 성공적으로 등록되었습니다.');
      clearInputs();
      navigation.goBack();
    } catch (invokeError) {
      Alert.alert('등록 실패', `오류 발생: ${invokeError.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryChange = (selectedCategory) => {
    setCategory(category === selectedCategory ? '' : selectedCategory);
  };

  const handleScamReportSourceChange = (source) => {
    setScamReportSource(scamReportSource === source ? '' : source);
  };

  const handleCompanyTypeChange = (type) => {
    setCompanyType(type);
  };

  // 체크박스 선택 시 victimCircumstances (텍스트) 상태 업데이트
  const toggleVictimCircumstanceSelection = (item) => {
    let currentSelected = victimCircumstances
      .split(', ')
      .filter((s) => s.trim() !== '');
    const itemIndex = currentSelected.indexOf(item);

    if (item === '기타 직접입력') {
      setShowVictimCircumstanceTextInput(itemIndex === -1); // '기타 직접입력' 선택/해제 시 TextInput 토글
      if (itemIndex !== -1) {
        // '기타 직접입력' 해제 시
        currentSelected.splice(itemIndex, 1);
        // 혹시 '기타 직접입력: 상세내용' 형태였다면, 해당 부분도 제거하는 로직 추가 가능
      } else {
        // '기타 직접입력' 선택 시
        currentSelected.push(item);
      }
    } else {
      if (itemIndex !== -1) {
        currentSelected.splice(itemIndex, 1);
      } else {
        currentSelected.push(item);
      }
    }
    setVictimCircumstances(currentSelected.join(', '));
  };

  const handleTradedItemCategorySelect = (itemName) => {
    setTradedItemCategory(tradedItemCategory === itemName ? '' : itemName);
  };

  const renderDetailFields = () => {
    if (!category) return null;

    if (companyType === '개인') {
      switch (category) {
        case individualCategories[0]: // A. 보이스피싱 등
        case individualCategories[3]: // D. 투자 사기 등
        case individualCategories[5]: // F. 암호화폐
          return (
            <>
              <Text style={styles.label}>가해자와 대화를 하게 된 계기</Text>
              <TextInput
                style={styles.input}
                value={perpetratorDialogueTrigger}
                onChangeText={setPerpetratorDialogueTrigger}
                placeholder="예: 투자 권유 문자 수신"
              />
              <Text style={styles.label}>가해자의 접촉 경로</Text>
              <TextInput
                style={styles.input}
                value={perpetratorContactPath}
                onChangeText={setPerpetratorContactPath}
                placeholder={
                  category === individualCategories[3]
                    ? '직방, 다방, 당근부동산, 전화, 카톡, 기타...'
                    : '전화, 카톡, 네이버, 다음, 텔레그램, 문자, 기타...'
                }
              />
            </>
          );
        case individualCategories[1]: // B. 불법사금융 대리구매 (피해정황: 체크박스 + "기타 직접입력" 시 텍스트)
          return (
            <>
              <Text style={styles.label}>가해자와 대화를 하게 된 계기</Text>
              <TextInput
                style={styles.input}
                value={perpetratorDialogueTrigger}
                onChangeText={setPerpetratorDialogueTrigger}
              />
              <Text style={styles.label}>가해자의 접촉 경로</Text>
              <TextInput
                style={styles.input}
                value={perpetratorContactPath}
                onChangeText={setPerpetratorContactPath}
                placeholder="전화, 카톡, 네이버, 다음, 텔레그램, 문자, 기타..."
              />
              <Text style={styles.label}>피해 정황 (중복 선택 가능)</Text>
              <View style={styles.checkboxContainer}>
                {victimCircumstanceOptions.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={styles.checkboxItem}
                    onPress={() => toggleVictimCircumstanceSelection(item)}
                  >
                    <Icon
                      name={
                        victimCircumstances.includes(item)
                          ? 'checkbox-marked-outline'
                          : 'checkbox-blank-outline'
                      }
                      size={24}
                      color={
                        victimCircumstances.includes(item) ? '#3d5afe' : '#555'
                      }
                    />
                    <Text style={styles.checkboxLabel}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {showVictimCircumstanceTextInput && (
                <TextInput
                  style={[styles.input, styles.textArea, { marginTop: -10 }]}
                  value={victimCircumstances
                    .replace('기타 직접입력', '')
                    .replace(/^,\s*|,$/g, '')
                    .trim()} // "기타 직접입력" 제외한 실제 텍스트
                  onChangeText={(text) => {
                    const baseSelection = victimCircumstanceOptions.filter(
                      (opt) =>
                        victimCircumstances.includes(opt) &&
                        opt !== '기타 직접입력',
                    );
                    const newText =
                      text.trim() !== ''
                        ? [...baseSelection, '기타 직접입력', text].join(', ')
                        : [...baseSelection, '기타 직접입력'].join(', ');
                    setVictimCircumstances(newText);
                  }}
                  placeholder="기타 피해 정황을 직접 입력해주세요."
                  multiline
                  numberOfLines={2}
                />
              )}
            </>
          );
        case individualCategories[2]: // C. 중고나라 사기
          return (
            <>
              <Text style={styles.label}>거래물품</Text>
              <View style={styles.itemCategoryGrid}>
                {itemCategories.map((item) => (
                  <TouchableOpacity
                    key={item.name}
                    style={[
                      styles.itemCategoryButton,
                      tradedItemCategory === item.name &&
                        styles.itemCategoryButtonSelected,
                    ]}
                    onPress={() => handleTradedItemCategorySelect(item.name)}
                  >
                    <Image
                      source={item.image}
                      style={styles.itemCategoryImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          );
        case individualCategories[4]: // E. 게임 비실물
          return (
            <>
              <Text style={styles.label}>거래물품</Text>
              <View style={styles.itemCategoryGrid}>
                {gameItemCategories.map((item) => (
                  <TouchableOpacity
                    key={item.name}
                    style={[
                      styles.itemCategoryButton,
                      tradedItemCategory === item.name &&
                        styles.itemCategoryButtonSelected,
                    ]}
                    onPress={() => handleTradedItemCategorySelect(item.name)}
                  >
                    <Image
                      source={item.image}
                      style={styles.itemCategoryImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          );
        case individualCategories[6]: // G. 기타 (개인 - 피해정황: 텍스트 입력)
          return (
            <>
              <Text style={styles.label}>가해자와 대화를 하게 된 계기</Text>
              <TextInput
                style={styles.input}
                value={perpetratorDialogueTrigger}
                onChangeText={setPerpetratorDialogueTrigger}
                placeholder="예: 기타 사유"
              />
              <Text style={styles.label}>가해자의 접촉 경로</Text>
              <TextInput
                style={styles.input}
                value={perpetratorContactPath}
                onChangeText={setPerpetratorContactPath}
                placeholder="전화, 카톡, 네이버, 다음, 텔레그램, 문자, 기타..."
              />
              <Text style={styles.label}>피해 정황</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={victimCircumstances} // 단일 텍스트 상태 사용
                onChangeText={setVictimCircumstances}
                placeholder="피해 정황을 상세히 기술해주세요."
                multiline
                numberOfLines={3}
              />
            </>
          );
        default:
          return null;
      }
    } else if (companyType === '법인') {
      switch (category) {
        case corporateCategories[0]: // A. 노쇼 대리구매 사기
        case corporateCategories[4]: // E. 기타 (법인)
          return (
            <>
              <Text style={styles.label}>가해자와 대화를 하게 된 계기</Text>
              <TextInput
                style={styles.input}
                value={perpetratorDialogueTrigger}
                onChangeText={setPerpetratorDialogueTrigger}
              />
              <Text style={styles.label}>피해 정황</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={victimCircumstances}
                onChangeText={setVictimCircumstances}
                placeholder="대리구매 사기, 예약부도, 기타 등의 형식으로 입력해주세요."
                multiline
                numberOfLines={3}
              />
            </>
          );
        case corporateCategories[1]: // B. 공갈 협박 범죄
          return (
            <>
              <Text style={styles.label}>가해자와 대화를 하게 된 계기</Text>
              <TextInput
                style={styles.input}
                value={perpetratorDialogueTrigger}
                onChangeText={setPerpetratorDialogueTrigger}
              />
              <Text style={styles.label}>피해 정황</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={victimCircumstances}
                onChangeText={setVictimCircumstances}
                placeholder="피해 정황을 입력해주세요."
                multiline
                numberOfLines={3}
              />
            </>
          );
        case corporateCategories[2]: // C. 알바 범죄
          return (
            <>
              <Text style={styles.label}>가해자와 대화를 하게 된 계기</Text>
              <TextInput
                style={styles.input}
                value={perpetratorDialogueTrigger}
                onChangeText={setPerpetratorDialogueTrigger}
              />
              <Text style={styles.label}>피해 물품</Text>
              <TextInput
                style={styles.input}
                value={tradedItemCategory}
                onChangeText={setTradedItemCategory}
                placeholder="현금, 상품권, 카드충전 기타의 형식으로 입력해주세요."
              />
              <Text style={styles.label}>피해 정황</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={victimCircumstances}
                onChangeText={setVictimCircumstances}
                placeholder="피해 정황을 입력해주세요."
                multiline
                numberOfLines={3}
              />
            </>
          );
        case corporateCategories[3]: // D. 렌탈 사업
          return (
            <>
              <Text style={styles.label}>가해자와 대화를 하게 된 계기</Text>
              <TextInput
                style={styles.input}
                value={perpetratorDialogueTrigger}
                onChangeText={setPerpetratorDialogueTrigger}
              />
              <Text style={styles.label}>피해 물품</Text>
              <TextInput
                style={styles.input}
                value={tradedItemCategory}
                onChangeText={setTradedItemCategory}
                placeholder="자동차, 중장비, 명품물건, 기타의 형식으로 입력해주세요."
              />
              <Text style={styles.label}>피해 정황</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={victimCircumstances}
                onChangeText={setVictimCircumstances}
                placeholder="피해 정황을 입력해주세요."
                multiline
                numberOfLines={3}
              />
            </>
          );
        default:
          return null;
      }
    }
    return null;
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>사기 정보 입력</Text>
      <Text style={styles.guidance}>* 표시된 항목은 필수 입력입니다.</Text>
      <Text style={styles.label}>이름</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="이름 (선택)"
      />
      <Text style={styles.label}>
        법인/개인 <Text style={styles.required}>*</Text>{' '}
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
              {' '}
              {type}{' '}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {companyType && currentCategories.length > 0 && (
        <>
          <Text style={styles.label}>
            {' '}
            카테고리 <Text style={styles.required}>*</Text>{' '}
          </Text>
          <View style={styles.checkboxContainer}>
            {currentCategories.map((cat) => (
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
                <Text style={styles.checkboxLabel} numberOfLines={2}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {renderDetailFields()}

      <Text style={styles.label}>
        {' '}
        가해자 특정/불특정 여부 <Text style={styles.required}>*</Text>{' '}
      </Text>
      <View style={styles.optionSelectorContainer}>
        <TouchableOpacity
          style={[
            styles.optionButton,
            isPerpetratorIdentified === true && styles.optionButtonSelected,
          ]}
          onPress={() => setIsPerpetratorIdentified(true)}
        >
          <Text
            style={[
              styles.optionButtonText,
              isPerpetratorIdentified === true &&
                styles.optionButtonTextSelected,
            ]}
          >
            특정
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.optionButton,
            isPerpetratorIdentified === false && styles.optionButtonSelected,
          ]}
          onPress={() => setIsPerpetratorIdentified(false)}
        >
          <Text
            style={[
              styles.optionButtonText,
              isPerpetratorIdentified === false &&
                styles.optionButtonTextSelected,
            ]}
          >
            불특정
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>
        사건 개요 <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={caseSummary}
        onChangeText={setCaseSummary}
        multiline
        placeholder="사건의 개요를 상세히 적어주세요. 피해 규모, 거래하는 동안 바뀐 전화번호, 계좌번호가 있으면 적어주세요."
        numberOfLines={5}
      />

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
          ]}
          value={nationalIdBack}
          onChangeText={setNationalIdBack}
          placeholder="뒤 7자리"
          keyboardType="number-pad"
          maxLength={7}
          secureTextEntry
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
                  ? 'radiobox-marked'
                  : 'radiobox-blank'
              }
              size={24}
              color={scamReportSource === source ? '#3d5afe' : '#555'}
            />
            <Text style={styles.checkboxLabel}>{source}</Text>
          </TouchableOpacity>
        ))}
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
    marginBottom: 10,
    color: '#343a40',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
    color: '#495057',
    marginTop: 15,
  },
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
    minHeight: 50,
  },
  textArea: { height: 120, textAlignVertical: 'top' },
  phoneInputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  phoneInputSegment: { flex: 1, marginHorizontal: 2 },
  splitInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  splitInput: { flex: 1, marginBottom: 0, textAlign: 'center' },
  hyphen: { fontSize: 18, marginHorizontal: 8, color: '#868e96' },
  buttonContainer: { marginTop: 25, marginBottom: 50 },
  optionSelectorContainer: { flexDirection: 'row', marginBottom: 18 },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
    height: 50,
  },
  optionButtonSelected: { backgroundColor: '#3d5afe', borderColor: '#3d5afe' },
  optionButtonText: { fontSize: 16, color: '#495057' },
  optionButtonTextSelected: { color: 'white', fontWeight: 'bold' },
  checkboxContainer: { marginBottom: 10 },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 3,
  },
  checkboxLabel: { fontSize: 15, marginLeft: 8, color: '#333', flexShrink: 1 },
  itemCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginBottom: 18,
  },
  itemCategoryButton: {
    width: '31%',
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    padding: 5,
    backgroundColor: '#fff',
  },
  itemCategoryButtonSelected: {
    borderColor: '#3d5afe',
    borderWidth: 2,
    backgroundColor: '#e9eaff',
  },
  itemCategoryImage: { width: '100%', height: '100%', marginBottom: 5 },
  itemCategoryText: { fontSize: 11, textAlign: 'center', marginTop: 3 },
});

export default ReportScreen;
