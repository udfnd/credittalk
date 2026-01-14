import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { logPageView } from '../lib/pageViewLogger';

const { width } = Dimensions.get('window');

const getStatusInfo = (event) => {
  const now = new Date();
  const entryStart = new Date(event.entry_start_at);
  const entryEnd = new Date(event.entry_end_at);

  if (event.status === 'announced') {
    return { label: '발표 완료', color: '#9b59b6', icon: 'trophy', canEnter: false };
  }
  if (event.status === 'closed' || now > entryEnd) {
    return { label: '응모 마감', color: '#95a5a6', icon: 'clock-outline', canEnter: false };
  }
  if (now < entryStart) {
    return { label: '응모 예정', color: '#3498db', icon: 'calendar-clock', canEnter: false };
  }
  return { label: '응모 중', color: '#27ae60', icon: 'check-circle', canEnter: true };
};

function EventDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { eventId } = route.params;
  const { user } = useAuth();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entering, setEntering] = useState(false);

  const fetchEventDetail = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_event_detail', {
        p_event_id: eventId,
      });
      if (error) throw error;
      if (data && data.length > 0) {
        setEvent(data[0]);
      }
    } catch (error) {
      console.error('Error fetching event detail:', error);
      Alert.alert('오류', '이벤트 정보를 불러오는 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (user) {
      logPageView(user.id, 'EventDetailScreen');
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchEventDetail();
    });
    return unsubscribe;
  }, [navigation, fetchEventDetail]);

  useEffect(() => {
    if (event) {
      navigation.setOptions({
        title: event.title,
      });
    }
  }, [event, navigation]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEventDetail();
  };

  const handleEnter = async () => {
    if (!user) {
      Alert.alert('로그인 필요', '이벤트에 응모하려면 로그인이 필요합니다.', [
        { text: '취소', style: 'cancel' },
        { text: '로그인', onPress: () => navigation.navigate('SignIn') },
      ]);
      return;
    }

    Alert.alert(
      '이벤트 응모',
      '이 이벤트에 응모하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '응모하기',
          onPress: async () => {
            setEntering(true);
            try {
              const { data, error } = await supabase.rpc('enter_event', {
                p_event_id: eventId,
              });
              if (error) throw error;

              if (data && data.length > 0) {
                const result = data[0];
                if (result.success) {
                  Alert.alert(
                    '응모 완료!',
                    `응모번호: #${result.entry_number}\n\n${result.message}`,
                    [{ text: '확인' }]
                  );
                  fetchEventDetail();
                } else {
                  Alert.alert('알림', result.message);
                }
              }
            } catch (error) {
              console.error('Error entering event:', error);
              Alert.alert('오류', '응모 처리 중 문제가 발생했습니다.');
            } finally {
              setEntering(false);
            }
          },
        },
      ]
    );
  };

  const statusInfo = useMemo(() => {
    if (!event) return null;
    return getStatusInfo(event);
  }, [event]);

  const hasEntered = event?.user_entry_number !== null;
  const isWinner = event?.user_is_winner === true;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle-outline" size={64} color="#e74c3c" />
        <Text style={styles.errorText}>이벤트를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#3d5afe']}
            tintColor="#3d5afe"
          />
        }>
        {/* 이벤트 이미지 */}
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={styles.eventImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.eventImage, styles.placeholderImage]}>
            <Icon name="calendar-star" size={60} color="#bdc3c7" />
          </View>
        )}

        {/* 상태 배지 */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
            <Icon name={statusInfo.icon} size={16} color="#fff" />
            <Text style={styles.statusText}>{statusInfo.label}</Text>
          </View>
        </View>

        {/* 이벤트 정보 */}
        <View style={styles.contentContainer}>
          <Text style={styles.title}>{event.title}</Text>

          {/* 응모 현황 카드 */}
          {hasEntered && (
            <View style={[styles.entryCard, isWinner && styles.winnerCard]}>
              {isWinner ? (
                <>
                  <Icon name="trophy" size={32} color="#f1c40f" />
                  <View style={styles.entryCardContent}>
                    <Text style={styles.entryCardTitle}>축하합니다! 당첨되셨습니다!</Text>
                    <Text style={styles.entryCardNumber}>
                      응모번호: #{event.user_entry_number}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Icon name="check-circle" size={32} color="#3d5afe" />
                  <View style={styles.entryCardContent}>
                    <Text style={styles.entryCardTitle}>응모 완료</Text>
                    <Text style={styles.entryCardNumber}>
                      응모번호: #{event.user_entry_number}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* 이벤트 상세 정보 */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Icon name="calendar-start" size={20} color="#3d5afe" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>응모 시작</Text>
                  <Text style={styles.infoValue}>
                    {format(new Date(event.entry_start_at), 'yyyy.MM.dd HH:mm', {
                      locale: ko,
                    })}
                  </Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <Icon name="calendar-end" size={20} color="#e74c3c" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>응모 마감</Text>
                  <Text style={styles.infoValue}>
                    {format(new Date(event.entry_end_at), 'yyyy.MM.dd HH:mm', {
                      locale: ko,
                    })}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Icon name="bullhorn" size={20} color="#9b59b6" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>당첨 발표</Text>
                  <Text style={styles.infoValue}>
                    {format(new Date(event.winner_announce_at), 'yyyy.MM.dd HH:mm', {
                      locale: ko,
                    })}
                  </Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <Icon name="gift" size={20} color="#27ae60" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>당첨 인원</Text>
                  <Text style={styles.infoValue}>{event.winner_count}명</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 응모 현황 */}
          <View style={styles.statsSection}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{event.entry_count}</Text>
              <Text style={styles.statLabel}>현재 응모자</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{event.winner_count}</Text>
              <Text style={styles.statLabel}>당첨 인원</Text>
            </View>
          </View>

          {/* 이벤트 설명 */}
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>이벤트 안내</Text>
            <Text style={styles.description}>{event.description}</Text>
          </View>

          {/* 당첨자 발표 (발표 완료 상태일 때) */}
          {event.status === 'announced' && event.winner_numbers && (
            <View style={styles.winnersSection}>
              <Text style={styles.sectionTitle}>당첨번호</Text>
              <View style={styles.winnerNumbersContainer}>
                {event.winner_numbers.map((num, index) => (
                  <View
                    key={index}
                    style={[
                      styles.winnerNumber,
                      num === event.user_entry_number && styles.myWinnerNumber,
                    ]}>
                    <Text
                      style={[
                        styles.winnerNumberText,
                        num === event.user_entry_number && styles.myWinnerNumberText,
                      ]}>
                      #{num}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 하단 응모 버튼 */}
      {!hasEntered && statusInfo.canEnter && (
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.enterButton}
            onPress={handleEnter}
            disabled={entering}
            activeOpacity={0.8}>
            {entering ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="hand-pointing-up" size={22} color="#fff" />
                <Text style={styles.enterButtonText}>응모하기</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {hasEntered && !isWinner && event.status !== 'announced' && (
        <View style={styles.bottomContainer}>
          <View style={styles.enteredButton}>
            <Icon name="check-circle" size={22} color="#fff" />
            <Text style={styles.enterButtonText}>
              응모 완료 (#{event.user_entry_number})
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  errorText: {
    fontSize: 16,
    color: '#7f8c8d',
    marginTop: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  eventImage: {
    width: width,
    height: width * 0.6,
    backgroundColor: '#ecf0f1',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusContainer: {
    paddingHorizontal: 16,
    marginTop: -20,
    zIndex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  contentContainer: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 16,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f4fd',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  winnerCard: {
    backgroundColor: '#fef9e7',
    borderWidth: 2,
    borderColor: '#f1c40f',
  },
  entryCardContent: {
    marginLeft: 12,
  },
  entryCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  entryCardNumber: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 4,
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  infoItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoContent: {
    marginLeft: 10,
  },
  infoLabel: {
    fontSize: 12,
    color: '#95a5a6',
  },
  infoValue: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '500',
    marginTop: 2,
  },
  statsSection: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#3d5afe',
  },
  statLabel: {
    fontSize: 13,
    color: '#7f8c8d',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#ecf0f1',
  },
  descriptionSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#34495e',
    lineHeight: 24,
  },
  winnersSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  winnerNumbersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  winnerNumber: {
    backgroundColor: '#f0f2f5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  myWinnerNumber: {
    backgroundColor: '#f1c40f',
  },
  winnerNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  myWinnerNumberText: {
    color: '#fff',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  enterButton: {
    flexDirection: 'row',
    backgroundColor: '#3d5afe',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  enteredButton: {
    flexDirection: 'row',
    backgroundColor: '#95a5a6',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  enterButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

export default EventDetailScreen;
