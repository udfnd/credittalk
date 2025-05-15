// src/screens/SearchBaseScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Button,
  TextInput,
  Keyboard,
  TouchableOpacity, // 검색 버튼용
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'; // 아이콘 사용
import { supabase } from '../lib/supabaseClient';

const ITEMS_PER_PAGE = 10;

export const SEARCH_TYPES = {
  UNIFIED: 'unified', // 이름, 연락처, 계좌 모두 검색
  ACCOUNT: 'account', // 계좌만 검색 (이제 HomeScreen에서 직접 사용 안 함)
  PHONE: 'phone', // 연락처만 검색 (이제 HomeScreen에서 직접 사용 안 함)
  NUMERIC_UNIFIED: 'numeric_unified', // 연락처 또는 계좌번호 검색 (HomeScreen에서 사용)
};

// 기존 maskPhoneNumber, maskAccountNumber 함수는 변경 없이 유지

const maskPhoneNumber = (phoneNumber) => {
  if (
    !phoneNumber ||
    typeof phoneNumber !== 'string' ||
    phoneNumber.length < 10
  ) {
    return phoneNumber || '';
  }
  const chars = phoneNumber.split('');
  // 더 안전하고 일관된 마스킹 로직 (예: 중간 4자리 마스킹)
  if (phoneNumber.length === 10) {
    // 02-123-4567
    for (let i = 3; i < 6; i++) chars[i] = '*';
  } else if (phoneNumber.length === 11) {
    // 010-1234-5678
    for (let i = 3; i < 7; i++) chars[i] = '*';
  } else {
    // 그 외 길이 (예상치 못한 경우)
    const index1 = Math.floor(Math.random() * 4) + 3;
    const index2 = Math.floor(Math.random() * 4) + 7;
    if (chars[index1]) chars[index1] = '*';
    if (chars[index2]) chars[index2] = '*';
  }
  return chars.join('');
};

const maskAccountNumber = (accountNumber) => {
  if (
    !accountNumber ||
    typeof accountNumber !== 'string' ||
    accountNumber.length < 4
  ) {
    return accountNumber || '';
  }
  const chars = accountNumber.split('');
  const len = accountNumber.length;
  // 뒤에서 2~5번째 숫자를 *로 마스킹 (최소 2개)
  const numToMask = Math.min(4, Math.max(2, len - 4)); // 계좌번호 길이에 따라 유동적이지만 최소 2개, 최대 4개 마스킹
  for (let i = 0; i < numToMask; i++) {
    if (len - 3 - i >= 0) {
      // 마스킹할 인덱스가 음수가 되지 않도록
      chars[len - 3 - i] = '*';
    }
  }
  return chars.join('');
};

function SearchBaseScreen({
  route,
  navigation,
  searchType: propSearchType,
  title: propTitle,
}) {
  // route.params에서 searchType과 initialSearchTerm을 받을 수 있도록 수정
  const searchType = route?.params?.searchType || propSearchType;
  const initialSearchTerm = route?.params?.searchTerm || '';
  const screenTitle = route?.params?.title || propTitle;

  const [reports, setReports] = useState([]);
  const [maskedReports, setMaskedReports] = useState([]);
  const [loading, setLoading] = useState(false); // 초기 로딩은 false로 변경
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // 검색 입력창 상태는 SearchBaseScreen 내부에서 관리
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  // 실제 API 요청에 사용될 검색어 (검색 버튼 클릭 시 업데이트)
  const [submittedSearchTerm, setSubmittedSearchTerm] =
    useState(initialSearchTerm);

  const fetchReports = useCallback(
    async (pageNum, currentSearchTermToSubmit) => {
      if (
        !currentSearchTermToSubmit ||
        currentSearchTermToSubmit.trim() === ''
      ) {
        setReports([]);
        setMaskedReports([]);
        setTotalCount(0);
        setLoading(false);
        setError(null); // 검색어가 없으면 검색 실행 안 함
        return;
      }

      setLoading(true);
      setError(null);
      const from = pageNum * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('masked_scammer_reports') // 주의: 실제 Supabase에 이 view가 있어야 함
        .select('*', { count: 'exact' });

      // currentSearchTermToSubmit은 실제 제출된 검색어
      if (currentSearchTermToSubmit) {
        let orConditions = '';
        if (searchType === SEARCH_TYPES.UNIFIED) {
          // 이름 필드 추가 시: name.ilike.%${currentSearchTermToSubmit}%,
          orConditions = `phone_number.ilike.%${currentSearchTermToSubmit}%,account_number.ilike.%${currentSearchTermToSubmit}%`;
        } else if (searchType === SEARCH_TYPES.ACCOUNT) {
          orConditions = `account_number.ilike.%${currentSearchTermToSubmit}%`;
        } else if (searchType === SEARCH_TYPES.PHONE) {
          orConditions = `phone_number.ilike.%${currentSearchTermToSubmit}%`;
        } else if (searchType === SEARCH_TYPES.NUMERIC_UNIFIED) {
          // 새로운 검색 유형
          orConditions = `phone_number.ilike.%${currentSearchTermToSubmit}%,account_number.ilike.%${currentSearchTermToSubmit}%`;
        }

        if (orConditions) {
          query = query.or(orConditions);
        }
      }

      query = query.order('created_at', { ascending: false }).range(from, to);

      try {
        const { data, error: fetchError, count } = await query;
        if (fetchError) throw fetchError;
        setReports(data || []);
        setTotalCount(count ?? 0);
      } catch (err) {
        setError(`데이터 조회 실패: ${err.message || '알 수 없는 오류'}`);
        setReports([]);
        setMaskedReports([]); // 에러 시 초기화
        setTotalCount(0); // 에러 시 초기화
      } finally {
        setLoading(false);
      }
    },
    [searchType], // page, submittedSearchTerm는 useEffect 의존성 배열로 이동
  );

  // submittedSearchTerm (실제 검색 실행어) 또는 page가 변경될 때 fetchReports 호출
  useEffect(() => {
    if (submittedSearchTerm) {
      // submittedSearchTerm이 있을 때만 실행
      fetchReports(page, submittedSearchTerm);
    } else {
      // 검색어가 없으면 목록 비우기
      setReports([]);
      setMaskedReports([]);
      setTotalCount(0);
      setError(null);
    }
  }, [page, submittedSearchTerm, fetchReports]);

  useEffect(() => {
    if (reports.length > 0) {
      const newMaskedReports = reports.map((item) => ({
        ...item,
        phone_number: maskPhoneNumber(item.phone_number),
        account_number: maskAccountNumber(item.account_number),
        categoryColor:
          item.category === '노쇼'
            ? '#3498db' // Blue
            : item.category === '보이스피싱'
              ? '#e74c3c' // Red
              : item.category === '중고나라 사기'
                ? '#f39c12' // Orange
                : item.category === '불법 사채'
                  ? '#8e44ad' // Purple
                  : '#34495e', // Default Black/Dark Gray
      }));
      setMaskedReports(newMaskedReports);
    } else {
      setMaskedReports([]);
    }
  }, [reports]);

  const handleSearch = () => {
    Keyboard.dismiss();
    const trimmedTerm = searchTerm.trim();
    if (trimmedTerm === '') {
      Alert.alert('검색어 필요', '검색어를 입력해주세요.');
      setSubmittedSearchTerm(''); // 검색어 초기화
      setPage(0);
      return;
    }
    if (trimmedTerm !== submittedSearchTerm || page !== 0) {
      setPage(0); // 새 검색 시 첫 페이지로
    }
    setSubmittedSearchTerm(trimmedTerm); // submittedSearchTerm 업데이트로 useEffect 트리거
  };

  const handleClearSearch = () => {
    Keyboard.dismiss();
    setSearchTerm('');
    setSubmittedSearchTerm(''); // 실제 검색어도 비워야 useEffect에서 목록 초기화
    setPage(0);
    setReports([]); // 즉시 목록 비우기
    setMaskedReports([]);
    setTotalCount(0);
    setError(null);
  };

  // 페이지네이션 핸들러는 동일하게 유지
  const handlePreviousPage = () => {
    if (page > 0) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    const lastPage = Math.ceil(totalCount / ITEMS_PER_PAGE) - 1;
    if (page < lastPage && totalCount > (page + 1) * ITEMS_PER_PAGE) {
      // 다음 페이지에 항목이 있을 때만
      setPage(page + 1);
    }
  };

  const renderItem = useCallback(
    ({ item }) => {
      // 화면 유형에 따른 정보 표시는 기존 로직 유지 또는 NUMERIC_UNIFIED에 맞게 조정
      const commonInfo = (
        <>
          <Text style={styles.itemText}>
            카테고리:{' '}
            <Text style={{ color: item.categoryColor, fontWeight: 'bold' }}>
              {item.category || 'N/A'}
            </Text>
          </Text>
          <Text style={styles.itemText}>이름: {item.name || 'N/A'}</Text>
        </>
      );

      let screenSpecificInfo;
      if (
        searchType === SEARCH_TYPES.NUMERIC_UNIFIED ||
        searchType === SEARCH_TYPES.UNIFIED
      ) {
        screenSpecificInfo = (
          <>
            <Text style={styles.itemText}>
              연락처:{' '}
              <Text style={styles.maskedText}>
                {item.phone_number || 'N/A'}
              </Text>
            </Text>
            <Text style={styles.itemText}>
              계좌:{' '}
              <Text style={styles.maskedText}>
                {item.account_number || 'N/A'}
              </Text>
            </Text>
            {item.description && (
              <Text style={styles.itemDesc}>내용: {item.description}</Text>
            )}
          </>
        );
      } else if (searchType === SEARCH_TYPES.ACCOUNT) {
        // ...
      } else if (searchType === SEARCH_TYPES.PHONE) {
        // ...
      }

      return (
        <View style={styles.itemContainer}>
          {commonInfo}
          {screenSpecificInfo}
          <Text style={styles.dateText}>
            등록일: {new Date(item.created_at).toLocaleDateString()}{' '}
            {/* 시간 제외하고 날짜만 */}
          </Text>
        </View>
      );
    },
    [searchType], // searchType 의존성 추가
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE)); // 최소 1페이지

  // 화면 타이틀 설정 (optional)
  useEffect(() => {
    if (screenTitle && navigation) {
      navigation.setOptions({ title: screenTitle });
    }
  }, [screenTitle, navigation]);

  return (
    <View style={styles.container}>
      {/* 검색창은 HomeScreen에서 이미 입력받았으므로 여기서는 표시하지 않거나, 다른 UI 구성 가능 */}
      {/* 여기서는 route.params로 받은 검색어를 바로 사용 */}
      {/* <Text style={styles.title}>{screenTitle || '검색 결과'}</Text> */}

      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={
            searchType === SEARCH_TYPES.UNIFIED
              ? '이름, 전화번호, 계좌번호 입력'
              : searchType === SEARCH_TYPES.NUMERIC_UNIFIED
                ? '연락처 또는 계좌번호 입력'
                : '검색어 입력'
          }
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          keyboardType={
            searchType === SEARCH_TYPES.NUMERIC_UNIFIED ||
            searchType === SEARCH_TYPES.PHONE ||
            searchType === SEARCH_TYPES.ACCOUNT
              ? 'number-pad'
              : 'default'
          }
        />
        {searchTerm ? (
          <TouchableOpacity
            onPress={handleClearSearch}
            style={styles.clearButton}
          >
            <Icon name="close-circle" size={22} color="#888" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={handleSearch}
          style={styles.searchIconTouchable}
          disabled={loading || !searchTerm.trim()}
        >
          <Icon name="magnify" size={28} color="white" />
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" style={styles.loader} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {!loading && (
        <FlatList
          data={maskedReports}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="alert-circle-outline" size={50} color="#aaa" />
              <Text style={styles.emptyText}>
                {submittedSearchTerm
                  ? '검색 결과가 없습니다.'
                  : '검색어를 입력하고 검색 버튼을 누르세요.'}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {!loading && totalCount > ITEMS_PER_PAGE && (
        <View style={styles.paginationContainer}>
          <Button
            title="이전"
            onPress={handlePreviousPage}
            disabled={page === 0}
            color="#3d5afe"
          />
          <Text style={styles.pageInfoText}>
            페이지 {page + 1} / {totalPages} (총 {totalCount}건)
          </Text>
          <Button
            title="다음"
            onPress={handleNextPage}
            disabled={
              page >= totalPages - 1 ||
              totalCount <= (page + 1) * ITEMS_PER_PAGE
            }
            color="#3d5afe"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 15, // 좌우 패딩
    paddingTop: 15,
    backgroundColor: '#f8f9fa',
  },
  title: {
    // 이 스타일은 SearchBaseScreen 자체에서는 이제 덜 중요할 수 있음
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 10,
    color: '#343a40',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'white',
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  searchInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#212529',
  },
  clearButton: {
    padding: 10,
  },
  searchIconTouchable: {
    backgroundColor: '#3d5afe',
    padding: 12,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  loader: {
    flex: 1, // 화면 중앙에 표시되도록
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#e74c3c',
    textAlign: 'center',
    marginVertical: 15,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 10,
    color: '#868e96',
    fontSize: 16,
  },
  itemContainer: {
    backgroundColor: '#ffffff',
    padding: 18, // 패딩 증가
    marginBottom: 12,
    borderRadius: 10, // 더 둥글게
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  itemText: {
    fontSize: 16, // 폰트 크기 조정
    marginBottom: 7,
    color: '#495057',
    lineHeight: 22, // 줄 간격
  },
  maskedText: {
    fontWeight: '600', // 마스킹된 텍스트 강조
    color: '#343a40',
  },
  itemDesc: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 8,
    lineHeight: 20,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    paddingTop: 8,
  },
  dateText: {
    fontSize: 12, // 폰트 크기 조정
    color: '#adb5bd',
    marginTop: 12,
    textAlign: 'right',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    backgroundColor: '#f8f9fa', // 배경색 추가
  },
  pageInfoText: {
    fontSize: 14,
    color: '#495057',
    fontWeight: '600',
  },
});

export default SearchBaseScreen;
