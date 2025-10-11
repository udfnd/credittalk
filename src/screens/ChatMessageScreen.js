// src/screens/ChatMessageScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Text, // Text 임포트 추가
} from 'react-native';
import { GiftedChat, InputToolbar } from 'react-native-gifted-chat'; // InputToolbar 임포트 추가
import { supabase } from '../lib/supabaseClient'; //
import { useAuth } from '../context/AuthContext'; //
import { useNavigation, useRoute } from '@react-navigation/native';
import { ensureSafeContent } from '../lib/contentSafety';

function ChatMessageScreen() {
  const { user, profile } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const roomId = route.params?.roomId;
  const roomName = route.params?.roomName;

  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState(''); // 현재 입력 중인 텍스트 상태 추가

  useEffect(() => {
    navigation.setOptions({ title: roomName || '채팅' });
  }, [navigation, roomName]);

  const fetchMessages = useCallback(async () => {
    if (!roomId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const { data, error } = await supabase
      .from('chat_messages_with_sender_profile') // 뷰 사용
      .select(
        `
                id,
                content,
                created_at,
                sender_id, 
                sender_name
            `,
      )
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('오류', '메시지를 불러오는데 실패했습니다.');
      console.error('Fetch messages error:', error);
      setMessages([]);
    } else {
      const giftedChatMessages =
        data?.map(msg => ({
          _id: msg.id.toString(),
          text: msg.content,
          createdAt: new Date(msg.created_at),
          user: {
            _id: msg.sender_id,
            name: msg.sender_name || '알 수 없는 사용자',
          },
        })) || [];
      setMessages(giftedChatMessages);
    }
    setIsLoading(false);
  }, [roomId]);

  useEffect(() => {
    if (roomId) {
      // roomId가 있을 때만 fetchMessages 및 구독 실행
      fetchMessages();

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
          async payload => {
            console.log('New message received via realtime!', payload);
            const newMessageData = payload.new;
            if (newMessageData && newMessageData.sender_id !== user?.id) {
              // 내가 보낸 메시지는 onSend에서 처리
              const { data: senderProfile, error: profileError } =
                await supabase
                  .from('users')
                  .select('name')
                  .eq('auth_user_id', newMessageData.sender_id)
                  .single();

              if (profileError) {
                console.error(
                  'Error fetching sender profile for new message:',
                  profileError,
                );
              }

              const giftedNewMessage = {
                _id: newMessageData.id.toString(),
                text: newMessageData.content,
                createdAt: new Date(newMessageData.created_at),
                user: {
                  _id: newMessageData.sender_id,
                  name: senderProfile?.nickname || '알 수 없는 사용자',
                },
              };
              setMessages(previousMessages =>
                GiftedChat.append(previousMessages, [giftedNewMessage]),
              );
            }
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [roomId, fetchMessages, user?.id]); // user.id를 의존성 배열에 추가

  const onSend = useCallback(
    async (newMessages = []) => {
      if (!user || !profile || !roomId) return; // profile도 확인

      const messageToSend = newMessages[0];

      let safeText;
      try {
        ({ message: safeText } = ensureSafeContent([
          { key: 'message', label: '메시지', value: messageToSend.text, allowEmpty: false },
        ]));
      } catch (error) {
        Alert.alert('전송 불가', error.message);
        return;
      }

      const sanitizedMessage = { ...messageToSend, text: safeText };

      setText(''); // 입력창 비우기

      setMessages(previousMessages =>
        GiftedChat.append(previousMessages, [sanitizedMessage]),
      );

      const { error } = await supabase.from('chat_messages').insert({
        room_id: roomId,
        sender_id: user.id,
        content: safeText,
      });

      if (error) {
        Alert.alert('전송 실패', error.message);
        console.error('Send message error:', error);
        setMessages(previousMessages =>
          previousMessages.filter(msg => msg._id !== sanitizedMessage._id),
        );
      }
    },
    [user, profile, roomId],
  ); // profile을 의존성 배열에 추가

  const renderInputToolbar = props => (
    <InputToolbar
      {...props}
      containerStyle={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#b2b2b2',
        backgroundColor: 'white',
      }}
      primaryStyle={{ alignItems: 'center' }}
    />
  );

  if (!user || !profile) {
    return (
      <View style={styles.centered}>
        <Text>사용자 정보를 불러오는 중이거나 로그인이 필요합니다.</Text>
      </View>
    );
  }

  if (!roomId) {
    return (
      <View style={styles.centered}>
        <Text>채팅방 정보를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GiftedChat
        messages={messages}
        onSend={newMessages => onSend(newMessages)}
        user={{
          // GiftedChat에 현재 사용자 정보 전달
          _id: user.id,
          name: profile.name || user.email || '나',
        }}
        text={text} // 현재 입력창의 텍스트 상태 연결
        onInputTextChanged={setText} // 입력창 텍스트 변경 시 상태 업데이트
        isLoadingEarlier={isLoading}
        placeholder="메시지를 입력하세요..."
        renderUsernameOnMessage
        renderInputToolbar={renderInputToolbar} // 키보드 자동 올림 동작 개선 시도 (필요시)
        bottomOffset={Platform.OS === 'ios' ? 30 : 0} // iOS 특정 하단 여백 (노치 등 고려)
        messagesContainerStyle={{
          paddingBottom: Platform.OS === 'ios' ? 20 : 0,
        }} // 메시지 목록 하단 여백
      />
      {Platform.OS === 'android' && (
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={Platform.select({ ios: 0, android: 50 })}
          enabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default ChatMessageScreen;
