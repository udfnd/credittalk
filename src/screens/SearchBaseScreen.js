import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  TextInput,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Keyboard,
  ScrollView,
} from "react-native";
import { supabase } from "../lib/supabaseClient";
import { debounce } from "lodash";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { format, parseISO } from "date-fns";

// 기존 카테고리별 스타일 정의
const categoryStyles = {
  "보이스피싱, 전기통신금융사기, 로맨스 스캠 사기": {
    backgroundColor: "#FFEBEE",
    color: "#D32F2F",
  },
  "불법사금융": { backgroundColor: "#E8EAF6", color: "#303F9F" },
  "중고물품 사기": { backgroundColor: "#E0F2F1", color: "#00796B" },
  "투자 사기": { backgroundColor: "#FFF8E1", color: "#FFA000" },
  "부동산 사기 (전, 월세 사기)": {
    backgroundColor: "#F3E5F5",
    color: "#7B1FA2",
  },
  "암호화폐": { backgroundColor: "#E1F5FE", color: "#0288D1" },
  "노쇼": { backgroundColor: "#F1F8E9", color: "#689F38" },
  "노쇼 대리구매 사기": { backgroundColor: "#FFFDE7", color: "#FBC02D" },
  "공갈 협박 범죄": { backgroundColor: "#212121", color: "#FFFFFF" },
  "렌탈 사업 피해": { backgroundColor: "#FBE9E7", color: "#D84315" },
  "기타": { backgroundColor: "#ECEFF1", color: "#455A64" },
};

const getCategoryStyle = (category) => {
  return categoryStyles[category] || categoryStyles["기타"];
};

// 하이라이트 텍스트 렌더링 컴포넌트
const HighlightedText = ({ text, highlight }) => {
  if (!text) return null;
  if (!highlight || !highlight.trim()) {
    return <Text style={styles.resultText}>{text}</Text>;
  }
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);

  return (
    <Text style={styles.resultText}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <Text key={i} style={styles.highlighted}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
};

// [추가] 한 페이지에 보여줄 결과 수
const RESULTS_PER_PAGE = 5;

// 메인 검색 화면 컴포넌트
const SearchBaseScreen = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  // [수정] 페이지네이션 상태 관리
  const [allResults, setAllResults] = useState([]); // 모든 검색 결과를 저장
  const [currentPage, setCurrentPage] = useState(1);
  const [pagedResults, setPagedResults] = useState([]); // 현재 페이지에 보여줄 결과만 저장

  // [수정] 검색 로직: 모든 결과를 한 번에 가져옴
  const debouncedSearch = useCallback(
    debounce(async (term) => {
      if (!term || term.trim().length < 2) {
        setAllResults([]);
        setSearched(false);
        setIsLoading(false);
        return;
      }

      Keyboard.dismiss();
      setIsLoading(true);
      setSearched(true);
      setError("");
      setCurrentPage(1); // 새로운 검색은 항상 1페이지부터

      try {
        // 기존 함수를 그대로 사용하여 모든 데이터를 가져옴
        const { data, error: rpcError } = await supabase.rpc("search_reports", {
          search_term: term.trim(),
        });

        if (rpcError) throw rpcError;

        setAllResults(data || []);
      } catch (e) {
        setError("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        setAllResults([]);
        console.error("Search error:", e);
      } finally {
        setIsLoading(false);
      }
    }, 500),
    [],
  );

  // [추가] 클라이언트 측에서 페이지를 나누는 로직
  useEffect(() => {
    const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
    const endIndex = startIndex + RESULTS_PER_PAGE;
    setPagedResults(allResults.slice(startIndex, endIndex));
  }, [currentPage, allResults]);

  const handleSearch = (text) => {
    setSearchTerm(text);
    if (text.trim().length === 0) {
      setSearched(false);
      setAllResults([]);
      setIsLoading(false);
      debouncedSearch.cancel();
    } else {
      setIsLoading(true);
      debouncedSearch(text);
    }
  };

  const handlePageChange = (newPage) => {
    const totalPages = Math.ceil(allResults.length / RESULTS_PER_PAGE);
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
      // FlatList가 최상단으로 스크롤되도록 하는 로직이 필요하다면 여기에 추가
    }
  };


  // 검색 결과 아이템 렌더링 함수
  const renderItem = ({ item }) => {
    const style = getCategoryStyle(item.category);
    return (
      <View style={styles.resultItem}>
        <View style={[styles.categoryBadge, { backgroundColor: style.backgroundColor }]}>
          <Text style={[styles.categoryText, { color: style.color }]}>
            {item.category || "기타"}
          </Text>
        </View>

        <View style={styles.resultContent}>
          {item.damage_accounts && item.damage_accounts.length > 0 ? (
            item.damage_accounts.map((account, index) => (
              <View key={`account-${index}`} style={styles.infoRow}>
                <Text style={styles.infoLabel}>계좌정보:</Text>
                {account.isCashTransaction ? (
                  <Text style={[styles.resultText, styles.cashText]}>현금 전달</Text>
                ) : (
                  <Text style={styles.resultText} numberOfLines={1} ellipsizeMode="tail">
                    <Text style={{ fontWeight: "bold" }}>
                      {account.bankName || "은행 정보 없음"}
                    </Text>
                    {" / "}
                    <HighlightedText
                      text={account.accountHolderName}
                      highlight={searchTerm}
                    />
                    {" / "}
                    <HighlightedText
                      text={account.accountNumber}
                      highlight={searchTerm}
                    />
                  </Text>
                )}
              </View>
            ))
          ) : null}

          {item.phone_numbers && item.phone_numbers.length > 0 ? (
            item.phone_numbers.map(
              (phone, index) =>
                phone && (
                  <View key={`phone-${index}`} style={styles.infoRow}>
                    <Text style={styles.infoLabel}>전화번호:</Text>
                    <HighlightedText text={phone} highlight={searchTerm} />
                  </View>
                ),
            )
          ) : null}

          {item.nickname && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>닉네임:</Text>
              <HighlightedText text={item.nickname} highlight={searchTerm} />
            </View>
          )}

          {item.site_name && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>사이트:</Text>
              <HighlightedText text={item.site_name} highlight={searchTerm} />
            </View>
          )}

          {item.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.infoLabel}>내용:</Text>
              <HighlightedText
                text={item.description.replace(/\n/g, " ")}
                highlight={searchTerm}
              />
            </View>
          )}

          <Text style={styles.dateText}>
            등록일: {item.created_at ? format(parseISO(item.created_at), "yyyy-MM-dd") : "알 수 없음"}
          </Text>
        </View>
      </View>
    );
  };

  // [수정] 페이지네이션 UI 렌더링 함수
  const renderPagination = () => {
    const totalPages = Math.ceil(allResults.length / RESULTS_PER_PAGE);
    if (totalPages <= 1) return null;

    return (
      <View style={styles.paginationContainer}>
        <TouchableOpacity
          onPress={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={[styles.pageButton, currentPage === 1 && styles.disabledButton]}
        >
          <Icon name="chevron-left" size={24} color={currentPage === 1 ? '#ccc' : '#333'} />
        </TouchableOpacity>

        <Text style={styles.pageInfoText}>
          {currentPage} / {totalPages}
        </Text>

        <TouchableOpacity
          onPress={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]}
        >
          <Icon name="chevron-right" size={24} color={currentPage === totalPages ? '#ccc' : '#333'} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ListHeaderComponent={
          <>
            <Text style={styles.title}>통합 검색</Text>
            <Text style={styles.subtitle}>
              피해 사례에 등록된 전화번호, 계좌번호, 이름, 닉네임, 사이트 주소 등으로 검색할 수 있습니다.
            </Text>
            <View style={styles.searchContainer}>
              <Icon name="magnify" size={22} color="#888" style={styles.searchIcon} />
              <TextInput
                style={styles.input}
                placeholder="검색어를 입력하세요..."
                value={searchTerm}
                onChangeText={handleSearch}
                placeholderTextColor="#888"
                autoFocus
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch("")}>
                  <Icon name="close-circle" size={22} color="#888" style={styles.clearIcon} />
                </TouchableOpacity>
              )}
            </View>
            {isLoading && (
              <ActivityIndicator size="large" color="#3d5afe" style={styles.loader} />
            )}
            {error && <Text style={styles.errorText}>{error}</Text>}
            {allResults.length > 0 && !isLoading && (
              <Text style={styles.totalResultsText}>총 {allResults.length}건의 검색 결과</Text>
            )}
          </>
        }
        data={pagedResults} // [수정] 페이지가 나눠진 결과를 FlatList에 전달
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        ListEmptyComponent={
          !isLoading && searched ? (
            <View style={styles.noResultsContainer}>
              <Icon name="information-outline" size={60} color="#ccc" />
              <Text style={styles.noResultsText}>
                '{searchTerm}'에 대한 검색 결과가 없습니다.
              </Text>
              <Text style={styles.noResultsSubtitle}>다른 검색어를 입력해보세요.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={renderPagination}
        contentContainerStyle={{ flexGrow: 1 }}
      />
    </View>
  );
};

// 기존 UI 스타일 유지 + 페이지네이션 스타일 추가
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginTop: 20,
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginHorizontal: 20,
    paddingHorizontal: 15,
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 45,
    fontSize: 16,
    color: "#333",
  },
  clearIcon: {
    marginLeft: 10,
  },
  loader: {
    marginTop: 50,
  },
  errorText: {
    marginTop: 20,
    color: "red",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  totalResultsText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3d5afe'
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    marginTop: 30,
  },
  noResultsText: {
    marginTop: 15,
    fontSize: 18,
    fontWeight: "bold",
    color: "#555",
  },
  noResultsSubtitle: {
    marginTop: 5,
    fontSize: 14,
    color: "#888",
  },
  resultItem: {
    backgroundColor: "#fff",
    borderRadius: 8,
    marginBottom: 15,
    marginHorizontal: 20,
    marginTop: 15, // 검색 결과 텍스트와 간격
    borderWidth: 1,
    borderColor: "#eee",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  categoryBadge: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  resultContent: {
    padding: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#555",
    width: 65,
  },
  resultText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  highlighted: {
    backgroundColor: "#FFDDAA",
    borderRadius: 3,
  },
  descriptionContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  dateText: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 8,
  },
  cashText: {
    color: "#D32F2F",
    fontWeight: "bold",
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  pageButton: {
    padding: 8,
    marginHorizontal: 10,
    borderRadius: 5,
  },
  disabledButton: {
    opacity: 0.5,
  },
  pageInfoText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
});

export default SearchBaseScreen;
