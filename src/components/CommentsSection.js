// src/components/CommentsSection.js

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { AvoidSoftInputView } from 'react-native-avoid-softinput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// --- 수정/대댓글 공용 입력 컴포넌트 ---
const CommentInput = ({
  initialContent = '',
  placeholder,
  onCancel,
  onSubmit,
  loading = false,
  isEdit = false,
}) => {
  const [text, setText] = useState(initialContent);
  const disabled = loading;

  return (
    <AvoidSoftInputView avoidOffset={8}>
      <View
        style={isEdit ? styles.editInputContainer : styles.replyInputContainer}>
        <TextInput
          style={[styles.replyInput, disabled && { opacity: 0.6 }]}
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          editable={!disabled}
        />
        <View style={styles.replyButtonContainer}>
          <TouchableOpacity
            style={[
              styles.replyActionButton,
              styles.saveButton,
              disabled && { opacity: 0.6 },
            ]}
            onPressIn={() => onSubmit(text)}
            disabled={disabled}
            delayPressIn={0}>
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.replyActionButtonText}>
                {isEdit ? '저장' : '등록'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.replyActionButton,
              styles.cancelButton,
              disabled && { opacity: 0.6 },
            ]}
            onPress={onCancel}
            disabled={disabled}>
            <Text style={styles.replyActionButtonText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AvoidSoftInputView>
  );
};

// --- 개별 댓글 아이템 컴포넌트 ---
const CommentItem = ({
  comment,
  profile,
  // 함수 Props
  onReplyPress,
  onDelete,
  onEditSubmit,
  onReplySubmit,
  // 상태 Props
  editingComment,
  setEditingComment,
  replyingToId,
  submittingReplyId,
}) => {
  const isAuthor = profile && comment.user_id === profile.id;
  const isEditingThis = editingComment?.id === comment.id;
  const isReplyingToThis = replyingToId === comment.id;

  const handleEdit = async newContent => {
    // onEditSubmit은 비동기일 수 있으므로 await
    await onEditSubmit(comment.id, newContent);
    setEditingComment(null); // 수정 완료 후 상태 초기화
  };

  return (
    <View style={styles.commentWrapper}>
      <View style={styles.commentContainer}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>
            {comment.users?.nickname || '탈퇴한 사용자'}
          </Text>
          {isAuthor &&
            !isEditingThis && ( // 수정 중일 때는 아이콘 숨김
              <View style={styles.authorActions}>
                <TouchableOpacity
                  onPress={() => setEditingComment(comment)}
                  style={{ marginRight: 10 }}>
                  <Icon name="pencil" size={16} color="#888" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(comment.id)}>
                  <Icon name="delete-outline" size={16} color="#888" />
                </TouchableOpacity>
              </View>
            )}
        </View>

        {isEditingThis ? (
          <CommentInput
            initialContent={editingComment.content}
            placeholder="댓글 수정..."
            onCancel={() => setEditingComment(null)}
            onSubmit={handleEdit}
            loading={submittingReplyId === comment.id} // 로딩 상태 재활용
            isEdit
          />
        ) : (
          <Text style={styles.commentContent}>{comment.content}</Text>
        )}

        <View style={styles.commentFooter}>
          <Text style={styles.commentDate}>
            {formatDistanceToNow(parseISO(comment.created_at), {
              addSuffix: true,
              locale: ko,
            })}
          </Text>
          <TouchableOpacity onPress={() => onReplyPress(comment.id)}>
            <Text style={styles.replyButtonText}>답글 달기</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isReplyingToThis && (
        <CommentInput
          placeholder={`@${comment.users?.nickname || '...'}님에게 답글`}
          onCancel={() => onReplyPress(null)}
          onSubmit={replyText => onReplySubmit(replyText, comment.id)}
          loading={submittingReplyId === comment.id}
        />
      )}

      {comment.replies && comment.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {comment.replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              profile={profile}
              onReplyPress={onReplyPress}
              onDelete={onDelete}
              onEditSubmit={onEditSubmit}
              editingComment={editingComment}
              setEditingComment={setEditingComment}
              replyingToId={replyingToId}
              submittingReplyId={submittingReplyId}
              onReplySubmit={onReplySubmit}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// --- 메인 컴포넌트 ---
const CommentsSection = ({ postId, boardType }) => {
  const { user, profile } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);

  // 수정/답글 상태
  const [replyingToId, setReplyingToId] = useState(null);
  const [editingComment, setEditingComment] = useState(null); // 수정 중인 댓글 객체

  // 중복 제출 방지
  const [submittingRoot, setSubmittingRoot] = useState(false);
  const [submittingReplyId, setSubmittingReplyId] = useState(null);
  const guardingRef = useRef(false);

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*, users(id, nickname)') // users 테이블의 id도 가져옵니다.
        .eq('post_id', postId)
        .eq('board_type', boardType)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const byId = {};
      const roots = [];

      (data || []).forEach(c => {
        c.replies = [];
        byId[c.id] = c;
      });
      (data || []).forEach(c => {
        if (c.parent_comment_id && byId[c.parent_comment_id]) {
          byId[c.parent_comment_id].replies.push(c);
        } else {
          roots.push(c);
        }
      });
      setComments(roots);
    } catch (error) {
      console.error('Error fetching comments:', error.message);
      Alert.alert('오류', '댓글을 불러오는 데 실패했습니다.');
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
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          // 실시간 업데이트 시 수정/답글 상태가 풀리지 않도록 방지
          if (!editingComment && !replyingToId) {
            fetchComments();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, boardType, fetchComments, editingComment, replyingToId]);

  const handleAddComment = async (content, parentId = null) => {
    if (!user) {
      return Alert.alert(
        '로그인 필요',
        '댓글을 작성하려면 로그인이 필요합니다.',
      );
    }
    const trimmed = (content || '').trim();
    if (!trimmed) return;
    if (submittingRoot || submittingReplyId !== null || guardingRef.current)
      return;
    guardingRef.current = true;
    if (parentId) setSubmittingReplyId(parentId);
    else setSubmittingRoot(true);

    try {
      const { error } = await supabase.rpc('add_comment', {
        _post_id: postId,
        _board_type: boardType,
        _content: trimmed,
        _parent_comment_id: parentId,
      });

      if (error) throw error;

      if (parentId) setReplyingToId(null);
      else setNewComment('');

      await fetchComments(); // RPC 호출 후 즉시 UI 업데이트
    } catch (error) {
      Alert.alert('오류', '댓글 등록에 실패했습니다: ' + error.message);
    } finally {
      if (parentId) setSubmittingReplyId(null);
      else setSubmittingRoot(false);
      guardingRef.current = false;
    }
  };

  const handleUpdateComment = async (commentId, newContent) => {
    const trimmed = (newContent || '').trim();
    if (!trimmed) return;

    setSubmittingReplyId(commentId); // 로딩 인디케이터를 위해 ID를 공유

    const { error } = await supabase.rpc('update_comment', {
      p_comment_id: commentId,
      p_new_content: trimmed,
    });

    setSubmittingReplyId(null);
    if (error) {
      Alert.alert('오류', '댓글 수정에 실패했습니다: ' + error.message);
    } else {
      await fetchComments(); // 수정 성공 시 목록 새로고침
    }
  };

  const handleDeleteComment = commentId => {
    Alert.alert(
      '댓글 삭제',
      '정말로 이 댓글을 삭제하시겠습니까? 대댓글도 모두 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('delete_comment', {
              p_comment_id: commentId,
            });
            if (error) {
              Alert.alert('오류', '댓글 삭제에 실패했습니다: ' + error.message);
            } else {
              await fetchComments(); // 삭제 성공 시 목록 새로고침
            }
          },
        },
      ],
    );
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
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <CommentItem
              comment={item}
              profile={profile}
              onReplyPress={setReplyingToId}
              onDelete={handleDeleteComment}
              onEditSubmit={handleUpdateComment}
              editingComment={editingComment}
              setEditingComment={setEditingComment}
              replyingToId={replyingToId}
              submittingReplyId={submittingReplyId}
              onReplySubmit={handleAddComment}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.noCommentsText}>
              가장 먼저 댓글을 남겨보세요.
            </Text>
          }
          keyboardShouldPersistTaps="always"
          scrollEnabled={false} // 👈 이 부분이 핵심입니다.
        />
      )}

      {user ? (
        <AvoidSoftInputView
          avoidOffset={insets.bottom}
          style={styles.footerAvoidWrapper}>
          <View style={styles.footerInputBar} collapsable={false}>
            <TextInput
              style={[styles.input, submittingRoot && { opacity: 0.6 }]}
              placeholder="따뜻한 댓글을 남겨주세요."
              placeholderTextColor="#999"
              value={newComment}
              onChangeText={setNewComment}
              multiline
              editable={!submittingRoot}
            />
            <TouchableOpacity
              style={[styles.submitButton, submittingRoot && { opacity: 0.7 }]}
              onPressIn={() => handleAddComment(newComment)}
              disabled={submittingRoot}
              delayPressIn={0}>
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
          <Text style={styles.loginPromptText}>
            댓글을 작성하려면 로그인이 필요합니다.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.loginButtonText}>로그인하기</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
  commentContainer: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  commentAuthor: { fontWeight: 'bold', fontSize: 15, color: '#444' },
  authorActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentContent: { fontSize: 14, lineHeight: 21, color: '#555' },
  commentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  commentDate: { fontSize: 12, color: '#999' },
  replyButtonText: { fontSize: 12, color: '#3d5afe', fontWeight: 'bold' },
  repliesContainer: {
    marginLeft: 20,
    borderLeftWidth: 2,
    borderLeftColor: '#e9ecef',
    paddingLeft: 10,
  },
  replyInputContainer: {
    marginVertical: 10,
    marginLeft: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
  },
  editInputContainer: {
    marginVertical: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
  },
  replyInput: {
    padding: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    color: '#333',
  },
  replyButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  replyActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  saveButton: {
    backgroundColor: '#3d5afe',
  },
  cancelButton: { backgroundColor: '#868e96', marginLeft: 10 },
  replyActionButtonText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  noCommentsText: {
    textAlign: 'center',
    color: '#aaa',
    marginVertical: 25,
    fontSize: 14,
  },
  footerAvoidWrapper: {},
  footerInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    backgroundColor: '#fff',
    zIndex: 10,
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
  submitButton: {
    backgroundColor: '#3d5afe',
    padding: 10,
    borderRadius: 20,
    marginLeft: 8,
  },
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
