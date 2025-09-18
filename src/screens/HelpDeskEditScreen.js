// src/screens/HelpDeskEditScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export default function HelpDeskEditScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { questionId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 폼 상태
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [caseSummary, setCaseSummary] = useState('');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [conversationReason, setConversationReason] = useState('');
  const [opponentAccount, setOpponentAccount] = useState('');
  const [opponentPhone, setOpponentPhone] = useState('');
  const [opponentSns, setOpponentSns] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('help_questions')
        .select('*')
        .eq('id', questionId)
        .single();

      if (error) {
        console.error(error);
        Alert.alert('오류', '문의를 불러오지 못했습니다.', [
          { text: '확인', onPress: () => navigation.goBack() },
        ]);
      } else if (data && mounted) {
        const uid = user?.id || user?.uid;
        if (data.user_id !== uid) {
          Alert.alert('권한 없음', '내가 작성한 문의만 수정할 수 있습니다.', [
            { text: '확인', onPress: () => navigation.goBack() },
          ]);
        } else if (data.is_answered) {
          Alert.alert('수정 불가', '답변 완료된 문의는 수정할 수 없습니다.', [
            { text: '확인', onPress: () => navigation.goBack() },
          ]);
        } else {
          setTitle(data.title ?? '');
          setContent(data.content ?? '');
          setCaseSummary(data.case_summary ?? '');
          setUserName(data.user_name ?? '');
          setUserPhone(data.user_phone ?? '');
          setConversationReason(data.conversation_reason ?? '');
          setOpponentAccount(data.opponent_account ?? '');
          setOpponentPhone(data.opponent_phone ?? '');
          setOpponentSns(data.opponent_sns ?? '');
        }
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [questionId, user, navigation]);

  const onSave = async () => {
    if (!title.trim() && !caseSummary.trim() && !content.trim()) {
      Alert.alert('입력 필요', '제목/사건 개요/본문 중 하나는 입력해주세요.');
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      content: content.trim(),
      case_summary: caseSummary.trim(),
      user_name: userName.trim(),
      user_phone: userPhone.trim(),
      conversation_reason: conversationReason.trim(),
      opponent_account: opponentAccount.trim(),
      opponent_phone: opponentPhone.trim(),
      opponent_sns: opponentSns.trim(),
    };
    Object.keys(payload).forEach(k => {
      if (payload[k] === '') delete payload[k];
    });

    const { error } = await supabase
      .from('help_questions')
      .update(payload)
      .eq('id', questionId)
      .eq('user_id', user?.id || user?.uid) // 클라단 방어(UX); 서버는 RLS로 보안
      .select('id')
      .single();

    setSaving(false);

    if (error) {
      console.error(error);
      Alert.alert(
        '오류',
        error.code === '42501'
          ? '수정 권한이 없습니다. (답변 완료이거나 소유자가 아닙니다)'
          : '수정 중 오류가 발생했습니다.',
      );
      return;
    }

    Alert.alert('완료', '수정되었습니다.', [
      { text: '확인', onPress: () => navigation.goBack() },
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#3d5afe" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f8f9fa' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>문의 수정</Text>

        <Field label="제목">
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="제목"
            maxLength={120}
          />
        </Field>

        <Field label="사건 개요">
          <TextInput
            style={[styles.input, styles.multiline]}
            value={caseSummary}
            onChangeText={setCaseSummary}
            placeholder="사건 개요"
            multiline
          />
        </Field>

        <Field label="본문">
          <TextInput
            style={[styles.input, styles.multiline]}
            value={content}
            onChangeText={setContent}
            placeholder="상세 내용"
            multiline
          />
        </Field>

        <Field label="이름">
          <TextInput
            style={styles.input}
            value={userName}
            onChangeText={setUserName}
            placeholder="이름"
            autoCapitalize="none"
          />
        </Field>

        <Field label="연락처">
          <TextInput
            style={styles.input}
            value={userPhone}
            onChangeText={setUserPhone}
            placeholder="010-1234-5678"
            keyboardType="phone-pad"
          />
        </Field>

        <Field label="대화 계기">
          <TextInput
            style={styles.input}
            value={conversationReason}
            onChangeText={setConversationReason}
            placeholder="예: 중고거래, 투자 권유 등"
          />
        </Field>

        <Field label="상대방 계좌">
          <TextInput
            style={styles.input}
            value={opponentAccount}
            onChangeText={setOpponentAccount}
            placeholder="은행/계좌번호"
          />
        </Field>

        <Field label="상대방 연락처">
          <TextInput
            style={styles.input}
            value={opponentPhone}
            onChangeText={setOpponentPhone}
            placeholder="상대방 전화번호"
            keyboardType="phone-pad"
          />
        </Field>

        <Field label="상대방 SNS">
          <TextInput
            style={styles.input}
            value={opponentSns}
            onChangeText={setOpponentSns}
            placeholder="상대방 SNS 계정"
            autoCapitalize="none"
          />
        </Field>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={onSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>저장</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#343a40',
    marginBottom: 16,
  },
  label: { fontSize: 13, color: '#868e96', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#212529',
  },
  multiline: { height: 120, textAlignVertical: 'top' },
  saveBtn: {
    marginTop: 8,
    backgroundColor: '#3d5afe',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
