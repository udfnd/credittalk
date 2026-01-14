import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { logPageView } from '../lib/pageViewLogger';

const getEntryStatus = (entry) => {
  if (entry.event_status === 'announced') {
    if (entry.is_winner) {
      return { label: '당첨', color: '#f1c40f', icon: 'trophy', bgColor: '#fef9e7' };
    }
    return { label: '미당첨', color: '#95a5a6', icon: 'emoticon-sad-outline', bgColor: '#f0f2f5' };
  }
  if (entry.event_status === 'closed') {
    return { label: '발표 대기', color: '#9b59b6', icon: 'clock-outline', bgColor: '#f5eef8' };
  }
  return { label: '응모 완료', color: '#3d5afe', icon: 'check-circle', bgColor: '#e8f4fd' };
};

function MyEventsScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyEntries = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_my_event_entries');
      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching my entries:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      logPageView(user.id, 'MyEventsScreen');
    }
  }, [user]);

  useEffect(() => {
    if (isFocused) {
      fetchMyEntries();
    }
  }, [isFocused, fetchMyEntries]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMyEntries();
  };

  const handleEntryPress = (entry) => {
    navigation.navigate('EventDetail', { eventId: entry.event_id });
  };

  const renderEntryItem = ({ item }) => {
    const statusInfo = getEntryStatus(item);

    return (
      <TouchableOpacity
        style={styles.entryCard}
        onPress={() => handleEntryPress(item)}
        activeOpacity={0.8}>
        <View style={styles.entryContent}>
          {item.event_image_url ? (
            <Image
              source={{ uri: item.event_image_url }}
              style={styles.eventThumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.eventThumbnail, styles.placeholderThumbnail]}>
              <Icon name="calendar-star" size={24} color="#bdc3c7" />
            </View>
          )}
          <View style={styles.entryInfo}>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {item.event_title}
            </Text>
            <View style={styles.entryMeta}>
              <Text style={styles.entryNumber}>응모번호: #{item.entry_number}</Text>
              <Text style={styles.entryDate}>
                {format(new Date(item.entry_created_at), 'M.d 응모', { locale: ko })}
              </Text>
            </View>
            {item.event_status !== 'announced' && (
              <Text style={styles.announceDate}>
                발표: {format(new Date(item.event_winner_announce_at), 'M월 d일', { locale: ko })}
              </Text>
            )}
          </View>
          <View
            style={[styles.statusBadge, { backgroundColor: statusInfo.bgColor }]}>
            <Icon name={statusInfo.icon} size={20} color={statusInfo.color} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Icon name="ticket-outline" size={64} color="#bdc3c7" />
      <Text style={styles.emptyText}>응모한 이벤트가 없습니다.</Text>
      <Text style={styles.emptySubText}>이벤트에 참여해보세요!</Text>
      <TouchableOpacity
        style={styles.goToEventButton}
        onPress={() => navigation.navigate('EventList')}>
        <Text style={styles.goToEventButtonText}>이벤트 보러가기</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  // 통계 계산
  const totalEntries = entries.length;
  const winCount = entries.filter((e) => e.is_winner).length;
  const pendingCount = entries.filter(
    (e) => e.event_status !== 'announced'
  ).length;

  return (
    <View style={styles.container}>
      {/* 통계 섹션 */}
      {totalEntries > 0 && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalEntries}</Text>
            <Text style={styles.statLabel}>총 응모</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#f1c40f' }]}>{winCount}</Text>
            <Text style={styles.statLabel}>당첨</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#9b59b6' }]}>
              {pendingCount}
            </Text>
            <Text style={styles.statLabel}>발표 대기</Text>
          </View>
        </View>
      )}

      <FlatList
        data={entries}
        keyExtractor={(item) => item.entry_id.toString()}
        renderItem={renderEntryItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#3d5afe']}
            tintColor="#3d5afe"
          />
        }
        ListEmptyComponent={renderEmptyComponent}
        showsVerticalScrollIndicator={false}
      />
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
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3d5afe',
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#ecf0f1',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  entryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  eventThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#ecf0f1',
  },
  placeholderThumbnail: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryNumber: {
    fontSize: 13,
    color: '#3d5afe',
    fontWeight: '500',
  },
  entryDate: {
    fontSize: 12,
    color: '#95a5a6',
    marginLeft: 8,
  },
  announceDate: {
    fontSize: 12,
    color: '#9b59b6',
    marginTop: 4,
  },
  statusBadge: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    color: '#7f8c8d',
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubText: {
    fontSize: 14,
    color: '#95a5a6',
    marginTop: 8,
  },
  goToEventButton: {
    backgroundColor: '#3d5afe',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
  },
  goToEventButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default MyEventsScreen;
