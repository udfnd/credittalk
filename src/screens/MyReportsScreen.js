import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';

// 정보 행을 렌더링하는 헬퍼 컴포넌트
const InfoRow = ({ icon, label, value, isBoolean = false }) => {
  let displayValue = value;
  if (isBoolean) {
    displayValue = value ? '예' : '아니오';
  }
  if (value === null || typeof value === 'undefined' || value === '')
    return null;

  return (
    <View style={styles.infoRow}>
      <Icon name={icon} size={16} style={styles.infoIcon} />
      <Text style={styles.infoLabel}>{label}: </Text>
      <Text style={styles.infoValue} selectable>
        {displayValue}
      </Text>
    </View>
  );
};

// URL 목록을 렌더링하는 헬퍼 컴포넌트
const UrlList = ({ icon, label, urls }) => {
  if (!urls || urls.length === 0) return null;
  return (
    <View style={styles.listContainer}>
      <View style={styles.infoRow}>
        <Icon name={icon} size={16} style={styles.infoIcon} />
        <Text style={styles.infoLabel}>{label}:</Text>
      </View>
      {urls.map((url, index) => (
        <TouchableOpacity
          key={index}
          onPress={() => url && Linking.openURL(url)}>
          <Text style={styles.urlText}>{url}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

function MyReportsScreen({ navigation }) {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('로그인이 필요합니다.');
      }

      // 이 함수가 백엔드에서 복호화를 완료한 데이터를 반환해야 합니다.
      const { data, error: functionError } = await supabase.functions.invoke(
        'get-my-decrypted-reports',
      );

      if (functionError) throw functionError;
      setReports(data || []);
    } catch (err) {
      setError(err.message || '데이터를 불러오는데 실패했습니다.');
      setReports([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMyReports();
    }, [fetchMyReports]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMyReports();
  }, [fetchMyReports]);

  const renderItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <Text style={styles.itemTitle}>{item.category || '피해 사례'}</Text>
      <Text style={styles.dateText}>
        신고일: {new Date(item.created_at).toLocaleString()}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>피해 정보</Text>
        <InfoRow
          icon="alert-circle-outline"
          label="상세 범죄 유형"
          value={item.detailed_crime_type}
        />
        <InfoRow
          icon="cash"
          label="피해 금액"
          value={
            item.damage_amount
              ? `${item.damage_amount.toLocaleString()}원`
              : '없음'
          }
        />
        <InfoRow
          icon="tag-outline"
          label="거래 품목"
          value={item.damaged_item}
        />
        <InfoRow
          icon="tag-heart-outline"
          label="거래 품목 카테고리"
          value={item.traded_item_category}
        />
        <InfoRow
          icon="calendar-range"
          label="사건 발생일"
          value={
            item.incident_date
              ? new Date(item.incident_date).toLocaleDateString()
              : null
          }
        />
        <InfoRow
          icon="map-marker"
          label="사건 발생 지역"
          value={item.incident_location}
        />
        <InfoRow
          icon="comment-text-outline"
          label="피해자 상황"
          value={item.victim_circumstances}
        />
        <InfoRow
          icon="comment-processing-outline"
          label="피해 경로"
          value={item.damage_path}
        />
        <InfoRow
          icon="text-box-outline"
          label="추가 내용"
          value={item.description}
        />
        <InfoRow
          icon="check-circle-outline"
          label="사기 미수"
          value={item.attempted_fraud}
          isBoolean
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>가해자 정보</Text>
        <InfoRow icon="account-question" label="닉네임" value={item.nickname} />
        <InfoRow icon="gender-male-female" label="성별" value={item.gender} />
        <InfoRow
          icon="account-tie"
          label="사칭 인물"
          value={item.impersonated_person}
        />
        <InfoRow
          icon="phone-hangup"
          label="사칭된 연락처"
          value={item.impersonated_phone_number}
        />
        <InfoRow
          icon="account-search"
          label="가해자 특정 여부"
          value={item.perpetrator_identified}
          isBoolean
        />

        {/* 전화번호 목록 */}
        {item.phone_numbers && item.phone_numbers.length > 0 && (
          <View style={styles.listContainer}>
            <View style={styles.infoRow}>
              <Icon name="phone" size={16} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>가해자 연락처:</Text>
            </View>
            {item.phone_numbers.map((pn, i) => (
              <Text key={`pn-${i}`} style={styles.listItemText} selectable>
                {pn}
              </Text>
            ))}
          </View>
        )}

        {/* 계좌 정보 목록 */}
        {item.damage_accounts && item.damage_accounts.length > 0 && (
          <View style={styles.listContainer}>
            <View style={styles.infoRow}>
              <Icon name="credit-card" size={16} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>피해 계좌:</Text>
            </View>
            {item.damage_accounts.map((account, index) => (
              <Text
                key={`account-${index}`}
                style={styles.listItemText}
                selectable>
                {account.isOtherMethod
                  ? '현금 전달'
                  : `${account.bankName} / ${account.accountHolderName} / ${account.accountNumber}`}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>증거 및 출처</Text>
        <InfoRow icon="web" label="사이트 이름" value={item.site_name} />
        <InfoRow
          icon="source-fork"
          label="신고 출처"
          value={item.scam_report_source}
        />
        <InfoRow icon="domain" label="회사 유형" value={item.company_type} />
      </View>

      {item.analysis_message && (
        <View style={styles.analysisContainer}>
          <View style={styles.analysisHeader}>
            <Icon name="shield-check" size={20} color="#1e88e5" />
            <Text style={styles.analysisTitle}>관리자 분석</Text>
          </View>
          <InfoRow
            icon="chart-donut"
            label="분석 결과"
            value={item.analysis_result}
          />
          <InfoRow icon="account-tie" label="담당자" value={item.analyzer_id} />
          <InfoRow
            icon="calendar-check"
            label="분석일"
            value={
              item.analyzed_at
                ? new Date(item.analyzed_at).toLocaleString()
                : null
            }
          />
          <View style={styles.analysisMessageContainer}>
            <Icon
              name="comment-quote-outline"
              size={16}
              style={styles.infoIcon}
            />
            <Text style={styles.infoLabel}>메시지: </Text>
            <Text style={styles.analysisMessage}>{item.analysis_message}</Text>
          </View>
        </View>
      )}
    </View>
  );

  if (isLoading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={50} color="#e74c3c" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={reports}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.centered}>
              <Icon name="file-document-outline" size={50} color="#bdc3c7" />
              <Text style={styles.emptyText}>작성한 피해사례가 없습니다.</Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  itemContainer: {
    backgroundColor: '#ffffff',
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  itemTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3d5afe',
    marginBottom: 4,
  },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  infoIcon: { marginRight: 10, color: '#555', marginTop: 3 },
  infoLabel: { fontSize: 15, fontWeight: 'bold', color: '#444' },
  infoValue: { fontSize: 15, color: '#666', flexShrink: 1 },
  listContainer: { marginTop: 4, paddingLeft: 10 },
  listItemText: {
    fontSize: 15,
    color: '#666',
    marginLeft: 16,
    marginBottom: 4,
  },
  urlText: {
    fontSize: 15,
    color: '#3498db',
    marginLeft: 16,
    marginBottom: 4,
    textDecorationLine: 'underline',
  },
  dateText: {
    fontSize: 12,
    color: '#777',
    textAlign: 'right',
    marginBottom: 10,
  },
  analysisContainer: {
    marginTop: 20,
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#90caf9',
    borderRadius: 8,
    padding: 15,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  analysisTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1565c0',
    marginLeft: 8,
  },
  analysisMessageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    padding: 10,
    backgroundColor: '#bbdefb',
    borderRadius: 6,
  },
  analysisMessage: {
    fontSize: 15,
    color: '#0d47a1',
    flexShrink: 1,
    lineHeight: 22,
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
  },
  emptyText: { marginTop: 10, fontSize: 16, color: '#7f8c8d' },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#3d5afe',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: { color: 'white', fontSize: 16 },
});

export default MyReportsScreen;
