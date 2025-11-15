import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  TouchableOpacity,
  Image,
  Platform,
  Button,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import RNBlobUtil from 'react-native-blob-util';
import { Buffer } from 'buffer';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext'; // useAuth hook

const POLICE_STATION_OPTIONS = [
  '서울중부경찰서',
  '서울종로경찰서',
  '서울남대문경찰서',
  '서울서대문경찰서',
  '서울혜화경찰서',
  '서울용산경찰서',
  '서울성북경찰서',
  '서울동대문경찰서',
  '서울마포경찰서',
  '서울영등포경찰서',
  '서울성동경찰서',
  '서울동작경찰서',
  '서울광진경찰서',
  '서울서부경찰서',
  '서울강북경찰서',
  '서울금천경찰서',
  '서울중랑경찰서',
  '서울강남경찰서',
  '서울관악경찰서',
  '서울강서경찰서',
  '서울강동경찰서',
  '서울종암경찰서',
  '서울구로경찰서',
  '서울서초경찰서',
  '서울양천경찰서',
  '서울송파경찰서',
  '서울노원경찰서',
  '서울방배경찰서',
  '서울은평경찰서',
  '서울도봉경찰서',
  '서울수서경찰서',
  '부산중부경찰서',
  '부산동래경찰서',
  '부산영도경찰서',
  '부산동부경찰서',
  '부산진경찰서',
  '부산서부경찰서',
  '부산남부경찰서',
  '부산해운대경찰서',
  '부산사상경찰서',
  '부산금정경찰서',
  '부산사하경찰서',
  '부산연제경찰서',
  '부산강서경찰서',
  '부산북부경찰서',
  '부산기장경찰서',
  '대구중부경찰서',
  '대구동부경찰서',
  '대구서부경찰서',
  '대구남부경찰서',
  '대구북부경찰서',
  '대구수성경찰서',
  '대구달서경찰서',
  '대구성서경찰서',
  '대구달성경찰서',
  '대구강북경찰서',
  '인천중부',
  '인천미추홀경찰서',
  '인천남동경찰서',
  '인천논현경찰서',
  '인천부평경찰서',
  '인천삼산경찰서',
  '인천서부경찰서',
  '인천계양경찰서',
  '인천연수경찰서',
  '인천강화경찰서',
  '광주동부경찰서',
  '광주서부경찰서',
  '광주남부경찰서',
  '광주북부경찰서',
  '광주광산경찰서',
  '대전중부경찰서',
  '대전동부경찰서',
  '대전서부경찰서',
  '대전대덕경찰서',
  '대전둔산경찰서',
  '대전유성경찰서',
  '울산중부경찰서',
  '울산남부경찰서',
  '울산동부경찰서',
  '울산북부경찰서',
  '울산울주경찰서',
  '세종남부경찰서',
  '세종북부경찰서',
  '수원중부경찰서',
  '수원남부경찰서',
  '수원서부경찰서',
  '안양동안경찰서',
  '안양만안경찰서',
  '과천경찰서',
  '군포경찰서',
  '성남수정경찰서',
  '성남중원경찰서',
  '분당경찰서',
  '부천소사 경찰서',
  '부천원미 경찰서',
  '부천오정 경찰서',
  '광명경찰서',
  '안산단원경찰서',
  '안산상록경찰서',
  '시흥경찰서',
  '평택경찰서',
  '오산경찰서',
  '화성서부경찰서',
  '화성동탄경찰서',
  '용인동부경찰서',
  '용인서부경찰서',
  '광주의왕경찰서',
  '의왕경찰서',
  '하남경찰서',
  '이천경찰서',
  '김포경찰서',
  '안성경찰서',
  '여주경찰서',
  '양평경찰서',
  '의정부경찰서',
  '양주경찰서',
  '고양경찰서',
  '일산동부경찰서',
  '일산서부경찰서',
  '남양주남부경찰서',
  '남양주북부경찰서',
  '구리경찰서',
  '동두천경찰서',
  '파주경찰서',
  '포천경찰서',
  '가평경찰서',
  '연천경찰서',
  '춘천경찰서',
  '강릉경찰서',
  '원주경찰서',
  '동해경찰서',
  '태백경찰서',
  '속초경찰서',
  '삼척경찰서',
  '영월경찰서',
  '정선경찰서',
  '홍천경찰서',
  '평창경찰서',
  '횡성경찰서',
  '고성경찰서',
  '인제경찰서',
  '철원경찰서',
  '화천경찰서',
  '양구경찰서',
  '청주흥덕경찰서',
  '청주상당경찰서',
  '청주청원경찰서',
  '충주경찰서',
  '제천경찰서',
  '영동경찰서',
  '괴산경찰서',
  '단양경찰서',
  '보은경찰서',
  '옥천경찰서',
  '음성경찰서',
  '진천경찰서',
  '천안서북경찰서',
  '천안동남경찰서',
  '서산경찰서',
  '논산경찰서',
  '아산경찰서',
  '공주경찰서',
  '보령경찰서',
  '당진경찰서',
  '홍성경찰서',
  '예산경찰서',
  '부여경찰서',
  '서천경찰서',
  '금산경찰서',
  '청양경찰서',
  '태안경찰서',
  '전주완산경찰서',
  '전주덕진경찰서',
  '군산경찰서',
  '익산경찰서',
  '정읍경찰서',
  '남원경찰서',
  '김제경찰서',
  '완주경찰서',
  '고창경찰서',
  '부안경찰서',
  '임실경찰서',
  '순창경찰서',
  '진안경찰서',
  '장수경찰서',
  '무주경찰서',
  '목포경찰서',
  '여수경찰서',
  '순천경찰서',
  '나주경찰서',
  '광양경찰서',
  '고흥경찰서',
  '해남경찰서',
  '장흥경찰서',
  '보성경찰서',
  '영광경찰서',
  '화순경찰서',
  '함평경찰서',
  '영암경찰서',
  '장성경찰서',
  '강진경찰서',
  '담양경찰서',
  '곡성경찰서',
  '완도경찰서',
  '무안경찰서',
  '진도경찰서',
  '구례경찰서',
  '신안경찰서',
  '경주경찰서',
  '포항북부경찰서',
  '포항남부경찰서',
  '구미경찰서',
  '경산경찰서',
  '안동경찰서',
  '김천경찰서',
  '영주경찰서',
  '영천경찰서',
  '상주경찰서',
  '문경경찰서',
  '칠곡경찰서',
  '의성경찰서',
  '청도경찰서',
  '영덕경찰서',
  '울진경찰서',
  '봉화경찰서',
  '예천경찰서',
  '성주경찰서',
  '청송경찰서',
  '영양경찰서',
  '군위경찰서',
  '고령경찰서',
  '울릉경찰서',
  '창원중부경찰서',
  '창원서부경찰서',
  '마산중부경찰서',
  '마산동부경찰서',
  '진주경찰서',
  '김해중부경찰서',
  '김해서부경찰서',
  '진해경찰서',
  '통영경찰서',
  '사천경찰서',
  '거제경찰서',
  '밀양경찰서',
  '양산경찰서',
  '거창경찰서',
  '합천경찰서',
  '창녕경찰서',
  '고성경찰서',
  '하동경찰서',
  '남해경찰서',
  '함양경찰서',
  '산청경찰서',
  '함안경찰서',
  '의령경찰서',
  '제주동부경찰서',
  '제주서부경찰서',
  '서귀포경찰서',
];

export default function ArrestNewsCreateScreen() {
  const navigation = useNavigation();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [category, setCategory] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [arrestStatus, setArrestStatus] = useState(null);
  const [reportedToPolice, setReportedToPolice] = useState(null);
  const [policeSearch, setPoliceSearch] = useState('');
  const [selectedStation, setSelectedStation] = useState(null);

  useEffect(() => {
    if (reportedToPolice !== true) {
      setSelectedStation(null);
      setPoliceSearch('');
    }
  }, [reportedToPolice]);

  const filteredStations = useMemo(() => {
    if (!policeSearch.trim()) return POLICE_STATION_OPTIONS;
    const keyword = policeSearch.trim().toLowerCase();
    return POLICE_STATION_OPTIONS.filter(name =>
      name.toLowerCase().includes(keyword),
    );
  }, [policeSearch]);

  const handleChoosePhotos = () => {
    const limit = 3 - photos.length;
    if (limit <= 0) {
      Alert.alert('알림', '사진은 최대 3장까지 등록할 수 있습니다.');
      return;
    }
    launchImageLibrary(
      { mediaType: 'photo', selectionLimit: limit, quality: 0.7 },
      res => {
        if (res.didCancel) return;
        if (res.errorCode) {
          Alert.alert('오류', `사진 선택 오류: ${res.errorMessage}`);
        } else if (res.assets) {
          setPhotos(prev => [...prev, ...res.assets]);
        }
      },
    );
  };

  const handleRemovePhoto = uri =>
    setPhotos(prev => prev.filter(p => p.uri !== uri));

  const getFilePath = async uri => {
    if (Platform.OS === 'android' && uri.startsWith('content://')) {
      const stat = await RNBlobUtil.fs.stat(uri);
      return stat.path;
    }
    return uri.replace('file://', '');
  };

  const uploadToSupabase = async photo => {
    const path = await getFilePath(photo.uri);
    const base64Data = await RNBlobUtil.fs.readFile(path, 'base64');
    const arrayBuffer = Buffer.from(base64Data, 'base64');

    const ext = photo.fileName?.split('.').pop() || 'jpg';
    const fileName = `${user.id}_${Date.now()}.${ext}`;
    const storagePath = `arrest-news/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(storagePath, arrayBuffer, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError)
      throw new Error(`사진 업로드 실패: ${uploadError.message}`);

    const { data: urlData } = supabase.storage
      .from('post-images')
      .getPublicUrl(storagePath);

    if (!urlData || !urlData.publicUrl)
      throw new Error('URL 생성에 실패했습니다.');

    return urlData.publicUrl;
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!title.trim()) {
      Alert.alert('입력 오류', '제목을 모두 입력해주세요.');
      return;
    }
    if (!arrestStatus) {
      Alert.alert('입력 오류', '검거/활동 상태를 선택해주세요.');
      return;
    }
    if (reportedToPolice === null) {
      Alert.alert('입력 오류', '경찰 신고 여부를 선택해주세요.');
      return;
    }
    if (reportedToPolice && !selectedStation) {
      Alert.alert('입력 오류', '신고하신 경찰서를 선택해주세요.');
      return;
    }
    if (!user) {
      Alert.alert('오류', '로그인 정보가 없습니다.');
      return;
    }

    setIsLoading(true);
    try {
      const authorNameToSubmit = profile?.nickname || user.email || '관리자';

      const imageUrls = await Promise.all(photos.map(p => uploadToSupabase(p)));

      const { error: insertError } = await supabase.from('arrest_news').insert({
        title: title.trim(),
        content: content.trim() || null,
        author_name: authorNameToSubmit,
        link_url: linkUrl.trim() || null,
        category: category.trim() || null,
        image_urls: imageUrls.length ? imageUrls : null,
        user_id: user.id,
        arrest_status: arrestStatus,
        reported_to_police: reportedToPolice,
        police_station_name: reportedToPolice ? selectedStation : null,
      });
      if (insertError) throw insertError;

      Alert.alert('작성 완료', '게시글이 성공적으로 등록되었습니다.');
      navigation.goBack();
    } catch (err) {
      console.error('Submit Error:', err);
      Alert.alert(
        '작성 실패',
        err.message || '알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>새 검거소식 작성</Text>
      <Text style={styles.label}>검거/활동 상태 *</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, arrestStatus === 'arrested' && styles.toggleButtonActive]}
          onPress={() => setArrestStatus('arrested')}>
          <Text
            style={[styles.toggleButtonText, arrestStatus === 'arrested' && styles.toggleButtonTextActive]}>검거</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, arrestStatus === 'active' && styles.toggleButtonActive]}
          onPress={() => setArrestStatus('active')}>
          <Text
            style={[styles.toggleButtonText, arrestStatus === 'active' && styles.toggleButtonTextActive]}>활동</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.helperList}>
        <Text style={styles.helperText}>- 검거 : 해당 범죄자가 이미 검거됨</Text>
        <Text style={styles.helperText}>- 활동 : 해당 범죄자가 검거되지 않고 활동 중임</Text>
      </View>

      <Text style={styles.label}>경찰에 신고하셨습니까? *</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, reportedToPolice === true && styles.toggleButtonActive]}
          onPress={() => setReportedToPolice(true)}>
          <Text
            style={[styles.toggleButtonText, reportedToPolice === true && styles.toggleButtonTextActive]}>예</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, reportedToPolice === false && styles.toggleButtonActive]}
          onPress={() => setReportedToPolice(false)}>
          <Text
            style={[styles.toggleButtonText, reportedToPolice === false && styles.toggleButtonTextActive]}>아니오</Text>
        </TouchableOpacity>
      </View>

      {reportedToPolice === true && (
        <View style={styles.policeSearchContainer}>
          <TextInput
            style={styles.input}
            value={policeSearch}
            onChangeText={setPoliceSearch}
            placeholder="경찰서 이름 또는 지역 검색"
            placeholderTextColor="#6c757d"
          />
          <FlatList
            data={filteredStations}
            keyExtractor={(item, index) => `${item}-${index}`}
            nestedScrollEnabled
            style={styles.policeList}
            ListEmptyComponent={() => (
              <Text style={styles.emptyPoliceText}>검색 결과가 없습니다.</Text>
            )}
            renderItem={({ item }) => {
              const isSelected = selectedStation === item;
              return (
                <TouchableOpacity
                  style={[styles.policeItem, isSelected && styles.policeItemSelected]}
                  onPress={() => setSelectedStation(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.policeName}>{item}</Text>
                  </View>
                  {isSelected && (
                    <Icon name="check-circle" size={22} color="#3d5afe" />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="제목 *"
        placeholderTextColor="#6c757d"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="내용"
        placeholderTextColor="#6c757d"
        value={content}
        onChangeText={setContent}
        multiline
      />
      <TextInput
        style={styles.input}
        placeholder="카테고리"
        placeholderTextColor="#6c757d"
        value={category}
        onChangeText={setCategory}
      />
      <TextInput
        style={styles.input}
        placeholder="관련 링크 URL"
        placeholderTextColor="#6c757d"
        value={linkUrl}
        onChangeText={setLinkUrl}
        keyboardType="url"
        autoCapitalize="none"
      />

      <Text style={styles.label}>사진 첨부 (최대 3장)</Text>
      <View style={styles.photoContainer}>
        {photos.map(p => (
          <View key={p.uri} style={styles.photoWrapper}>
            <Image source={{ uri: p.uri }} style={styles.thumbnail} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemovePhoto(p.uri)}>
              <Icon name="close-circle" size={24} color="#e74c3c" />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < 3 && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleChoosePhotos}>
            <Icon name="camera-plus" size={30} color="#868e96" />
            <Text style={styles.addButtonText}>사진 추가</Text>
          </TouchableOpacity>
        )}
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
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#34495e',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ced4da',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: 'white',
    fontSize: 16,
    color: '#212529',
    marginBottom: 15,
  },
  textArea: {
    minHeight: 150,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 10,
    marginTop: 10,
  },
  helperList: {
    marginBottom: 10,
  },
  helperText: {
    fontSize: 13,
    color: '#868e96',
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    marginBottom: 10,
    marginTop: 4,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 4,
  },
  toggleButtonActive: {
    borderColor: '#3d5afe',
    backgroundColor: '#e8f0ff',
  },
  toggleButtonText: {
    fontSize: 16,
    color: '#495057',
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: '#1a237e',
  },
  policeSearchContainer: {
    marginBottom: 20,
  },
  policeList: {
    maxHeight: 240,
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  policeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  policeItemSelected: {
    backgroundColor: '#edf2ff',
    borderLeftWidth: 3,
    borderLeftColor: '#3d5afe',
  },
  policeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212529',
  },
  emptyPoliceText: {
    textAlign: 'center',
    paddingVertical: 20,
    color: '#868e96',
  },
  photoContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  photoWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
    marginRight: 10,
    marginBottom: 10,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#e9ecef',
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  addButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 12,
    color: '#868e96',
    marginTop: 4,
  },
  buttonContainer: {
    marginTop: 30,
    marginBottom: 40,
  },
});
