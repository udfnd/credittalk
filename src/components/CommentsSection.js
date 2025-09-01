import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Alert, ActivityIndicator, Keyboard,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { AvoidSoftInputView } from 'react-native-avoid-softinput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ReplyInput = ({ onAddReply, onCancel, loading = false }) => {
  const [replyText, setReplyText] = useState('');
  const disabled = loading;

  return (
    <AvoidSoftInputView avoidOffset={8}>
      <View style={styles.replyInputContainer}>
        <TextInput
          style={[styles.replyInput, disabled && { opacity: 0.6 }]}
          placeholder="대댓글을 입력하세요..."
          placeholderTextColor="#999"
          value={replyText}
          onChangeText={setReplyText}
          multiline
          autoFocus
          editable={!disabled}
        />
        <View style={styles.replyButtonContainer}>
          <TouchableOpacity
            style={[styles.replyActionButton, disabled && { opacity: 0.6 }]}
            onPress={() => onAddReply(replyText)}
            disabled={disabled}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.replyActionButtonText}>등록</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.replyActionButton, styles.cancelButton, disabled && { opacity: 0.6 }]}
            onPress={onCancel}
            disabled={disabled}
          >
            <Text style={styles.replyActionButtonText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AvoidSoftInputView>
  );
};

const CommentItem = ({
                       comment,
                       currentProfileId,
                       onReplyPress,
                       replyingToId,
                       onReplySubmit,
                       submittingReplyId,
                       isReply = false,
                     }) => {
  const handleDelete = async () => {
    Alert.alert(
      '댓글 삭제',
      '정말로 이 댓글을 삭제하시겠습니까? 대댓글도 모두 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('comments').delete().eq('id', comment.id);
            if (error) Alert.alert('오류', '댓글 삭제에 실패했습니다: ' + error.message);
          },
        },
      ],
    );
  };

  const replyOpenForThis = replyingToId === comment.id;
  const isSubmittingThisReply = submittingReplyId === comment.id;

  return (
    <View style={styles.commentWrapper}>
      <View style={styles.commentContainer}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>{comment.users?.nickname || '탈퇴한 사용자'}</Text>
          {comment.user_id === currentProfileId && (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
              <Icon name="close" size={16} color="#888" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.commentContent}>{comment.content}</Text>
        <View style={styles.commentFooter}>
          <Text style={styles.commentDate}>
            {formatDistanceToNow(parseISO(comment.created_at), { addSuffix: true, locale: ko })}
          </Text>
          {!isReply && (
            <TouchableOpacity onPress={() => onReplyPress(comment.id)}>
              <Text style={styles.replyButtonText}>답글 달기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {replyOpenForThis && (
        <ReplyInput
          loading={isSubmittingThisReply}
          onAddReply={(replyText) => onReplySubmit(replyText, comment.id)}
          onCancel={() => onReplyPress(null)}
        />
      )}

      {comment.replies && comment.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentProfileId={currentProfileId}
              onReplyPress={onReplyPress}
              replyingToId={replyingToId}
              onReplySubmit={onReplySubmit}
              submittingReplyId={submittingReplyId}
              isReply
            />
          ))}
        </View>
      )}
    </View>
  );
};

const CommentsSection = ({ postId, boardType }) => {
  const { user, profile } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [replyingToId, setReplyingToId] = useState(null);

  // ✅ 중복 제출 방지용 로딩 플래그
  const [submittingRoot, setSubmittingRoot] = useState(false);
  const [submittingReplyId, setSubmittingReplyId] = useState(null);

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*, users(nickname)')
        .eq('post_id', postId)
        .eq('board_type', boardType)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const byId = {};
      const roots = [];

      (data || []).forEach((c) => {
        c.replies = [];
        byId[c.id] = c;
      });
      (data || []).forEach((c) => {
        if (c.parent_comment_id && byId[c.parent_comment_id]) {
          byId[c.parent_comment_id].replies.push(c);
        } else {
          roots.push(c);
        }
      });

      setComments(roots);
    } catch (error) {
      console.error('Error fetching comments:', error.message);
      Alert.alert('오류', '댓글을 불러오는 데 실패했습니다: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [postId, boardType]);

  useEffect(() => {
    if (!postId || !boardType) return;
    fetchComments();

    const channel = supabase
      .channel(`comments-for-${boardType}-${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
        () => fetchComments(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, boardType, fetchComments]);

  const handleAddComment = async (content, parentId = null) => {
    if (!user || !profile?.id) {
      Alert.alert('로그인 필요', '댓글을 작성하려면 로그인이 필요합니다.');
      return;
    }
    const trimmed = (content || '').trim();
    if (!trimmed) return;

    // ✅ 이미 제출 중이면 무시 (연타 방지)
    if (submittingRoot || submittingReplyId !== null) return;

    // 로딩 상태 설정
    if (parentId) setSubmittingReplyId(parentId);
    else setSubmittingRoot(true);

    Keyboard.dismiss();

    try {
      const { error } = await supabase.from('comments').insert({
        post_id: postId,
        board_type: boardType,
        user_id: profile.id, // BIGINT 주의: DB가 BIGINT이고 JS number여도 보통 안전, 다만 매우 큰 값이면 RPC 권장
        content: trimmed,
        parent_comment_id: parentId,
      });

      if (error) {
        Alert.alert('오류', '댓글 등록에 실패했습니다: ' + error.message);
        return;
      }

      // 입력 초기화
      if (parentId) setReplyingToId(null);
      else setNewComment('');

      // 즉시 갱신(실시간이 늦게 오더라도 UX 부드럽게)
      await fetchComments();
    } finally {
      // 로딩 해제
      if (parentId) setSubmittingReplyId(null);
      else setSubmittingRoot(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionTitleContainer}>
        <Text style={styles.sectionTitle}>댓글 ({comments.length})</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 20 }} color="#3d5afe" />
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <CommentItem
              comment={item}
              currentProfileId={profile?.id}
              onReplyPress={setReplyingToId}
              replyingToId={replyingToId}
              onReplySubmit={handleAddComment}
              submittingReplyId={submittingReplyId}
            />
          )}
          ListEmptyComponent={<Text style={styles.noCommentsText}>가장 먼저 댓글을 남겨보세요.</Text>}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={false}
          nestedScrollEnabled={false}
        />
      )}

      {user ? (
        <AvoidSoftInputView avoidOffset={insets.bottom} style={styles.footerAvoidWrapper}>
          <View style={styles.footerInputBar}>
            <TextInput
              style={[styles.input, submittingRoot && { opacity: 0.6 }]}
              placeholder="따뜻한 댓글을 남겨주세요."
              placeholderTextColor="#999"
              value={newComment}
              onChangeText={setNewComment}
              multiline
              blurOnSubmit={false}
              editable={!submittingRoot}
            />
            <TouchableOpacity
              style={[styles.submitButton, submittingRoot && { opacity: 0.7 }]}
              onPress={() => handleAddComment(newComment)}
              disabled={submittingRoot}
            >
              {submittingRoot ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Icon name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </AvoidSoftInputView>
      ) : (
        <View style={styles.loginPrompt}>
          <Text style={styles.loginPromptText}>댓글을 작성하려면 로그인이 필요합니다.</Text>
          <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.loginButtonText}>로그인하기</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // 섹션 컨테이너
  container: {
    padding: 15,
    marginTop: 10,
    marginBottom: 30,
    backgroundColor: '#fff',
    borderTopWidth: 8,
    borderTopColor: '#f8f9fa',
  },
  sectionTitleContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },

  commentWrapper: {},
  commentContainer: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  commentAuthor: { fontWeight: 'bold', fontSize: 15, color: '#444' },
  commentContent: { fontSize: 14, lineHeight: 21, color: '#555' },
  commentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  commentDate: { fontSize: 12, color: '#999' },
  replyButtonText: { fontSize: 12, color: '#3d5afe', fontWeight: 'bold' },
  deleteButton: { padding: 5 },
  repliesContainer: { marginLeft: 20, borderLeftWidth: 2, borderLeftColor: '#e9ecef', paddingLeft: 10 },

  // 대댓글 입력
  replyInputContainer: { marginVertical: 10, marginLeft: 20, backgroundColor: '#f8f9fa', borderRadius: 8, padding: 10 },
  replyInput: { padding: 10, fontSize: 14, minHeight: 60, textAlignVertical: 'top', color: '#333' },
  replyButtonContainer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  replyActionButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: '#3d5afe' },
  cancelButton: { backgroundColor: '#868e96', marginLeft: 10 },
  replyActionButtonText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

  // 빈 목록
  noCommentsText: { textAlign: 'center', color: '#aaa', marginVertical: 25, fontSize: 14 },

  // 입력창
  footerAvoidWrapper: {},
  footerInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    paddingVertical: 10,
    paddingHorizontal: 15,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#f8f9fa',
    borderRadius: 25,
    textAlignVertical: 'top',
  },
  submitButton: { backgroundColor: '#3d5afe', padding: 10, borderRadius: 20, marginLeft: 8 },

  // 로그인 유도
  loginPrompt: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginTop: 10,
  },
  loginPromptText: { fontSize: 14, color: '#555', marginBottom: 10 },
  loginButtonText: { fontSize: 15, color: '#3d5afe', fontWeight: 'bold' },
});

export default CommentsSection;
