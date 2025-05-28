// src/screens/ChatMessageScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { GiftedChat } from 'react-native-gifted-chat';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useRoute } from '@react-navigation/native';

function ChatMessageScreen() {
    const { user, profile } = useAuth();
    const navigation = useNavigation();
    const route = useRoute();
    const { roomId, roomName } = route.params;

    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        navigation.setOptions({ title: roomName || '채팅' });
    }, [navigation, roomName]);

    const fetchMessages = useCallback(async () => {
        if (!roomId) return;
        setIsLoading(true);
        // RLS 정책에 의해 해당 방의 메시지만 가져옴
        const { data, error } = await supabase
            .from('chat_messages')
            .select(`
        id,
        content,
        created_at,
        sender_id,
        sender_profile:users!chat_messages_sender_id_fkey (name)
      `)
            .eq('room_id', roomId)
            .order('created_at', { ascending: false }); // 최신 메시지가 아래로 오도록 정렬

        if (error) {
            Alert.alert('오류', '메시지를 불러오는데 실패했습니다.');
            console.error(error);
        } else {
            const giftedChatMessages = data?.map(msg => ({
                _id: msg.id,
                text: msg.content,
                createdAt: new Date(msg.created_at),
                user: {
                    _id: msg.sender_id,
                    name: msg.sender_profile?.name || '알 수 없는 사용자',
                    // avatar: 'url_to_avatar_if_available'
                },
            })) || [];
            setMessages(giftedChatMessages);
        }
        setIsLoading(false);
    }, [roomId]);

    useEffect(() => {
        fetchMessages();

        // 실시간 메시지 구독
        const channel = supabase
            .channel(`chat_room_${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `room_id=eq.${roomId}`,
                },
                async (payload) => {
                    console.log('New message received via realtime!', payload);
                    // 새로 받은 메시지 처리 (sender_profile 정보 함께 가져오기)
                    const newMessage = payload.new;
                    if (newMessage) {
                        const { data: senderData, error: senderError } = await supabase
                            .from('users')
                            .select('name')
                            .eq('auth_user_id', newMessage.sender_id)
                            .single();

                        const giftedNewMessage = {
                            _id: newMessage.id,
                            text: newMessage.content,
                            createdAt: new Date(newMessage.created_at),
                            user: {
                                _id: newMessage.sender_id,
                                name: senderData?.name || '알 수 없는 사용자',
                            },
                        };
                        setMessages(previousMessages =>
                            GiftedChat.append(previousMessages, [giftedNewMessage])
                        );
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId, fetchMessages]);

    const onSend = useCallback(async (newMessages = []) => {
        if (!user || !roomId) return;
        const text = newMessages[0].text;

        const { error } = await supabase
            .from('chat_messages')
            .insert({
                room_id: roomId,
                sender_id: user.id,
                content: text,
            });

        if (error) {
            Alert.alert('전송 실패', error.message);
            console.error('Send message error:', error);
        }
    }, [user, roomId]);


    if (!user || !profile) {
        return (
            <View style={styles.centered}>
                <Text>사용자 정보를 불러오는 중이거나 로그인이 필요합니다.</Text>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <GiftedChat
                messages={messages}
                onSend={newMessages => onSend(newMessages)}
                user={{
                    _id: user.id, // 현재 로그인한 사용자 ID
                    name: profile.name || user.email, // 현재 로그인한 사용자 이름
                }}
                isLoadingEarlier={isLoading} // 이전 메시지 로딩 상태 (페이징 시 사용)
                placeholder="메시지를 입력하세요..."
                renderUsernameOnMessage // 메시지 옆에 이름 표시
                // 기타 GiftedChat 옵션들...
            />
            {Platform.OS === 'android' && <KeyboardAvoidingView behavior="padding" />}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default ChatMessageScreen;
