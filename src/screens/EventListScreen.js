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

const getStatusInfo = (event) => {
  const now = new Date();
  const entryStart = new Date(event.entry_start_at);
  const entryEnd = new Date(event.entry_end_at);

  if (event.status === 'announced') {
    return { label: '발표 완료', color: '#9b59b6', icon: 'trophy' };
  }
  if (event.status === 'closed' || now > entryEnd) {
    return { label: '응모 마감', color: '#95a5a6', icon: 'clock-outline' };
  }
  if (now < entryStart) {
    return { label: '응모 예정', color: '#3498db', icon: 'calendar-clock' };
  }
  return { label: '응모 중', color: '#27ae60', icon: 'check-circle' };
};

function EventListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_events_list');
      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      logPageView(user.id, 'EventListScreen');
    }
  }, [user]);

  useEffect(() => {
    if (isFocused) {
      fetchEvents();
    }
  }, [isFocused, fetchEvents]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const handleEventPress = (event) => {
    navigation.navigate('EventDetail', { eventId: event.id });
  };

  const renderEventItem = ({ item }) => {
    const statusInfo = getStatusInfo(item);
    const hasEntered = item.user_entry_number !== null;

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => handleEventPress(item)}
        activeOpacity={0.8}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={styles.eventImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.eventImage, styles.placeholderImage]}>
            <Icon name="calendar-star" size={40} color="#bdc3c7" />
          </View>
        )}
        <View style={styles.eventContent}>
          <View style={styles.eventHeader}>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
              <Icon name={statusInfo.icon} size={12} color="#fff" />
              <Text style={styles.statusText}>{statusInfo.label}</Text>
            </View>
            {hasEntered && (
              <View style={styles.enteredBadge}>
                <Icon name="check" size={12} color="#fff" />
                <Text style={styles.enteredText}>응모완료</Text>
              </View>
            )}
          </View>
          <Text style={styles.eventTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.eventDescription} numberOfLines={2}>
            {item.description}
          </Text>
          <View style={styles.eventMeta}>
            <View style={styles.metaItem}>
              <Icon name="calendar-range" size={14} color="#7f8c8d" />
              <Text style={styles.metaText}>
                {format(new Date(item.entry_start_at), 'M.d', { locale: ko })} ~{' '}
                {format(new Date(item.entry_end_at), 'M.d', { locale: ko })}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Icon name="account-group" size={14} color="#7f8c8d" />
              <Text style={styles.metaText}>{item.entry_count}명 응모</Text>
            </View>
            <View style={styles.metaItem}>
              <Icon name="gift" size={14} color="#7f8c8d" />
              <Text style={styles.metaText}>{item.winner_count}명 당첨</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Icon name="calendar-blank" size={64} color="#bdc3c7" />
      <Text style={styles.emptyText}>진행 중인 이벤트가 없습니다.</Text>
      <Text style={styles.emptySubText}>새로운 이벤트를 기다려주세요!</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderEventItem}
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
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  eventImage: {
    width: '100%',
    height: 160,
    backgroundColor: '#ecf0f1',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventContent: {
    padding: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  enteredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3d5afe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  enteredText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 6,
  },
  eventDescription: {
    fontSize: 14,
    color: '#7f8c8d',
    lineHeight: 20,
    marginBottom: 12,
  },
  eventMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
    paddingTop: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#7f8c8d',
    marginLeft: 4,
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
});

export default EventListScreen;
