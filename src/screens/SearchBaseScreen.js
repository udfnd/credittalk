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
} from 'react-native';
import { supabase } from '../lib/supabaseClient';

const ITEMS_PER_PAGE = 10;

export const SEARCH_TYPES = {
  UNIFIED: 'unified',
  ACCOUNT: 'account',
  PHONE: 'phone',
};

const maskPhoneNumber = (phoneNumber) => {
  if (
    !phoneNumber ||
    typeof phoneNumber !== 'string' ||
    phoneNumber.length < 10
  ) {
    return phoneNumber || '';
  }
  const chars = phoneNumber.split('');
  const index1 = Math.floor(Math.random() * 4) + 3;
  const index2 = Math.floor(Math.random() * 4) + 7;

  if (chars[index1]) chars[index1] = '*';
  if (chars[index2]) chars[index2] = '*';

  return chars.join('');
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || typeof accountNumber !== 'string') {
    return accountNumber || '';
  }
  const digitsIndices = [];
  const chars = accountNumber.split('');
  chars.forEach((char, index) => {
    if (/\d/.test(char)) {
      digitsIndices.push(index);
    }
  });

  if (digitsIndices.length < 4) {
    return accountNumber;
  }

  const numToMask = 2; // 2개의 자리를 마스킹하도록 변경
  const indicesToMask = new Set();

  while (
    indicesToMask.size < numToMask &&
    indicesToMask.size < digitsIndices.length
  ) {
    const randomDigitIndex = Math.floor(Math.random() * digitsIndices.length);
    indicesToMask.add(digitsIndices[randomDigitIndex]);
  }

  indicesToMask.forEach((index) => {
    chars[index] = '*';
  });
  return chars.join('');
};

function SearchBaseScreen({ searchType, title }) {
  const [reports, setReports] = useState([]);
  const [maskedReports, setMaskedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearchTerm, setSubmittedSearchTerm] = useState('');

  const fetchReports = useCallback(
    async (pageNum, currentSearchTerm) => {
      setLoading(true);
      setError(null);
      const from = pageNum * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('masked_scammer_reports')
        .select('*', { count: 'exact' });

      if (currentSearchTerm) {
        let orConditions = '';
        if (searchType === SEARCH_TYPES.UNIFIED) {
          orConditions = `name.ilike.%${currentSearchTerm}%,phone_number.ilike.%${currentSearchTerm}%,account_number.ilike.%${currentSearchTerm}%`;
        } else if (searchType === SEARCH_TYPES.ACCOUNT) {
          orConditions = `account_number.ilike.%${currentSearchTerm}%`;
        } else if (searchType === SEARCH_TYPES.PHONE) {
          orConditions = `phone_number.ilike.%${currentSearchTerm}%`;
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
        setMaskedReports([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    [searchType, title],
  );

  useEffect(() => {
    fetchReports(page, submittedSearchTerm);
  }, [page, submittedSearchTerm, fetchReports]);

  useEffect(() => {
    if (reports.length > 0) {
      const newMaskedReports = reports.map((item) => ({
        ...item,
        phone_number: maskPhoneNumber(item.phone_number),
        account_number: maskAccountNumber(item.account_number),
        categoryColor:
          item.category === '노쇼'
            ? 'blue'
            : item.category === '보이스피싱'
              ? 'red'
              : 'black', // 색상 구분 추가
      }));
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
    setSubmittedSearchTerm('');
    setPage(0);
  };

  const handlePreviousPage = () => {
    if (page > 0) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    const lastPage = Math.ceil(totalCount / ITEMS_PER_PAGE) - 1;
    if (page < lastPage) {
      setPage(page + 1);
    }
  };

  const renderItem = useCallback(
    ({ item }) => {
      const commonInfo = (
        <>
          <Text style={styles.itemText}>
            카테고리:{' '}
            <Text style={{ color: item.categoryColor }}>
              {item.category || 'N/A'}
            </Text>
          </Text>
          <Text style={styles.itemText}>이름: {item.name || 'N/A'}</Text>
        </>
      );

      let screenSpecificInfo;
      if (searchType === SEARCH_TYPES.UNIFIED) {
        screenSpecificInfo = (
          <>
            <Text style={styles.itemText}>
              연락처: {item.phone_number || 'N/A'}
            </Text>
            <Text style={styles.itemText}>
              계좌: {item.account_number || 'N/A'}
            </Text>
            {item.description && (
              <Text style={styles.itemDesc}>내용: {item.description}</Text>
            )}
          </>
        );
      } else if (searchType === SEARCH_TYPES.ACCOUNT) {
        screenSpecificInfo = (
          <>
            <Text style={styles.itemText}>
              계좌: {item.account_number || 'N/A'}
            </Text>
            {item.description && (
              <Text style={styles.itemDesc}>내용: {item.description}</Text>
            )}
          </>
        );
      } else if (searchType === SEARCH_TYPES.PHONE) {
        screenSpecificInfo = (
          <>
            <Text style={styles.itemText}>
              연락처: {item.phone_number || 'N/A'}
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
            등록일: {new Date(item.created_at).toLocaleString()}
          </Text>
        </View>
      );
    },
    [searchType],
  );

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={
            searchType === SEARCH_TYPES.UNIFIED
              ? '이름, 전화번호, 계좌번호 입력'
              : searchType === SEARCH_TYPES.ACCOUNT
                ? '계좌번호 입력'
                : '전화번호 입력'
          }
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
          keyboardType={
            searchType === SEARCH_TYPES.UNIFIED ? 'default' : 'number-pad'
          }
        />
        {searchTerm ? (
          <Button title="X" onPress={handleClearSearch} color="grey" />
        ) : null}
        <View style={{ width: 5 }} />
        <Button
          title="검색"
          onPress={handleSearch}
          disabled={loading || !searchTerm.trim()}
        />
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {loading && <ActivityIndicator size="large" style={styles.loader} />}

      {!loading && (
        <FlatList
          data={maskedReports}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {submittedSearchTerm
                ? '검색 결과가 없습니다.'
                : '등록된 정보가 없습니다.'}
            </Text>
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
          />
          <Text style={styles.pageInfoText}>
            페이지 {page + 1} / {totalPages} (총 {totalCount}건)
          </Text>
          <Button
            title="다음"
            onPress={handleNextPage}
            disabled={page >= totalPages - 1}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 15,
    color: '#343a40',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  searchInput: {
    flex: 1,
    height: 45,
    borderWidth: 1,
    borderColor: '#ced4da',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 5,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  loader: {
    marginTop: 50,
    marginBottom: 20,
    alignSelf: 'center',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginVertical: 10,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    color: 'grey',
    fontSize: 16,
  },
  itemContainer: {
    backgroundColor: '#ffffff',
    padding: 15,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemText: {
    fontSize: 15,
    marginBottom: 5,
    color: '#495057',
  },
  itemDesc: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 8,
  },
  dateText: {
    fontSize: 11,
    color: '#adb5bd',
    marginTop: 10,
    textAlign: 'right',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    marginTop: 10,
  },
  pageInfoText: {
    fontSize: 14,
    color: '#495057',
  },
});

export default SearchBaseScreen;
