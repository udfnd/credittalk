import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    RefreshControl, // 추가
} from 'react-native';
import { supabase } from '../lib/supabaseClient'; //
import { useAuth } from '../context/AuthContext'; //
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

function ChatListScreen() {
    const { user } = useAuth();
    const navigation = useNavigation();
    const isFocused = useIsFocused(); // 화면 포커스 여부 감지
    const [chatRooms, setChatRooms] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false); // 새로고침 상태

    const fetchChatRooms = useCallback(async () => {
        if (!user) {
            // 사용자가 없는 경우 로딩 상태만 해제하고 반환 (AuthContext에서 로그인 처리)
            setIsLoading(false);
            setRefreshing(false);
            setChatRooms([]); // 채팅방 목록 비우기
            return;
        }

        // 새로고침이 아닐 때만 전체 로딩 표시
        if (!refreshing) {
            setIsLoading(true);
        }

        // Supabase 쿼리: chat_rooms와 관련된 참여자 프로필, 마지막 메시지를 함께 가져옴
        // RLS 정책에 의해 현재 사용자가 참여한 채팅방만 반환됨
        const { data, error } = await supabase
            .from('chat_rooms')
            .select(`
        id,
        name,
        created_at,
        updated_at,
        last_message_at,
        participants:chat_room_participants_with_profile!inner (
          author_auth_id, 
          user_name
        ),
        last_message:chat_messages ( content, created_at, sender_id )
      `)
            .order('last_message_at', { ascending: false });

        if (error) {
            Alert.alert('오류', '채팅방 목록을 불러오는데 실패했습니다.');
            console.error('Fetch chat rooms error:', error);
            setChatRooms([]); // 오류 발생 시 목록 비우기
        } else {
            const formattedRooms = data?.map(room => {
                let roomName = room.name;
                let otherUser = null;

                const participants = room.participants || [];

                if (!roomName && participants.length === 2) {
                    otherUser = participants.find(p => p.author_auth_id !== user.id);
                    roomName = otherUser?.user_name || '알 수 없는 사용자';
                } else if (!roomName && participants.length === 1 && participants[0].author_auth_id === user.id) {
                    roomName = '나와의 채팅';
                }

                const lastMessage = room.last_message && room.last_message.length > 0 ? room.last_message[0] : null;

                return {
                    ...room,
                    display_name: roomName || '그룹 채팅', // 그룹 채팅의 경우 room.name이 사용됨
                    latest_message_content: lastMessage?.content,
                    latest_message_time: lastMessage?.created_at,
                };
            }) || [];
            setChatRooms(formattedRooms);
        }
        setIsLoading(false);
        setRefreshing(false);
    }, [user, refreshing]); // refreshing을 의존성 배열에 추가

    useEffect(() => {
        if (isFocused && user) { // 사용자가 로그인했을 때만 호출
            fetchChatRooms();
        } else if (!user) { // 로그아웃 상태 등 사용자 정보가 없을 때
            setChatRooms([]); // 채팅방 목록 초기화
            setIsLoading(false); // 로딩 상태 해제
        }
    }, [fetchChatRooms, isFocused, user]); // user를 의존성 배열에 추가

    useEffect(() => {
        navigation.setOptions({ title: '채팅 목록' }); // 화면이 포커스될 때마다 제목 설정
    }, [navigation]);

    // 실시간 구독 설정
    useEffect(() => {
        if (!user) return;

        const channels = supabase
            .channel('custom-all-chat-changes') // 고유한 채널 이름
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'chat_rooms' },
                (payload) => {
                    console.log('Chat room table change detected (chat_rooms):', payload);
                    fetchChatRooms();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'chat_room_participants' },
                (payload) => {
                    console.log('Chat room participants table change detected (chat_room_participants):', payload);
                    fetchChatRooms();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    // filter: `room_id=in.(${chatRooms.map(r => r.id).join(',')})` // 현재 보고있는 방들만 필터링 (선택적 최적화)
                },
                (payload) => {
                    console.log('New message detected (chat_messages):', payload);
                    // 새 메시지가 오면 chat_rooms의 last_message_at이 트리거로 업데이트되므로,
                    // chat_rooms 변경 감지로도 충분할 수 있지만, 명시적으로 메시지 테이블도 구독합니다.
                    fetchChatRooms();
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Subscribed to chat changes!');
                }
                if (status === 'CHANNEL_ERROR') {
                    console.error('Chat changes subscription error:', err);
                }
                if (status === 'TIMED_OUT') {
                    console.warn('Chat changes subscription timed out.');
                }
            });

        return () => {
            supabase.removeChannel(channels);
        };


    }, [user, fetchChatRooms]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
    }, []);

    if (isLoading && chatRooms.length === 0 && !refreshing) {
        return <ActivityIndicator style={styles.centered} size="large" color="#3d5afe" />;
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={chatRooms}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.roomItem}
                        onPress={() =>
                            navigation.navigate('ChatMessageScreen', {
                                roomId: item.id,
                                roomName: item.display_name,
                            })
                        }
                    >
                        <View style={styles.roomInfo}>
                            <Text style={styles.roomName}>{item.display_name}</Text>
                            {item.latest_message_content && (
                                <Text style={styles.lastMessage} numberOfLines={1}>
                                    {item.latest_message_content}
                                </Text>
                            )}
                        </View>
                        {item.latest_message_time && (
                            <Text style={styles.lastMessageTime}>
                                {new Date(item.latest_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </Text>
                        )}
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    !isLoading && ( // 로딩 중이 아닐 때만 "없음" 메시지 표시
                        <View style={styles.centeredEmpty}>
                            <Icon name="chat-remove-outline" size={50} color="#bdc3c7" />
                            <Text style={styles.emptyText}>참여중인 채팅방이 없습니다.</Text>
                        </View>
                    )
                }
                refreshControl={ // 추가
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={["#3d5afe"]} // Android용 스피너 색상
                        tintColor={"#3d5afe"} // iOS용 스피너 색상
                    />
                }
            />
            <TouchableOpacity
                style={styles.fab}
                onPress={() => navigation.navigate('NewChatScreen')}
            >
                <Icon name="plus" size={30} color="white" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f2f5' }, // 배경색 변경
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    centeredEmpty: { // 비어있을 때 메시지를 위한 스타일
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 50, // 적절한 여백
    },
    roomItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0', // 구분선 색상 변경
        backgroundColor: '#ffffff', // 각 아이템 배경색
        marginHorizontal: 10, // 좌우 여백
        marginTop: 8, // 상단 여백
        borderRadius: 8, // 모서리 둥글게
        elevation: 1, // Android 그림자
        shadowColor: '#000', // iOS 그림자
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
    },
    roomInfo: {
        flex: 1,
        marginRight: 10, // 시간과의 간격
    },
    roomName: { fontSize: 17, fontWeight: '600', color: '#333', marginBottom: 4 },
    lastMessage: { fontSize: 14, color: '#555' },
    lastMessageTime: { fontSize: 12, color: '#777' },
    emptyText: { textAlign: 'center', marginTop: 10, fontSize: 16, color: 'gray' },
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
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    },
});

export default ChatListScreen;
