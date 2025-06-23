import React, { useState, useEffect } from "react";
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
  KeyboardAvoidingView,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { launchImageLibrary } from "react-native-image-picker";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

import ImageSelectionModal from "../components/ImageSelectionModal";
import { bankImages } from "../assets/images/banks";
import { siteImages } from "../assets/images/sites";

const accountTypes = ["사업자", "개인"];
const genders = ["남성", "여성", "모름"];

const individualCategories = [
  "보이스피싱, 전기통신금융사기, 로맨스 스캠 사기",
  "불법사금융",
  "중고물품 사기",
  "투자 사기, 전세 사기",
  "암호화폐",
  "기타",
];

const corporateCategories = [
  "노쇼",
  "노쇼 대리구매 사기",
  "공갈 협박 범죄",
  "알바 범죄",
  "렌탈 사업 피해",
  "기타",
];

const scamReportSources = [
  "지인",
  "지인소개",
  "포털사이트 또는 SNS",
  "문자",
  "카톡",
  "전화",
  "기타",
];

const impersonationTypes = [
  "검사 사칭",
  "경찰 사칭",
  "가족 사칭",
  "금감원 사칭",
  "은행직원 사칭",
  "지인 사칭",
  "SNS로 특수직업 사칭 (로맨스 스캠 투자사기)",
  "기타",
];

const victimCircumstanceOptions = [
  "불법 추심",
  "과도한 이자 갈취",
  "허위 해외문자 발신",
  "SNS 불법 업로드",
  "욕설 및 폭언 협박",
  "기타",
];

const itemCategories = [
  {
    name: "MP3/PMP/전자사전",
    image: require("../assets/images/items/MP3_PMP_전자사전.png"),
  },
  {
    name: "휴대폰/주변기기",
    image: require("../assets/images/items/휴대폰_주변기기.png"),
  },
  { name: "화폐", image: require("../assets/images/items/화폐.png") },
  {
    name: "피싱/대출/계약",
    image: require("../assets/images/items/피싱_대출_계약.png"),
  },
  {
    name: "패션/의류",
    image: require("../assets/images/items/패션_의류.png"),
  },
  {
    name: "티켓/상품권",
    image: require("../assets/images/items/티켓_상품권.png"),
  },
  {
    name: "태블릿/노트북",
    image: require("../assets/images/items/태블릿_노트북.png"),
  },
  {
    name: "컴퓨터/주변기기",
    image: require("../assets/images/items/컴퓨터_주변기기.png"),
  },
  {
    name: "카메라/주변기기",
    image: require("../assets/images/items/카메라_주변기기.png"),
  },
  {
    name: "취미/인형/피규어",
    image: require("../assets/images/items/취미_인형_피규어.png"),
  },
  {
    name: "자동차/바이크",
    image: require("../assets/images/items/자동차_바이크.png"),
  },
  {
    name: "음악/영화/주변기기",
    image: require("../assets/images/items/음악_영화_주변기기.png"),
  },
  {
    name: "유아동/출산",
    image: require("../assets/images/items/유아동_출산.png"),
  },
  {
    name: "액세서리/귀금속",
    image: require("../assets/images/items/액세서리_귀금속.png"),
  },
  {
    name: "안경/선글라스",
    image: require("../assets/images/items/안경_선글라스.png"),
  },
  { name: "신발", image: require("../assets/images/items/신발.png") },
  {
    name: "식품/음료/의약품",
    image: require("../assets/images/items/식품_음료_의약품.png"),
  },
  { name: "시계", image: require("../assets/images/items/시계.png") },
  {
    name: "스포츠/레저/운동",
    image: require("../assets/images/items/스포츠_레저_운동.png"),
  },
  {
    name: "소프트웨어",
    image: require("../assets/images/items/소프트웨어.png"),
  },
  {
    name: "성인/사행성",
    image: require("../assets/images/items/성인_사행성.png"),
  },
  {
    name: "생활/주방/욕실용품",
    image: require("../assets/images/items/생활_주방_욕실용품.png"),
  },
  {
    name: "뷰티/미용/화장품",
    image: require("../assets/images/items/뷰티_미용_화장품.png"),
  },
  { name: "배송비", image: require("../assets/images/items/배송비.png") },
  {
    name: "문구/사무/소모품",
    image: require("../assets/images/items/문구_사무_소모품.png"),
  },
  {
    name: "동물/생물/식물/용품",
    image: require("../assets/images/items/동물_생물_식물_용품.png"),
  },
  {
    name: "도서/학습",
    image: require("../assets/images/items/도서_학습.png"),
  },
  { name: "기타", image: require("../assets/images/items/기타.png") },
  {
    name: "공구/중장비/농기구",
    image: require("../assets/images/items/공구_중장비_농기구.png"),
  },
  {
    name: "게임기/주변기기",
    image: require("../assets/images/items/게임기_주변기기.png"),
  },
  {
    name: "가전/전자제품",
    image: require("../assets/images/items/가전_전자제품.png"),
  },
  {
    name: "가방/지갑/잡화",
    image: require("../assets/images/items/가방_지갑_잡화.png"),
  },
  {
    name: "가구/인테리어",
    image: require("../assets/images/items/가구_인테리어.png"),
  },
];

function ReportScreen({ navigation }) {
  const { user } = useAuth();

  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [category, setCategory] = useState("");
  const [scamReportSource, setScamReportSource] = useState("");
  const [scamReportSourceOther, setScamReportSourceOther] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [gender, setGender] = useState("");
  const [phonePrefix, setPhonePrefix] = useState("");
  const [phoneMiddle, setPhoneMiddle] = useState("");
  const [phoneLast, setPhoneLast] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentCategories, setCurrentCategories] = useState([]);
  const [tradedItemCategory, setTradedItemCategory] = useState("");
  const [isPerpetratorIdentified, setIsPerpetratorIdentified] = useState(null);
  const [caseSummary, setCaseSummary] = useState("");
  const [attemptedFraud, setAttemptedFraud] = useState(null);
  const [damagePath, setDamagePath] = useState("");
  const [damagedItem, setDamagedItem] = useState("");
  const [impersonatedPerson, setImpersonatedPerson] = useState("");
  const [impersonatedPersonOther, setImpersonatedPersonOther] = useState("");
  const [showImpersonatedPersonTextInput, setShowImpersonatedPersonTextInput] =
    useState(false);
  const [nicknameEvidencePhoto, setNicknameEvidencePhoto] = useState(null);
  const [victimCircumstances, setVictimCircumstances] = useState("");
  const [showVictimCircumstanceTextInput, setShowVictimCircumstanceTextInput] =
    useState(false);
  const [illegalCollectionPhotos, setIllegalCollectionPhotos] = useState([]);
  const [isPhoneUnknown, setIsPhoneUnknown] = useState(false);
  const [isCashTransaction, setIsCashTransaction] = useState(false);

  const [bankName, setBankName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [isBankModalVisible, setIsBankModalVisible] = useState(false);
  const [isSiteModalVisible, setIsSiteModalVisible] = useState(false);

  useEffect(() => {
    if (companyType === "개인") setCurrentCategories(individualCategories);
    else if (companyType === "사업자")
      setCurrentCategories(corporateCategories);
    else setCurrentCategories([]);
    setCategory("");
  }, [companyType]);

  useEffect(() => {
    setVictimCircumstances("");
    setShowVictimCircumstanceTextInput(false);
    setTradedItemCategory("");
    setDamagePath("");
    setDamagedItem("");
    setImpersonatedPerson("");
    setImpersonatedPersonOther("");
    setShowImpersonatedPersonTextInput(false);
    setIllegalCollectionPhotos([]);
    setSiteName("");
  }, [category]);

  const clearInputs = () => {
    setAccountHolderName("");
    setAccountNumber("");
    setNickname("");
    setCategory("");
    setScamReportSource("");
    setScamReportSourceOther("");
    setCompanyType("");
    setGender("");
    setPhonePrefix("");
    setPhoneMiddle("");
    setPhoneLast("");
    setVictimCircumstances("");
    setShowVictimCircumstanceTextInput(false);
    setTradedItemCategory("");
    setIsPerpetratorIdentified(null);
    setCaseSummary("");
    setAttemptedFraud(null);
    setDamagePath("");
    setDamagedItem("");
    setImpersonatedPerson("");
    setImpersonatedPersonOther("");
    setShowImpersonatedPersonTextInput(false);
    setNicknameEvidencePhoto(null);
    setIllegalCollectionPhotos([]);
    setIsLoading(false);
    setIsUploading(false);
    setBankName("");
    setSiteName("");
  };

  const handleChooseNicknamePhoto = () => {
    launchImageLibrary({ mediaType: "photo" }, (response) => {
      if (response.didCancel) return;
      if (response.errorCode)
        Alert.alert("오류", `사진 선택 오류: ${response.errorMessage}`);
      else if (response.assets && response.assets.length > 0)
        setNicknameEvidencePhoto(response.assets[0]);
    });
  };

  const handleChooseIllegalCollectionPhotos = () => {
    const selectionLimit = 3 - illegalCollectionPhotos.length;
    if (selectionLimit <= 0) {
      Alert.alert("알림", "사진은 최대 3장까지 등록할 수 있습니다.");
      return;
    }
    launchImageLibrary({ mediaType: "photo", selectionLimit }, (response) => {
      if (response.didCancel) return;
      if (response.errorCode)
        Alert.alert("오류", `사진 선택 오류: ${response.errorMessage}`);
      else if (response.assets && response.assets.length > 0)
        setIllegalCollectionPhotos((prev) => [...prev, ...response.assets]);
    });
  };

  const handleRemoveIllegalCollectionPhoto = (uri) => {
    setIllegalCollectionPhotos((prev) =>
      prev.filter((photo) => photo.uri !== uri),
    );
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (
      !companyType ||
      !category ||
      !scamReportSource ||
      isPerpetratorIdentified === null ||
      !gender ||
      attemptedFraud === null ||
      !caseSummary.trim()
    ) {
      Alert.alert("입력 오류", "필수 항목(*)을 모두 입력/선택해주세요.");
      return;
    }

    if (scamReportSource === "기타" && !scamReportSourceOther.trim()) {
      Alert.alert(
        "입력 오류",
        '"사기를 당하게 된 경로"의 "기타" 항목을 입력해주세요.',
      );
      return;
    }

    if (isPhoneUnknown && (!nickname.trim() || !nicknameEvidencePhoto)) {
      Alert.alert(
        "입력 오류",
        "전화번호를 입력하지 않을 경우 SNS 닉네임과 증거 사진을 반드시 업로드해야 합니다.",
      );
      return;
    }
    if (
      category === individualCategories[0] &&
      impersonatedPerson === "기타" &&
      !impersonatedPersonOther.trim()
    ) {
      Alert.alert("입력 오류", '사칭 인물 "기타" 상세 내용을 입력해주세요.');
      return;
    }
    if (nickname.trim() && !nicknameEvidencePhoto) {
      Alert.alert(
        "입력 오류",
        "닉네임 관련 증거 사진을 반드시 업로드해야 합니다.",
      );
      return;
    }

    setIsLoading(true);

    try {
      const uploadFile = async (asset, folder) => {
        if (!asset) return null;
        const fileExt = asset.fileName.split(".").pop();
        const fileName = `${folder}-${user.id}-${Date.now()}-${Math.random()}.${fileExt}`;
        const filePath = `public/${fileName}`;

        const response = await fetch(asset.uri);
        const blob = await response.blob();

        const { error } = await supabase.storage
          .from("report-evidence")
          .upload(filePath, blob, { contentType: asset.type });
        if (error)
          throw new Error(`${folder} 사진 업로드 실패: ${error.message}`);

        const { data: urlData } = supabase.storage
          .from("report-evidence")
          .getPublicUrl(filePath);
        return urlData.publicUrl;
      };

      setIsUploading(true);
      const nicknameEvidenceUrl = await uploadFile(
        nicknameEvidencePhoto,
        "nickname",
      );
      const uploadPromises = illegalCollectionPhotos.map((photo) =>
        uploadFile(photo, "illegal-collection"),
      );
      const illegalCollectionEvidenceUrls = await Promise.all(uploadPromises);
      setIsUploading(false);

      const fullPhoneNumber =
        isPhoneUnknown || (!phonePrefix && !phoneMiddle && !phoneLast)
          ? null
          : `${phonePrefix}${phoneMiddle}${phoneLast}`;

      const finalImpersonatedPerson =
        impersonatedPerson === "기타"
          ? `기타: ${impersonatedPersonOther.trim()}`
          : impersonatedPerson;

      const finalScamReportSource =
        scamReportSource === "기타"
          ? `기타: ${scamReportSourceOther.trim()}`
          : scamReportSource;

      const reportData = {
        name: isCashTransaction ? null : accountHolderName.trim() || null,
        nickname: nickname.trim() || null,
        phone_number: fullPhoneNumber,
        account_number: isCashTransaction ? null : accountNumber.trim() || null,
        bank_name: isCashTransaction ? null : bankName || null,
        site_name: siteName || null,
        category,
        scam_report_source: finalScamReportSource,
        company_type: companyType,
        gender: gender,
        description: caseSummary.trim() || null,
        victim_circumstances: victimCircumstances.trim() || null,
        traded_item_category: tradedItemCategory || null,
        perpetrator_identified: isPerpetratorIdentified,
        attempted_fraud: attemptedFraud,
        damage_path: damagePath.trim() || null,
        damaged_item: damagedItem.trim() || null,
        impersonated_person: finalImpersonatedPerson || null,
        nickname_evidence_url: nicknameEvidenceUrl,
        illegal_collection_evidence_urls:
          illegalCollectionEvidenceUrls.filter(Boolean),
        is_cash_transaction: isCashTransaction,
      };

      const { error: functionError } = await supabase.functions.invoke(
        "insert-scammer-report",
        { body: reportData },
      );
      if (functionError)
        throw new Error(
          functionError.context?.errorMessage ||
            functionError.message ||
            "알 수 없는 오류",
        );

      Alert.alert("등록 완료", "사기 정보가 성공적으로 등록되었습니다.");
      clearInputs();
      navigation.goBack();
    } catch (error) {
      Alert.alert("등록 실패", `오류 발생: ${error.message}`);
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  const handleCategoryChange = (selectedCategory) =>
    setCategory((cat) => (cat === selectedCategory ? "" : selectedCategory));

  const handleScamReportSourceChange = (source) => {
    setScamReportSource(source);
    if (source !== "포털사이트 또는 SNS") {
      setSiteName("");
    }
    if (source !== "기타") {
      setScamReportSourceOther("");
    }
  };

  const handleAccountTypeChange = (type) => setCompanyType(type);
  const handleImpersonatedPersonChange = (type) => {
    const newType = impersonatedPerson === type ? "" : type;
    setImpersonatedPerson(newType);
    setShowImpersonatedPersonTextInput(newType === "기타");
    if (newType !== "기타") setImpersonatedPersonOther("");
  };
  const toggleVictimCircumstanceSelection = (item) => {
    const currentSelected = victimCircumstances
      .split(", ")
      .filter((s) => s.trim() !== "");
    const itemIndex = currentSelected.indexOf(item);
    if (itemIndex > -1) currentSelected.splice(itemIndex, 1);
    else currentSelected.push(item);
    if (item === "기타") setShowVictimCircumstanceTextInput(itemIndex === -1);
    setVictimCircumstances(currentSelected.join(", "));
  };
  const handleTradedItemCategorySelect = (itemName) =>
    setTradedItemCategory((cat) => (cat === itemName ? "" : itemName));

  const handlePhoneUnknownToggle = () => {
    const nextState = !isPhoneUnknown;
    setIsPhoneUnknown(nextState);
    if (nextState) {
      setPhonePrefix("");
      setPhoneMiddle("");
      setPhoneLast("");
    }
  };

  const handleCashTransactionToggle = () => {
    const nextState = !isCashTransaction;
    setIsCashTransaction(nextState);
    if (nextState) {
      setBankName("");
      setAccountNumber("");
      setAccountHolderName("");
    }
  };

  const renderDetailFields = () => {
    if (!category) return null;
    if (companyType === "개인") {
      switch (category) {
        case individualCategories[0]: // 보이스피싱
          return (
            <>
              <Text style={styles.label}>사칭 인물 기입</Text>
              <View style={styles.checkboxContainer}>
                {impersonationTypes.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={styles.checkboxItem}
                    onPress={() => handleImpersonatedPersonChange(type)}
                  >
                    <Icon
                      name={
                        impersonatedPerson === type
                          ? "radiobox-marked"
                          : "radiobox-blank"
                      }
                      size={24}
                      color={impersonatedPerson === type ? "#3d5afe" : "#555"}
                    />
                    <Text style={styles.checkboxLabel}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {showImpersonatedPersonTextInput && (
                <TextInput
                  style={[styles.input, { marginTop: -10 }]}
                  value={impersonatedPersonOther}
                  onChangeText={setImpersonatedPersonOther}
                  placeholder="사칭 인물을 직접 적어주세요."
                />
              )}
            </>
          );
        case individualCategories[1]: // 불법사금융
          return (
            <>
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
                          ? "checkbox-marked-outline"
                          : "checkbox-blank-outline"
                      }
                      size={24}
                      color={
                        victimCircumstances.includes(item) ? "#3d5afe" : "#555"
                      }
                    />
                    <Text style={styles.checkboxLabel}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {showVictimCircumstanceTextInput && (
                <TextInput
                  style={[styles.input, styles.textArea, { marginTop: -10 }]}
                  placeholder="기타 피해 정황을 직접 입력해주세요."
                  multiline
                />
              )}
              <Text style={styles.label}>
                불법추심 대화 내용 증거 사진 (최대 3장)
              </Text>
              <View style={styles.multiPhotoContainer}>
                {illegalCollectionPhotos.map((photo, index) => (
                  <View key={index} style={styles.photoPreviewWrapper}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.multiPreviewImage}
                    />
                    <TouchableOpacity
                      onPress={() =>
                        handleRemoveIllegalCollectionPhoto(photo.uri)
                      }
                      style={styles.removePhotoButton}
                    >
                      <Icon name="close-circle" size={24} color="#e74c3c" />
                    </TouchableOpacity>
                  </View>
                ))}
                {illegalCollectionPhotos.length < 3 && (
                  <TouchableOpacity
                    style={styles.photoUploadButtonSquare}
                    onPress={handleChooseIllegalCollectionPhotos}
                  >
                    <Icon name="camera-plus-outline" size={30} color="#555" />
                    <Text style={styles.photoUploadText}>사진 추가</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          );
        case individualCategories[2]: // 중고물품 사기
          return (
            <>
              <Text style={styles.label}>피해 경로</Text>
              <TextInput
                style={styles.input}
                value={damagePath}
                onChangeText={setDamagePath}
                placeholder="예: 중고나라, 번개장터 등"
              />
              <Text style={styles.label}>피해 물품</Text>
              <TextInput
                style={styles.input}
                value={damagedItem}
                onChangeText={setDamagedItem}
                placeholder="예: 아이폰 15, 명품 가방 등"
              />
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
        case individualCategories[4]: // 암호화폐
          return (
            <>
              <Text style={styles.label}>피해 경로</Text>
              <TextInput
                style={styles.input}
                value={damagePath}
                onChangeText={setDamagePath}
                placeholder="예: 코인거래소, 텔레그램 등"
              />
              <Text style={styles.label}>피해 물품</Text>
              <TextInput
                style={styles.input}
                value={damagedItem}
                onChangeText={setDamagedItem}
                placeholder="예: 비트코인, 이더리움 등"
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <ImageSelectionModal
          visible={isBankModalVisible}
          onClose={() => setIsBankModalVisible(false)}
          items={bankImages}
          onSelect={setBankName}
          title="은행 선택"
        />
        <ImageSelectionModal
          visible={isSiteModalVisible}
          onClose={() => setIsSiteModalVisible(false)}
          items={siteImages}
          onSelect={(name) => {
            setSiteName(name);
            if (name === "직접쓰기") {
              setTimeout(
                () =>
                  Alert.prompt(
                    "사이트 직접 입력",
                    "사이트 이름을 입력해주세요.",
                    [
                      { text: "취소", style: "cancel" },
                      {
                        text: "확인",
                        onPress: (text) => setSiteName(text || ""),
                      },
                    ],
                    "plain-text",
                    siteName !== "직접쓰기" ? siteName : "",
                  ),
                Platform.OS === "ios" ? 500 : 0,
              );
            }
          }}
          title="사이트 선택"
        />

        <Text style={styles.title}>사기 정보 입력</Text>
        <Text style={styles.guidance}>* 표시된 항목은 필수 입력입니다.</Text>

        <Text style={styles.label}>
          피해자 해당사항 <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.optionSelectorContainer}>
          {accountTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.optionButton,
                companyType === type && styles.optionButtonSelected,
              ]}
              onPress={() => handleAccountTypeChange(type)}
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
        {companyType && currentCategories.length > 0 && (
          <>
            <Text style={styles.label}>
              카테고리 <Text style={styles.required}>*</Text>
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
                        ? "checkbox-marked-outline"
                        : "checkbox-blank-outline"
                    }
                    size={24}
                    color={category === cat ? "#3d5afe" : "#555"}
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

        {/* --- 사기를 당하게 된 경로 섹션 --- */}
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
                    ? "radiobox-marked"
                    : "radiobox-blank"
                }
                size={24}
                color={scamReportSource === source ? "#3d5afe" : "#555"}
              />
              <Text style={styles.checkboxLabel}>{source}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* --- '기타' 선택 시 나타나는 입력창 (수정/추가된 부분) --- */}
        {scamReportSource === "기타" && (
          <TextInput
            style={[styles.input, { marginTop: -10, marginBottom: 18 }]}
            value={scamReportSourceOther}
            onChangeText={setScamReportSourceOther}
            placeholder="사기 경로를 직접 입력해주세요."
          />
        )}

        {scamReportSource === "포털사이트 또는 SNS" && (
          <View>
            <Text style={styles.label}>사이트 이름</Text>
            <View style={styles.inputWithButtonContainer}>
              <TextInput
                style={[styles.input, styles.inputWithButton]}
                value={siteName}
                placeholder="오른쪽 버튼으로 사이트 선택"
                editable={false}
                pointerEvents="none"
              />
              <TouchableOpacity
                style={styles.inlineButton}
                onPress={() => setIsSiteModalVisible(true)}
              >
                <Text style={styles.inlineButtonText}>선택</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.label}>
          피해, 미수 여부 <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.optionSelectorContainer}>
          <TouchableOpacity
            style={[
              styles.optionButton,
              attemptedFraud === true && styles.optionButtonSelected,
            ]}
            onPress={() => setAttemptedFraud(true)}
          >
            <Text
              style={[
                styles.optionButtonText,
                attemptedFraud === true && styles.optionButtonTextSelected,
              ]}
            >
              피해
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.optionButton,
              attemptedFraud === false && styles.optionButtonSelected,
            ]}
            onPress={() => setAttemptedFraud(false)}
          >
            <Text
              style={[
                styles.optionButtonText,
                attemptedFraud === false && styles.optionButtonTextSelected,
              ]}
            >
              미수
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.label}>
          용의자 성별 <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.optionSelectorContainer}>
          {genders.map((gen) => (
            <TouchableOpacity
              key={gen}
              style={[
                styles.optionButton,
                gender === gen && styles.optionButtonSelected,
              ]}
              onPress={() => setGender(gen)}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  gender === gen && styles.optionButtonTextSelected,
                ]}
              >
                {gen}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>
          가해자 특정/불특정 여부 <Text style={styles.required}>*</Text>
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

        <Text style={styles.label}>SNS 닉네임</Text>
        <TextInput
          style={styles.input}
          value={nickname}
          onChangeText={setNickname}
          placeholder="닉네임 (입력 시 사진 첨부 필수)"
        />
        {nickname.trim() !== "" && (
          <View style={styles.photoUploadContainer}>
            <Text style={styles.label}>
              닉네임 관련 증거 사진 <Text style={styles.required}>*</Text>
            </Text>
            {nicknameEvidencePhoto ? (
              <View>
                <Image
                  source={{ uri: nicknameEvidencePhoto.uri }}
                  style={styles.previewImage}
                />
                <TouchableOpacity
                  style={styles.changePhotoButton}
                  onPress={handleChooseNicknamePhoto}
                >
                  <Text style={styles.changePhotoButtonText}>사진 변경</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.photoUploadButton}
                onPress={handleChooseNicknamePhoto}
              >
                <Icon name="camera-plus-outline" size={30} color="#555" />
                <Text style={styles.photoUploadText}>사진 선택하기</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.labelContainer}>
          <Text style={styles.label}>나에게 피해를 입혔던 전화번호</Text>
          <TouchableOpacity
            style={styles.checkboxItem}
            onPress={handlePhoneUnknownToggle}
          >
            <Icon
              name={
                isPhoneUnknown ? "checkbox-marked" : "checkbox-blank-outline"
              }
              size={24}
              color={isPhoneUnknown ? "#3d5afe" : "#555"}
            />
            <Text style={styles.checkboxLabel}>모름</Text>
          </TouchableOpacity>
        </View>
        {isPhoneUnknown && (
          <Text style={styles.guidanceText}>
            전화번호를 입력하지 않을 경우 SNS 닉네임과 이미지를 필수 업로드 해야
            합니다.
          </Text>
        )}
        <View style={styles.phoneInputContainer}>
          <TextInput
            style={[styles.input, styles.phoneInputSegment]}
            value={phonePrefix}
            onChangeText={setPhonePrefix}
            placeholder="000"
            keyboardType="number-pad"
            maxLength={3}
            editable={!isPhoneUnknown}
          />
          <TextInput
            style={[styles.input, styles.phoneInputSegment]}
            value={phoneMiddle}
            onChangeText={setPhoneMiddle}
            placeholder="0000"
            keyboardType="number-pad"
            maxLength={4}
            editable={!isPhoneUnknown}
          />
          <TextInput
            style={[styles.input, styles.phoneInputSegment]}
            value={phoneLast}
            onChangeText={setPhoneLast}
            placeholder="0000"
            keyboardType="number-pad"
            maxLength={4}
            editable={!isPhoneUnknown}
          />
        </View>

        <View style={styles.labelContainer}>
          <Text style={styles.label}>
            {attemptedFraud === false
              ? "피해당할 뻔 했던 계좌번호 (선택)"
              : "피해금 송금 정보 (선택)"}
          </Text>
          {(category === "보이스피싱, 전기통신금융사기, 로맨스 스캠 사기" ||
            category === "불법사금융") && (
            <TouchableOpacity
              style={styles.checkboxItem}
              onPress={handleCashTransactionToggle}
            >
              <Icon
                name={
                  isCashTransaction
                    ? "checkbox-marked"
                    : "checkbox-blank-outline"
                }
                size={24}
                color={isCashTransaction ? "#3d5afe" : "#555"}
              />
              <Text style={styles.checkboxLabel}>현금 전달</Text>
            </TouchableOpacity>
          )}
        </View>

        {!isCashTransaction && category !== "암호화폐" && (
          <>
            <View style={styles.inputWithButtonContainer}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputWithButton,
                  isCashTransaction && styles.disabledInput,
                ]}
                value={bankName}
                placeholder="은행 선택"
                editable={false}
              />
              <TouchableOpacity
                style={styles.inlineButton}
                onPress={() => setIsBankModalVisible(true)}
                disabled={isCashTransaction}
              >
                <Text style={styles.inlineButtonText}>선택</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, isCashTransaction && styles.disabledInput]}
              value={accountHolderName}
              onChangeText={setAccountHolderName}
              placeholder="예금주명"
              editable={!isCashTransaction}
            />
          </>
        )}
        {!isCashTransaction && (
          <TextInput
            style={[styles.input, isCashTransaction && styles.disabledInput]}
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder={
              category === "암호화폐"
                ? "전자지갑주소"
                : "계좌번호 (- 없이 적어주세요)"
            }
            keyboardType={category === "암호화폐" ? "default" : "number-pad"}
            editable={!isCashTransaction}
          />
        )}

        <Text style={styles.label}>
          사건 개요 <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={caseSummary}
          onChangeText={setCaseSummary}
          multiline
          placeholder="사건의 개요를 상세히 적어주세요. 누가 언제 어디서 무엇을 어떻게 왜? 피해를 당했는지, 육하원칙에 맞게 상세히 써주세요. 이름, 생년월일, 전화번호, 주소를 알고 계실 경우 기입해주세요."
          numberOfLines={5}
        />

        <View style={styles.buttonContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#3d5afe" />
          ) : (
            <Button
              title="등록하기"
              onPress={handleSubmit}
              color="#3d5afe"
              disabled={isUploading}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f8f9fa" },
  guidance: {
    fontSize: 13,
    color: "#e74c3c",
    textAlign: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
    color: "#343a40",
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: "600",
    color: "#495057",
    marginTop: 15,
  },
  required: { color: "#e03131" },
  input: {
    borderWidth: 1,
    borderColor: "#ced4da",
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "white",
    fontSize: 16,
    color: "#212529",
    minHeight: 50,
  },
  textArea: { height: 120, textAlignVertical: "top" },
  phoneInputContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  phoneInputSegment: { flex: 1, marginHorizontal: 2 },
  buttonContainer: { marginTop: 25, marginBottom: 50 },
  optionSelectorContainer: {
    flexDirection: "row",
    marginBottom: 10,
    justifyContent: "space-between",
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 8,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
    height: 50,
  },
  optionButtonSelected: { backgroundColor: "#3d5afe", borderColor: "#3d5afe" },
  optionButtonText: { fontSize: 16, color: "#495057" },
  optionButtonTextSelected: { color: "white", fontWeight: "bold" },
  checkboxContainer: { marginBottom: 10 },
  checkboxItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 3,
  },
  checkboxLabel: { fontSize: 15, marginLeft: 8, color: "#333", flexShrink: 1 },
  itemCategoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    marginBottom: 18,
  },
  itemCategoryButton: {
    width: "31%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    padding: 5,
    backgroundColor: "#fff",
  },
  itemCategoryButtonSelected: {
    borderColor: "#3d5afe",
    borderWidth: 2,
    backgroundColor: "#e9eaff",
  },
  itemCategoryImage: { width: "100%", height: "100%", marginBottom: 5 },
  itemCategoryText: { fontSize: 11, textAlign: "center", marginTop: 3 },
  photoUploadContainer: { marginTop: 5, marginBottom: 15 },
  photoUploadButton: {
    backgroundColor: "#e9ecef",
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 8,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    borderStyle: "dashed",
  },
  photoUploadText: { marginTop: 8, color: "#495057" },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  changePhotoButton: {
    backgroundColor: "#6c757d",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  changePhotoButtonText: { color: "white", fontWeight: "bold" },
  multiPhotoContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginTop: 5,
  },
  photoPreviewWrapper: {
    width: "31%",
    aspectRatio: 1,
    marginRight: "2%",
    marginBottom: 10,
    position: "relative",
  },
  multiPreviewImage: { width: "100%", height: "100%", borderRadius: 8 },
  removePhotoButton: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "white",
    borderRadius: 12,
  },
  photoUploadButtonSquare: {
    width: "31%",
    aspectRatio: 1,
    backgroundColor: "#e9ecef",
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderStyle: "dashed",
  },
  inputWithButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  inlineButton: {
    height: 50,
    paddingHorizontal: 15,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#e9ecef",
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: "#ced4da",
  },
  inlineButtonText: {
    color: "#3d5afe",
    fontWeight: "bold",
  },
  labelContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
  },
  guidanceText: {
    fontSize: 12,
    color: "#868e96",
    marginTop: 5,
    marginBottom: 10,
  },
  disabledInput: {
    backgroundColor: "#e9ecef",
    color: "#adb5bd",
  },
  inputWithButton: {
    flex: 1,
    marginRight: 0,
    borderRightWidth: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
});

export default ReportScreen;
