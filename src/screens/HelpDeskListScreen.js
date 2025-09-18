import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { logPageView } from '../lib/pageViewLogger';
import HelpDeskPinnedNotices from '../components/HelpDeskPinnedNotices';

export default function HelpDeskListScreen({ navigation }) {
  const { user } = useAuth(); // 현재 로그인한 사용자 정보
  const [questions, setQuestions] = useState([]);
  const [publicIdSet, setPublicIdSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    if (user) {
      logPageView(user.id, 'HelpDeskListScreen');
    }
  }, [user]);

  const fetchPinnedNotices = async () => {
    const { data, error } = await supabase
      .from('help_desk_notices')
      .select('id, title, body, pinned, pinned_at, pinned_until')
      .eq('is_published', true)
      .order('pinned', { ascending: false })
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(3);
    if (!error) setNotices(data || []);
  };

  const fetchQuestionsAndPublicStatus = async () => {
    if (!user) {
      setQuestions([]);
      setLoading(false);
      return;
    }
    await fetchPinnedNotices();

    const { data: questionsData, error: questionsError } = await supabase
      .from('help_questions')
      .select('*')
      .order('created_at', { ascending: false });

    if (questionsError) {
      console.error('Error fetching questions:', questionsError);
      Alert.alert('오류', '문의 목록을 불러오는 데 실패했습니다.');
      setLoading(false);
      return;
    }

    if (!questionsData || questionsData.length === 0) {
      setQuestions([]);
      setPublicIdSet(new Set());
      setLoading(false);
      return;
    }

    const questionIds = questionsData.map(q => q.id);

    const { data: publicCases, error: publicError } = await supabase
      .from('new_crime_cases')
      .select('source_help_question_id')
      .in('source_help_question_id', questionIds);

    if (publicError) {
      console.error('Error fetching public status:', publicError);
    } else {
      const publicSet = new Set(
        publicCases.map(p => p.source_help_question_id),
      );
      setPublicIdSet(publicSet);
    }

    setQuestions(questionsData);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchQuestionsAndPublicStatus();
    }, [user]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      fetchPinnedNotices(),
      fetchQuestionsAndPublicStatus(),
    ]).finally(() => setRefreshing(false));
  }, [user]);

  const openNotice = n => {
    navigation.navigate('HelpDeskNoticeDetail', { noticeId: n.id });
  };

  const renderItem = ({ item }) => {
    const isPublic = publicIdSet.has(item.id);
    // [핵심 수정] 현재 사용자가 작성한 질문인지 확인하는 변수 추가
    const currentUserId = user?.id || user?.uid;
    const isMine = user && item.user_id === currentUserId;
    // [핵심 수정] 공개되었거나, 내가 쓴 글이면 클릭 가능
    const isClickable = isPublic || isMine;

    // 상태에 따른 스타일과 텍스트를 결정하는 함수
    const getStatusInfo = () => {
      if (isPublic) {
        return {
          text: '공개된 질문',
          style: styles.publicTag,
          icon: 'lock-open-variant-outline',
          color: '#228be6',
        };
      }
      if (isMine) {
        return {
          text: '내가 쓴 비공개 질문',
          style: styles.myPrivateTag,
          icon: 'lock-outline',
          color: '#845ef7',
        };
      }
      return {
        text: '비공개 질문',
        style: styles.privateTag,
        icon: 'lock-outline',
        color: '#868e96',
      };
    };

    const statusInfo = getStatusInfo();

    return (
      <TouchableOpacity
        style={[
          styles.itemContainer,
          // [수정] 클릭 불가능한 항목에만 비활성화 스타일 적용
          !isClickable && styles.disabledItem,
        ]}
        // [수정] isClickable 변수에 따라 비활성화 여부 결정
        disabled={!isClickable}
        onPress={() =>
          navigation.navigate('HelpDeskDetail', { questionId: item.id })
        }>
        <View style={styles.itemHeader}>
          <Icon
            name={statusInfo.icon}
            size={16}
            color={statusInfo.color}
            style={styles.iconStyle}
          />
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.case_summary || item.title || '상세 내용 없음'}
          </Text>
          <Text style={styles.itemDate}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.statusContainer}>
          <Text style={[styles.statusTag, statusInfo.style]}>
            {statusInfo.text}
          </Text>
          <Text
            style={
              item.is_answered ? styles.statusAnswered : styles.statusPending
            }>
            {item.is_answered ? '답변 완료' : '답변 대기중'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Icon name="login" size={60} color="#ced4da" />
        <Text style={styles.emptyText}>로그인이 필요합니다</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {questions.length === 0 ? (
        <View style={styles.centered}>
          <Icon name="chat-question-outline" size={60} color="#ced4da" />
          <Text style={styles.emptyText}>작성한 문의 내역이 없습니다.</Text>
        </View>
      ) : (
        <FlatList
          data={questions}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <HelpDeskPinnedNotices
              notices={notices}
              onPressNotice={openNotice}
            />
          }
        />
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('HelpDeskCreate')}>
        <Icon name="pencil-plus" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#495057',
    marginTop: 15,
  },
  itemContainer: {
    backgroundColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  disabledItem: {
    backgroundColor: '#f1f3f5',
    opacity: 0.6,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconStyle: { marginRight: 8 },
  itemTitle: { fontSize: 16, fontWeight: 'bold', color: '#343a40', flex: 1 },
  itemDate: { fontSize: 12, color: '#868e96', marginLeft: 10 },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  statusTag: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  publicTag: { backgroundColor: '#dbe4ff', color: '#3d5afe' },
  privateTag: { backgroundColor: '#e9ecef', color: '#868e96' },
  myPrivateTag: { backgroundColor: '#e5dbff', color: '#7048e8' }, // [추가] 내가 쓴 비공개 질문 스타일
  statusAnswered: { fontSize: 14, color: '#3d5afe', fontWeight: '600' },
  statusPending: { fontSize: 14, color: '#f03e3e', fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 60,
    backgroundColor: '#3d5afe',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
