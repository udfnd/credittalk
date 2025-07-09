// src/screens/SearchBaseScreen.js
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
} from "react-native";
import { supabase } from "../lib/supabaseClient";
import { debounce } from "lodash";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { format, parseISO } from "date-fns";
import { useRoute, useNavigation } from "@react-navigation/native";

export const SEARCH_TYPES = {
  UNIFIED: "unified",
  ACCOUNT: "account",
  PHONE: "phone",
  NUMERIC_UNIFIED: "numeric_unified",
};

const categoryStyles = {
  "보이스피싱, 전기통신금융사기, 로맨스 스캠 사기": {
    backgroundColor: "#FFEBEE",
    color: "#D32F2F",
  },
  불법사금융: { backgroundColor: "#E8EAF6", color: "#303F9F" },
  "중고물품 사기": { backgroundColor: "#E0F2F1", color: "#00796B" },
  "투자 사기": { backgroundColor: "#FFF8E1", color: "#FFA000" },
  "부동산 사기 (전, 월세 사기)": {
    backgroundColor: "#F3E5F5",
    color: "#7B1FA2",
  },
  암호화폐: { backgroundColor: "#E1F5FE", color: "#0288D1" },
  노쇼: { backgroundColor: "#F1F8E9", color: "#689F38" },
  "노쇼 대리구매 사기": { backgroundColor: "#FFFDE7", color: "#FBC02D" },
  "공갈 협박 범죄": { backgroundColor: "#212121", color: "#FFFFFF" },
  "렌탈 사업 피해": { backgroundColor: "#FBE9E7", color: "#D84315" },
  기타: { backgroundColor: "#ECEFF1", color: "#455A64" },
};

const getCategoryStyle = (category) => {
  return categoryStyles[category] || categoryStyles["기타"];
};

const maskNameMiddle = (name) => {
  if (!name || typeof name !== "string" || name.length <= 1) {
    return name || "";
  }
  if (name.length === 2) {
    return `${name[0]}*`;
  }
  const middleIndex = Math.floor(name.length / 2);
  return `${name.substring(0, middleIndex)}*${name.substring(middleIndex + 1)}`;
};

const maskPhoneNumberCustom = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return phoneNumber || "";
  }
  const cleanNumber = phoneNumber.replace(/-/g, "");
  const len = cleanNumber.length;

  if (len === 11) {
    const p1 = cleanNumber.substring(0, 3);
    const p2 = cleanNumber.substring(3, 7);
    const p3 = cleanNumber.substring(7, 11);
    const maskedP2 = `${p2.substring(0, 1)}**${p2.substring(3)}`;
    const maskedP3 = `*${p3.substring(1, 3)}*`;
    return `${p1}-${maskedP2}-${maskedP3}`;
  }
  if (len === 10) {
    if (cleanNumber.startsWith("02")) {
      const p1 = cleanNumber.substring(0, 2);
      const p2 = cleanNumber.substring(2, 6);
      const p3 = cleanNumber.substring(6, 10);
      const maskedP2 = `${p2.substring(0, 1)}**${p2.substring(3)}`;
      const maskedP3 = `*${p3.substring(1, 3)}*`;
      return `${p1}-${maskedP2}-${maskedP3}`;
    }
    const p1 = cleanNumber.substring(0, 3);
    const p2 = cleanNumber.substring(3, 6);
    const p3 = cleanNumber.substring(6, 10);
    const maskedP2 = `*${p2.substring(1, 2)}*`;
    const maskedP3 = `*${p3.substring(1, 3)}*`;
    return `${p1}-${maskedP2}-${maskedP3}`;
  }

  const midIndex = Math.floor(len / 2) - 1;
  if (midIndex <= 0) return cleanNumber;
  return `${cleanNumber.substring(0, midIndex)}**${cleanNumber.substring(
    midIndex + 2,
  )}`;
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || typeof accountNumber !== "string") {
    return accountNumber || "";
  }
  const cleanAccount = accountNumber.replace(/-/g, "");
  const len = cleanAccount.length;

  if (len < 5) {
    return accountNumber;
  }
  const start = 2;
  const end = len - 2;
  return `${cleanAccount.substring(0, start)}${"*".repeat(
    end - start,
  )}${cleanAccount.substring(end)}`;
};

const HighlightedText = ({ text, highlight }) => {
  if (!text) return null;
  if (!highlight || !highlight.trim()) {
    return <Text style={styles.resultText}>{text}</Text>;
  }
  const regex = new RegExp(
    `(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
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

// 통계 표시 컴포넌트
const SearchStatistics = ({ stats }) => {
  if (!stats) return null;

  const {
    reportCount,
    relatedAccounts,
    relatedPhones,
    relatedNicknames,
    searchedTerm,
  } = stats;

  const isProbablyPhone =
    searchedTerm.includes("-") ||
    (searchedTerm.length >= 10 &&
      /^\d+$/.test(searchedTerm.replace(/-/g, "")));

  return (
    <View style={styles.statsContainer}>
      <Icon
        name="information"
        size={22}
        color="#3d5afe"
        style={styles.statsIcon}
      />
      <View style={styles.statsTextContainer}>
        <Text style={styles.statsMainText}>
          '{searchedTerm}'(으)로 총{" "}
          <Text style={{ fontWeight: "bold", color: "#D32F2F" }}>
            {reportCount}건
          </Text>
          의 피해가 접수되었습니다.
        </Text>
        {isProbablyPhone && relatedAccounts.length > 0 && (
          <Text style={styles.statsSubText}>
            ∙ 연관 계좌: {relatedAccounts.join(", ")}
          </Text>
        )}
        {!isProbablyPhone && relatedPhones.length > 0 && (
          <Text style={styles.statsSubText}>
            ∙ 연관 전화번호: {relatedPhones.join(", ")}
          </Text>
        )}
        {relatedNicknames.length > 0 && (
          <Text style={styles.statsSubText}>
            ∙ 사용 닉네임: {relatedNicknames.join(", ")}
          </Text>
        )}
      </View>
    </View>
  );
};

const RESULTS_PER_PAGE = 5;

const SearchBaseScreen = ({ title }) => {
  const route = useRoute();
  const navigation = useNavigation();
  const initialSearchTerm = route.params?.searchTerm ?? "";

  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [isLoading, setIsLoading] = useState(!!initialSearchTerm);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(!!initialSearchTerm);

  const [allResults, setAllResults] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagedResults, setPagedResults] = useState([]);
  const [searchStats, setSearchStats] = useState(null);

  const debouncedSearch = useCallback(
    debounce(async (term) => {
      const trimmedTerm = term.trim();
      if (!trimmedTerm || trimmedTerm.length < 2) {
        setAllResults([]);
        setSearched(false);
        setIsLoading(false);
        setSearchStats(null);
        return;
      }

      Keyboard.dismiss();
      setIsLoading(true);
      setSearched(true);
      setError("");
      setCurrentPage(1);
      setSearchStats(null);

      try {
        const { data, error: rpcError } = await supabase.rpc("search_reports", {
          search_term: trimmedTerm,
        });

        if (rpcError) throw rpcError;
        setAllResults(data || []);

        // --- 통계 추출 로직 ---
        if (data && data.length > 0) {
          const cleanedSearchTerm = trimmedTerm.replace(/-/g, "");
          const isNumeric = /^\d+$/.test(cleanedSearchTerm);
          let isExactMatchFound = false;

          if (isNumeric) {
            const stats = {
              reportCount: 0,
              relatedAccounts: new Set(),
              relatedPhones: new Set(),
              relatedNicknames: new Set(),
              searchedTerm: trimmedTerm,
            };

            const isPhoneSearch =
              cleanedSearchTerm.length >= 10 &&
              cleanedSearchTerm.startsWith("0");

            data.forEach((report) => {
              let matchInThisReport = false;
              if (
                report.phone_numbers?.some(
                  (p) => p?.replace(/-/g, "") === cleanedSearchTerm,
                )
              ) {
                isExactMatchFound = true;
                matchInThisReport = true;
              }
              if (
                report.damage_accounts?.some(
                  (acc) =>
                    acc.accountNumber?.replace(/-/g, "") === cleanedSearchTerm,
                )
              ) {
                isExactMatchFound = true;
                matchInThisReport = true;
              }

              if (matchInThisReport) {
                stats.reportCount++;
                if (report.nickname) stats.relatedNicknames.add(report.nickname);

                if (isPhoneSearch) {
                  report.damage_accounts?.forEach((acc) => {
                    if (acc.accountNumber)
                      stats.relatedAccounts.add(
                        `${acc.bankName} ${maskAccountNumber(
                          acc.accountNumber,
                        )}`,
                      );
                  });
                } else {
                  report.phone_numbers?.forEach((p) => {
                    if (p) stats.relatedPhones.add(maskPhoneNumberCustom(p));
                  });
                }
              }
            });

            if (isExactMatchFound) {
              setSearchStats({
                ...stats,
                relatedAccounts: Array.from(stats.relatedAccounts),
                relatedPhones: Array.from(stats.relatedPhones),
                relatedNicknames: Array.from(stats.relatedNicknames),
              });
            }
          }
        }
        // --- 통계 추출 로직 끝 ---
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

  useEffect(() => {
    if (initialSearchTerm) {
      handleSearch(initialSearchTerm);
    }
  }, [initialSearchTerm]);

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
      setSearchStats(null);
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
    }
  };

  const renderItem = ({ item }) => {
    const style = getCategoryStyle(item.category);
    return (
      <View style={styles.resultItem}>
        <View
          style={[
            styles.categoryBadge,
            { backgroundColor: style.backgroundColor },
          ]}
        >
          <Text style={[styles.categoryText, { color: style.color }]}>
            {item.category || "기타"}
          </Text>
        </View>

        <View style={styles.resultContent}>
          {item.damage_accounts?.map((account, index) => (
            <View key={`account-${index}`} style={styles.infoRow}>
              <Text style={styles.infoLabel}>계좌정보:</Text>
              {account.isCashTransaction ? (
                <Text style={[styles.resultText, styles.cashText]}>현금 전달</Text>
              ) : (
                <Text style={styles.resultText} ellipsizeMode="tail">
                  <Text style={{ fontWeight: "bold" }}>
                    {account.bankName || "은행 정보 없음"}
                  </Text>
                  {" / "}
                  <HighlightedText
                    text={maskNameMiddle(account.accountHolderName)}
                    highlight={searchTerm}
                  />
                  {" / "}
                  <HighlightedText
                    text={maskAccountNumber(account.accountNumber)}
                    highlight={searchTerm}
                  />
                </Text>
              )}
            </View>
          ))}

          {item.phone_numbers?.map(
            (phone, index) =>
              phone && (
                <View key={`phone-${index}`} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>전화번호:</Text>
                  <HighlightedText
                    text={maskPhoneNumberCustom(phone)}
                    highlight={searchTerm}
                  />
                </View>
              ),
          )}

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
            등록일:{" "}
            {item.created_at
              ? format(parseISO(item.created_at), "yyyy-MM-dd")
              : "알 수 없음"}
          </Text>
        </View>
      </View>
    );
  };

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
          <Icon name="chevron-left" size={24} color={currentPage === 1 ? "#ccc" : "#333"} />
        </TouchableOpacity>
        <Text style={styles.pageInfoText}>
          {currentPage} / {totalPages}
        </Text>
        <TouchableOpacity
          onPress={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]}
        >
          <Icon name="chevron-right" size={24} color={currentPage === totalPages ? "#ccc" : "#333"} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ListHeaderComponent={
          <>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              피해 사례에 등록된 전화번호 및 계좌번호로 검색할 수 있습니다.
            </Text>
            <View style={styles.searchContainer}>
              <Icon name="magnify" size={22} color="#888" style={styles.searchIcon} />
              <TextInput
                style={styles.input}
                placeholder="전화번호, 계좌번호, 닉네임 등"
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
            {isLoading && <ActivityIndicator size="large" color="#3d5afe" style={styles.loader} />}
            {error && <Text style={styles.errorText}>{error}</Text>}
            <SearchStatistics stats={searchStats} />
            {allResults.length > 0 && !isLoading && (
              <Text style={styles.totalResultsText}>
                총 {allResults.length}건의 검색 결과
              </Text>
            )}
          </>
        }
        data={pagedResults}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        ListEmptyComponent={
          !isLoading && searched && (
            <View style={styles.noResultsContainer}>
              <Icon name="shield-off-outline" size={60} color="#ccc" />
              <Text style={styles.noResultsText}>피해 사실이 없습니다.</Text>
              <TouchableOpacity style={styles.registerButton} onPress={() => navigation.navigate("Report")}>
                <Text style={styles.registerButtonText}>피해 사례 등록하기</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={renderPagination}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
};

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
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: "#333",
  },
  clearIcon: {
    marginLeft: 10,
  },
  loader: {
    marginVertical: 30,
  },
  errorText: {
    marginTop: 20,
    color: "red",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  totalResultsText: {
    paddingHorizontal: 22,
    marginTop: 20,
    marginBottom: 5,
    fontSize: 14,
    fontWeight: "600",
    color: "#444",
  },
  statsContainer: {
    flexDirection: "row",
    backgroundColor: "#F3F5FF",
    borderRadius: 8,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: "#D8DEFF",
  },
  statsIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  statsTextContainer: {
    flex: 1,
  },
  statsMainText: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
    fontWeight: '500',
  },
  statsSubText: {
    fontSize: 14,
    color: "#555",
    lineHeight: 21,
    marginTop: 5,
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
  registerButton: {
    backgroundColor: "#3d5afe",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    marginTop: 25,
  },
  registerButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  resultItem: {
    backgroundColor: "#fff",
    borderRadius: 8,
    marginBottom: 15,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "#eee",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
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
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
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
    lineHeight: 20,
  },
  highlighted: {
    backgroundColor: "rgba(255, 221, 170, 0.7)",
    borderRadius: 3,
    fontWeight: 'bold',
  },
  descriptionContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
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
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
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
    fontWeight: "bold",
    color: "#333",
  },
});

export default SearchBaseScreen;
