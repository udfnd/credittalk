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
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';

const ITEMS_PER_PAGE = 10;

export const SEARCH_TYPES = {
  UNIFIED: 'unified', // 이름(닉네임), 계좌(포함), 전화번호(정확히)
  ACCOUNT: 'account', // 계좌(포함)
  PHONE: 'phone', // 전화번호(정확히)
  NUMERIC_UNIFIED: 'numeric_unified', // 계좌(포함), 전화번호(정확히)
};

// 이름 마스킹 함수 (가운데 글자 마스킹)
const maskName = (name) => {
  if (!name || typeof name !== 'string' || name.length <= 1) {
    return name || '';
  }
  if (name.length === 2) {
    return `${name[0]}*`;
  }
  // 요청: 이름의 2번째 글자만 마스킹
  return `${name[0]}*${name.substring(2)}`;
};

// 전화번호 마스킹 함수 (중간 숫자 2개 마스킹)
const maskPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return phoneNumber || '';
  }
  const cleanNumber = phoneNumber.replace(/-/g, '');
  const len = cleanNumber.length;

  if (len < 7) {
    // 너무 짧은 번호는 그대로 반환
    return phoneNumber;
  }

  let maskedNumber = '';
  // 010-xxxx-xxxx, 010-xxx-xxxx 형식 (10~11자리)
  if (len === 11) {
    // 010-1234-5678
    maskedNumber = `${cleanNumber.substring(0, 5)}**${cleanNumber.substring(7)}`;
    return `${maskedNumber.substring(0, 3)}-${maskedNumber.substring(3, 7)}-${maskedNumber.substring(7)}`;
  } else if (len === 10) {
    // 010-123-4567 또는 지역번호
    if (cleanNumber.startsWith('02')) {
      // 서울 지역번호 (02-xxxx-xxxx 또는 02-xxx-xxxx)
      // 02-1234-5678 -> 02-123**-78
      // 02-123-4567 -> 02-1**-567
      const midIndex = Math.floor(len / 2) - 1; // 중간쯤의 인덱스
      maskedNumber = `${cleanNumber.substring(0, midIndex)}**${cleanNumber.substring(midIndex + 2)}`;
      if (
        cleanNumber.length === 10 &&
        cleanNumber.split('-').length === 3 &&
        cleanNumber.split('-')[1].length === 4
      ) {
        // 02-xxxx-xxxx
        return `${maskedNumber.substring(0, 2)}-${maskedNumber.substring(2, 6)}-${maskedNumber.substring(6)}`;
      } else {
        // 02-xxx-xxxx
        return `${maskedNumber.substring(0, 2)}-${maskedNumber.substring(2, 5)}-${maskedNumber.substring(5)}`;
      }
    } else {
      // 기타 01x-xxx-xxxx
      maskedNumber = `${cleanNumber.substring(0, 4)}**${cleanNumber.substring(6)}`;
      return `${maskedNumber.substring(0, 3)}-${maskedNumber.substring(3, 6)}-${maskedNumber.substring(6)}`;
    }
  }
  // 일반적인 7~9자리 번호 (예: 123-4567, 1234-5678) - 중간 2자리
  else if (len >= 7 && len <= 9) {
    const midIndex = Math.floor(len / 2) - 1;
    maskedNumber = `${cleanNumber.substring(0, midIndex)}**${cleanNumber.substring(midIndex + 2)}`;
    // 하이픈 복원은 원래 하이픈이 있었다면 고려, 없다면 그대로 반환
    return maskedNumber; // 하이픈 없이 반환하거나, 원본 phoneNumber 형식에 따라 조건부 추가
  }
  return phoneNumber; // 규칙에 맞지 않으면 원본 반환
};

// 계좌번호 마스킹 함수 (중간 숫자 2개 마스킹)
const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || typeof accountNumber !== 'string') {
    return accountNumber || '';
  }
  const cleanAccount = accountNumber.replace(/-/g, '');
  const len = cleanAccount.length;

  if (len < 5) {
    // 너무 짧으면 그대로 반환
    return accountNumber;
  }

  // 중간에서 2자리 마스킹 (앞에서 1/3 지점부터 2자리)
  const startIndex = Math.max(1, Math.floor(len / 3)); // 최소 1번째 인덱스 이후부터 시작
  if (startIndex + 1 >= len - 1) {
    // 마스킹할 자리가 충분하지 않으면 끝에서 2개 마스킹
    return `${cleanAccount.substring(0, len - 2)}**`;
  }

  const maskedAccount =
    cleanAccount.substring(0, startIndex) +
    '**' +
    cleanAccount.substring(startIndex + 2);

  return maskedAccount; // 하이픈 제거된 상태로 반환 (일관성)
};

function SearchBaseScreen({
  route,
  navigation,
  searchType: propSearchType,
  title: propTitle,
}) {
  const searchTypeFromParams = route?.params?.searchType;
  const initialSearchTermFromParams = route?.params?.searchTerm || '';
  const screenTitleFromParams = route?.params?.title;

  const currentSearchType =
    searchTypeFromParams || propSearchType || SEARCH_TYPES.UNIFIED;
  const currentScreenTitle = screenTitleFromParams || propTitle || '검색';

  const [reports, setReports] = useState([]);
  const [maskedReports, setMaskedReports] = useState([]);
  const [loading, setLoading] = useState(true); // 초기 로딩 시작
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState(initialSearchTermFromParams);
  const [submittedSearchTerm, setSubmittedSearchTerm] = useState(
    initialSearchTermFromParams,
  );

  const fetchReports = useCallback(
    async (pageNum, termToSearch) => {
      // UNIFIED 또는 NUMERIC_UNIFIED 검색이 아니고, 검색어가 비어있다면, 검색 실행 안함
      if (
        termToSearch.trim() === '' &&
        currentSearchType !== SEARCH_TYPES.UNIFIED &&
        currentSearchType !== SEARCH_TYPES.NUMERIC_UNIFIED
      ) {
        setReports([]);
        setMaskedReports([]);
        setTotalCount(0);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      const from = pageNum * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('masked_scammer_reports') // 이 뷰에는 name, nickname, phone_number, account_number 등이 있어야 함
        .select('*', { count: 'exact' });

      const trimmedTerm = termToSearch.trim();

      if (trimmedTerm !== '') {
        let orConditions = [];

        if (currentSearchType === SEARCH_TYPES.UNIFIED) {
          orConditions.push(`name.ilike.%${trimmedTerm}%`);
          orConditions.push(`nickname.ilike.%${trimmedTerm}%`); // 닉네임 포함 검색
          orConditions.push(`phone_number.eq.${trimmedTerm}`); // 전화번호 정확히 일치
          orConditions.push(`account_number.ilike.%${trimmedTerm}%`); // 계좌번호 포함 검색
        } else if (currentSearchType === SEARCH_TYPES.ACCOUNT) {
          orConditions.push(`account_number.ilike.%${trimmedTerm}%`);
        } else if (currentSearchType === SEARCH_TYPES.PHONE) {
          orConditions.push(`phone_number.eq.${trimmedTerm}`); // 전화번호 정확히 일치
        } else if (currentSearchType === SEARCH_TYPES.NUMERIC_UNIFIED) {
          orConditions.push(`phone_number.eq.${trimmedTerm}`); // 전화번호 정확히 일치
          orConditions.push(`account_number.ilike.%${trimmedTerm}%`); // 계좌번호 포함 검색
        }

        if (orConditions.length > 0) {
          query = query.or(orConditions.join(','));
        }
      }
      // 검색어가 비어있으면 (trimmedTerm === ''), orConditions가 적용되지 않아 전체 데이터 조회

      query = query.order('created_at', { ascending: false }).range(from, to);

      try {
        const { data, error: fetchError, count } = await query;
        if (fetchError) throw fetchError;
        setReports(data || []);
        setTotalCount(count ?? 0);
      } catch (err) {
        setError(`데이터 조회 실패: ${err.message || '알 수 없는 오류'}`);
        setReports([]);
        setMaskedReports([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    [currentSearchType],
  );

  useEffect(() => {
    // 페이지 변경 또는 실제 검색어(submittedSearchTerm) 변경 시 데이터 요청
    // 초기 로드 시 submittedSearchTerm은 initialSearchTermFromParams를 가지며,
    // UNIFIED, NUMERIC_UNIFIED 타입은 빈 검색어로도 전체 조회를 실행함.
    fetchReports(page, submittedSearchTerm);
  }, [page, submittedSearchTerm, fetchReports]); // currentSearchType은 fetchReports의 의존성이므로 제거

  useEffect(() => {
    if (reports.length > 0) {
      const newMaskedReports = reports.map((item) => {
        const displayName = item.name || item.nickname; // 이름 없으면 닉네임 사용
        return {
          ...item,
          displayName: maskName(displayName), // 마스킹된 이름 (또는 닉네임)
          // phone_number와 account_number는 DB에서 가져온 원본을 마스킹
          phone_number_masked: maskPhoneNumber(item.phone_number),
          account_number_masked: maskAccountNumber(item.account_number),
          categoryColor:
            item.category === '노쇼'
              ? '#3498db'
              : item.category === '보이스피싱'
                ? '#e74c3c'
                : item.category === '중고나라 사기'
                  ? '#f39c12'
                  : item.category === '불법 사채'
                    ? '#8e44ad'
                    : '#34495e',
        };
      });
      setMaskedReports(newMaskedReports);
    } else {
      setMaskedReports([]);
    }
  }, [reports]);

  const handleSearch = () => {
    Keyboard.dismiss();
    const trimmedTerm = searchTerm.trim();
    if (trimmedTerm !== submittedSearchTerm || page !== 0) {
      setPage(0);
    }
    setSubmittedSearchTerm(trimmedTerm);
  };

  const handleClearSearch = () => {
    Keyboard.dismiss();
    setSearchTerm('');
    setSubmittedSearchTerm(''); // 빈 문자열로 설정하여 useEffect가 전체 목록 또는 빈 목록을 로드하도록 함
    setPage(0);
  };

  const handlePreviousPage = () => {
    if (page > 0) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    const lastPage = Math.ceil(totalCount / ITEMS_PER_PAGE) - 1;
    if (page < lastPage && totalCount > (page + 1) * ITEMS_PER_PAGE) {
      setPage(page + 1);
    }
  };

  const renderItem = useCallback(
    ({ item }) => {
      const commonInfo = (
        <>
          <Text style={styles.itemText}>
            카테고리:{' '}
            <Text style={{ color: item.categoryColor, fontWeight: 'bold' }}>
              {item.category || 'N/A'}
            </Text>
          </Text>
          <Text style={styles.itemText}>
            이름:{' '}
            <Text style={styles.maskedText}>{item.displayName || 'N/A'}</Text>
          </Text>
        </>
      );

      let screenSpecificInfo;
      if (
        currentSearchType === SEARCH_TYPES.NUMERIC_UNIFIED ||
        currentSearchType === SEARCH_TYPES.UNIFIED
      ) {
        screenSpecificInfo = (
          <>
            <Text style={styles.itemText}>
              연락처:{' '}
              <Text style={styles.maskedText}>
                {item.phone_number_masked || 'N/A'}
              </Text>
            </Text>
            <Text style={styles.itemText}>
              계좌:{' '}
              <Text style={styles.maskedText}>
                {item.account_number_masked || 'N/A'}
              </Text>
            </Text>
            {item.description && (
              <Text style={styles.itemDesc}>내용: {item.description}</Text>
            )}
          </>
        );
      } else if (currentSearchType === SEARCH_TYPES.ACCOUNT) {
        screenSpecificInfo = (
          <>
            <Text style={styles.itemText}>
              계좌:{' '}
              <Text style={styles.maskedText}>
                {item.account_number_masked || 'N/A'}
              </Text>
            </Text>
            {item.description && (
              <Text style={styles.itemDesc}>내용: {item.description}</Text>
            )}
          </>
        );
      } else if (currentSearchType === SEARCH_TYPES.PHONE) {
        screenSpecificInfo = (
          <>
            <Text style={styles.itemText}>
              연락처:{' '}
              <Text style={styles.maskedText}>
                {item.phone_number_masked || 'N/A'}
              </Text>
            </Text>
            {item.description && (
              <Text style={styles.itemDesc}>내용: {item.description}</Text>
            )}
          </>
        );
      }

      return (
        <View style={styles.itemContainer}>
          {commonInfo}
          {screenSpecificInfo}
          <Text style={styles.dateText}>
            등록일: {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
      );
    },
    [currentSearchType], // currentSearchType이 변경될 때 renderItem 재생성
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentScreenTitle && navigation) {
      navigation.setOptions({ title: currentScreenTitle });
    }
  }, [currentScreenTitle, navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={
            currentSearchType === SEARCH_TYPES.UNIFIED
              ? '이름, 닉네임, 전화번호(정확히), 계좌번호(포함)'
              : currentSearchType === SEARCH_TYPES.NUMERIC_UNIFIED
                ? '연락처(정확히) 또는 계좌번호(포함)'
                : currentSearchType === SEARCH_TYPES.ACCOUNT
                  ? '계좌번호(포함) 입력'
                  : currentSearchType === SEARCH_TYPES.PHONE
                    ? '전화번호(정확히) 입력'
                    : '검색어 입력'
          }
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          keyboardType={
            currentSearchType === SEARCH_TYPES.PHONE
              ? 'phone-pad' // PHONE 타입은 전화번호 키패드
              : currentSearchType === SEARCH_TYPES.NUMERIC_UNIFIED ||
                  currentSearchType === SEARCH_TYPES.ACCOUNT
                ? 'number-pad' // 숫자/계좌는 숫자 키패드
                : 'default' // 통합 검색은 일반 키패드
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
          disabled={loading}
        >
          <Icon name="magnify" size={28} color="white" />
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {loading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <FlatList
          data={maskedReports}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="alert-circle-outline" size={50} color="#aaa" />
              <Text style={styles.emptyText}>
                {submittedSearchTerm.trim() !== '' ||
                (currentSearchType !== SEARCH_TYPES.UNIFIED &&
                  currentSearchType !== SEARCH_TYPES.NUMERIC_UNIFIED &&
                  submittedSearchTerm.trim() === '')
                  ? '검색 결과가 없습니다.'
                  : '등록된 정보가 없습니다.'}
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

// 스타일은 이전 답변과 동일하게 유지
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 15,
    paddingTop: 15,
    backgroundColor: '#f8f9fa',
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
  clearButton: { padding: 10 },
  searchIconTouchable: {
    backgroundColor: '#3d5afe',
    padding: 12,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    height: 50,
    justifyContent: 'center',
  },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
    padding: 18,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  itemText: { fontSize: 16, marginBottom: 7, color: '#495057', lineHeight: 22 },
  maskedText: {
    /* 스타일 필요시 추가 */
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
    fontSize: 12,
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
    backgroundColor: '#f8f9fa',
  },
  pageInfoText: { fontSize: 14, color: '#495057', fontWeight: '600' },
});

export default SearchBaseScreen;
