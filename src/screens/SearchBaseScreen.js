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
import { useAuth } from '../context/AuthContext';

const ITEMS_PER_PAGE = 10;

export const SEARCH_TYPES = {
  UNIFIED: 'unified',
  ACCOUNT: 'account',
  PHONE: 'phone',
  NUMERIC_UNIFIED: 'numeric_unified',
};

const maskName = (name) => {
  if (!name || typeof name !== 'string' || name.length <= 1) {
    return name || '';
  }
  if (name.length === 2) {
    return `${name[0]}*`;
  }
  return `${name[0]}*${name.substring(2)}`;
};

const maskPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return phoneNumber || '';
  }
  const cleanNumber = phoneNumber.replace(/-/g, '');
  const len = cleanNumber.length;

  if (len < 7) {
    return phoneNumber;
  }

  let maskedNumber = '';
  if (len === 11) {
    maskedNumber = `${cleanNumber.substring(0, 5)}**${cleanNumber.substring(7)}`;
    return `${maskedNumber.substring(0, 3)}-${maskedNumber.substring(3, 7)}-${maskedNumber.substring(7)}`;
  } else if (len === 10) {
    if (cleanNumber.startsWith('02')) {
      const midIndex = Math.floor(len / 2) - 1;
      maskedNumber = `${cleanNumber.substring(0, midIndex)}**${cleanNumber.substring(midIndex + 2)}`;
      if (
        cleanNumber.length === 10 &&
        cleanNumber.split('-').length === 3 &&
        cleanNumber.split('-')[1].length === 4
      ) {
        return `${maskedNumber.substring(0, 2)}-${maskedNumber.substring(2, 6)}-${maskedNumber.substring(6)}`;
      } else {
        return `${maskedNumber.substring(0, 2)}-${maskedNumber.substring(2, 5)}-${maskedNumber.substring(5)}`;
      }
    } else {
      maskedNumber = `${cleanNumber.substring(0, 4)}**${cleanNumber.substring(6)}`;
      return `${maskedNumber.substring(0, 3)}-${maskedNumber.substring(3, 6)}-${maskedNumber.substring(6)}`;
    }
  } else if (len >= 7 && len <= 9) {
    const midIndex = Math.floor(len / 2) - 1;
    maskedNumber = `${cleanNumber.substring(0, midIndex)}**${cleanNumber.substring(midIndex + 2)}`;
    return maskedNumber;
  }
  return phoneNumber;
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || typeof accountNumber !== 'string') {
    return accountNumber || '';
  }
  const cleanAccount = accountNumber.replace(/-/g, '');
  const len = cleanAccount.length;

  if (len < 5) {
    return accountNumber;
  }
  const startIndex = Math.max(1, Math.floor(len / 3));
  if (startIndex + 1 >= len - 1) {
    return `${cleanAccount.substring(0, len - 2)}**`;
  }
  const maskedAccount =
    cleanAccount.substring(0, startIndex) +
    '**' +
    cleanAccount.substring(startIndex + 2);
  return maskedAccount;
};

function SearchBaseScreen({
  route,
  navigation,
  searchType: propSearchType,
  title: propTitle,
}) {
  const { user, profile, isLoading: authIsLoading } = useAuth();

  const searchTypeFromParams = route?.params?.searchType;
  const initialSearchTermFromParams = route?.params?.searchTerm || '';
  const screenTitleFromParams = route?.params?.title;

  const currentSearchType =
    searchTypeFromParams || propSearchType || SEARCH_TYPES.UNIFIED;
  const currentScreenTitle = screenTitleFromParams || propTitle || '검색';

  const [reports, setReports] = useState([]);
  const [maskedReports, setMaskedReports] = useState([]);
  const [dataFetchLoading, setDataFetchLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState(initialSearchTermFromParams);
  const [submittedSearchTerm, setSubmittedSearchTerm] = useState(
    initialSearchTermFromParams,
  );
  const [initialAuthCheckComplete, setInitialAuthCheckComplete] =
    useState(false);

  const fetchReports = useCallback(
    async (pageNum, termToSearch) => {
      if (!user || !profile?.job_type) {
        setError(
          '사용자 정보 또는 프로필(직업 정보)을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.',
        );
        setDataFetchLoading(false);
        setReports([]);
        setMaskedReports([]);
        setTotalCount(0);
        return;
      }

      if (
        termToSearch.trim() === '' &&
        currentSearchType !== SEARCH_TYPES.UNIFIED &&
        currentSearchType !== SEARCH_TYPES.NUMERIC_UNIFIED
      ) {
        setReports([]);
        setMaskedReports([]);
        setTotalCount(0);
        setDataFetchLoading(false);
        setError(null);
        return;
      }

      setDataFetchLoading(true);
      setError(null);
      const from = pageNum * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('masked_scammer_reports')
        .select('*', { count: 'exact' });

      const trimmedTerm = termToSearch.trim();

      if (trimmedTerm !== '') {
        let orConditions = [];
        if (currentSearchType === SEARCH_TYPES.UNIFIED) {
          orConditions.push(`name.ilike.%${trimmedTerm}%`);
          orConditions.push(`nickname.ilike.%${trimmedTerm}%`);
          orConditions.push(`phone_number.eq.${trimmedTerm}`);
          orConditions.push(`account_number.ilike.%${trimmedTerm}%`);
        } else if (currentSearchType === SEARCH_TYPES.ACCOUNT) {
          orConditions.push(`account_number.ilike.%${trimmedTerm}%`);
        } else if (currentSearchType === SEARCH_TYPES.PHONE) {
          orConditions.push(`phone_number.eq.${trimmedTerm}`);
        } else if (currentSearchType === SEARCH_TYPES.NUMERIC_UNIFIED) {
          orConditions.push(`phone_number.eq.${trimmedTerm}`);
          orConditions.push(`account_number.ilike.%${trimmedTerm}%`);
        }

        if (orConditions.length > 0) {
          query = query.or(orConditions.join(','));
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
        setMaskedReports([]);
        setTotalCount(0);
      } finally {
        setDataFetchLoading(false);
      }
    },
    [currentSearchType, user, profile],
  );

  useEffect(() => {
    if (currentScreenTitle && navigation) {
      navigation.setOptions({ title: currentScreenTitle });
    }
  }, [currentScreenTitle, navigation]);

  useEffect(() => {
    if (!authIsLoading) {
      if (!initialAuthCheckComplete) {
        setInitialAuthCheckComplete(true);
      }
      if (user && profile?.job_type) {
        fetchReports(page, submittedSearchTerm);
      } else {
        const specificError = !user
          ? '로그인이 필요합니다.'
          : '사용자 프로필(직업 정보)을 찾을 수 없습니다. RLS 정책 적용에 필요합니다.';
        setError(specificError);
        setReports([]);
        setMaskedReports([]);
        setTotalCount(0);
        setDataFetchLoading(false);
      }
    }
  }, [
    authIsLoading,
    user,
    profile,
    page,
    submittedSearchTerm,
    fetchReports,
    initialAuthCheckComplete,
  ]);

  useEffect(() => {
    if (reports.length > 0) {
      const newMaskedReports = reports.map((item) => {
        const displayName = item.name || item.nickname;
        return {
          ...item,
          displayName: maskName(displayName),
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
    setPage(0);
    setSubmittedSearchTerm(trimmedTerm);
  };

  const handleClearSearch = () => {
    Keyboard.dismiss();
    setSearchTerm('');
    setPage(0);
    setSubmittedSearchTerm('');
  };

  const handlePreviousPage = () => {
    if (page > 0) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    const lastPage = Math.max(0, Math.ceil(totalCount / ITEMS_PER_PAGE) - 1);
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
    [currentSearchType],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  if (authIsLoading || (!initialAuthCheckComplete && dataFetchLoading)) {
    return (
      <View style={styles.container}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#3d5afe" />
          <Text style={{ marginTop: 10 }}>
            {authIsLoading
              ? '사용자 정보 확인 중...'
              : '데이터를 불러오는 중...'}
          </Text>
        </View>
      </View>
    );
  }

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
              ? 'phone-pad'
              : currentSearchType === SEARCH_TYPES.NUMERIC_UNIFIED ||
                  currentSearchType === SEARCH_TYPES.ACCOUNT
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
          disabled={dataFetchLoading}
        >
          <Icon name="magnify" size={28} color="white" />
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {dataFetchLoading && !maskedReports.length ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#3d5afe" />
          <Text style={{ marginTop: 10 }}>데이터를 불러오는 중...</Text>
        </View>
      ) : (
        <FlatList
          data={maskedReports}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            !dataFetchLoading && (
              <View style={styles.emptyContainer}>
                <Icon name="alert-circle-outline" size={50} color="#aaa" />
                <Text style={styles.emptyText}>
                  {submittedSearchTerm.trim() !== '' ||
                  (currentSearchType !== SEARCH_TYPES.UNIFIED &&
                    currentSearchType !== SEARCH_TYPES.NUMERIC_UNIFIED &&
                    submittedSearchTerm.trim() === '')
                    ? '아직 피해 사실이 없습니다.'
                    : '아직 피해 사실이 없습니다.'}
                </Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            dataFetchLoading && maskedReports.length > 0 ? (
              <ActivityIndicator style={{ marginVertical: 10 }} size="small" />
            ) : null
          }
        />
      )}

      {!dataFetchLoading && totalCount > 0 && (
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
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
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
