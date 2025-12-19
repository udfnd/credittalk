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
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { AvoidSoftInputView } from 'react-native-avoid-softinput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReportModal from './ReportModal';
import { ensureSafeContent } from '../lib/contentSafety';

/**
 * 공용 입력 컴포넌트
 * - depth를 받아서 depth>0(대댓글 이상)일 때는 추가 들여쓰기를 하지 않는 스타일로 렌더링
 */
const CommentInput = ({
  initialContent = '',
  placeholder,
  onCancel,
  onSubmit,
  loading = false,
  isEdit = false,
  depth = 0, // ✅ 추가: 현재 깊이
}) => {
  const [text, setText] = useState(initialContent);
  const disabled = loading;

  return (
    <AvoidSoftInputView avoidOffset={8}>
      <View
        style={
          isEdit
            ? styles.editInputContainer
            : depth > 0
              ? styles.replyInputContainerFlat // ✅ 대댓글 이상: 추가 들여쓰기 없음
              : styles.replyInputContainer // ✅ 루트에 달리는 답글 입력창만 1회 들여쓰기
        }>
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

/**
 * 개별 댓글 아이템
 * - depth를 재귀적으로 전달하여 첫 레벨(depth===0)에만 좌측 라인/패딩을 적용
 * - 두 번째 레벨 이상(depth>=1)에는 추가 들여쓰기 없음
 */
const CommentItem = ({
  comment,
  profile,
  // 함수 Props
  onReplyPress,
  onShowOptions,
  onEditSubmit,
  onReplySubmit,
  // 상태 Props
  editingComment,
  setEditingComment,
  replyingToId,
  submittingReplyId,
  depth = 0, // ✅ 추가: 현재 댓글의 깊이
}) => {
  const isEditingThis = editingComment?.id === comment.id;
  const isReplyingToThis = replyingToId === comment.id;

  const handleEdit = async newContent => {
    await onEditSubmit(comment.id, newContent);
    setEditingComment(null);
  };

  return (
    <View style={styles.commentWrapper}>
      <View style={styles.commentContainer}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>
            {comment.users?.nickname || '탈퇴한 사용자'}
          </Text>
          <TouchableOpacity
            style={styles.optionsButton}
            onPress={() => onShowOptions(comment)}>
            <Icon name="dots-vertical" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        {isEditingThis ? (
          <CommentInput
            initialContent={editingComment.content}
            placeholder="댓글 수정..."
            onCancel={() => setEditingComment(null)}
            onSubmit={handleEdit}
            loading={submittingReplyId === comment.id}
            isEdit
            depth={depth}
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

      {/* ✅ 답글 입력창: 루트(depth=0)일 때만 들여쓰기 컨테이너, 그 이상은 평평 */}
      {isReplyingToThis && (
        <CommentInput
          placeholder={`@${comment.users?.nickname || '...'}님에게 답글`}
          onCancel={() => onReplyPress(null)}
          onSubmit={replyText => onReplySubmit(replyText, comment.id)}
          loading={submittingReplyId === comment.id}
          depth={depth} // 루트에서만 들여쓰기 1회, 그 이상은 flat
        />
      )}

      {/* ✅ 자식 댓글 컨테이너: 첫 레벨(depth===0)에만 들여쓰기/좌측 라인 */}
      {comment.replies && comment.replies.length > 0 && (
        <View
          style={
            depth === 0
              ? styles.repliesContainerIndented // 첫 레벨만 들여쓰기
              : styles.repliesContainerFlat // 그 아래는 들여쓰기 없음
          }>
          {comment.replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              profile={profile}
              onReplyPress={onReplyPress}
              onShowOptions={onShowOptions}
              onEditSubmit={onEditSubmit}
              editingComment={editingComment}
              setEditingComment={setEditingComment}
              replyingToId={replyingToId}
              submittingReplyId={submittingReplyId}
              onReplySubmit={onReplySubmit}
              depth={depth + 1} // 재귀적으로 뎁스 증가
            />
          ))}
        </View>
      )}
    </View>
  );
};

/**
 * 메인 섹션
 */
const CommentsSection = ({ postId, boardType }) => {
  const { user, profile } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);

  // 수정/답글/신고 상태
  const [replyingToId, setReplyingToId] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const [selectedComment, setSelectedComment] = useState(null);

  // 중복 제출 방지
  const [submittingRoot, setSubmittingRoot] = useState(false);
  const [submittingReplyId, setSubmittingReplyId] = useState(null);
  const guardingRef = useRef(false);

  // 댓글 불러오기
  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*, users(id, nickname, auth_user_id)')
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

  // 실시간 구독
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

  // 댓글 추가
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
      const { comment: safeContent } = ensureSafeContent([
        { key: 'comment', label: '댓글', value: trimmed, allowEmpty: false },
      ]);
      const { error } = await supabase.rpc('add_comment', {
        _post_id: postId,
        _board_type: boardType,
        _content: safeContent,
        _parent_comment_id: parentId,
      });

      if (error) throw error;

      if (parentId) setReplyingToId(null);
      else setNewComment('');

      await fetchComments();
    } catch (error) {
      Alert.alert('오류', '댓글 등록에 실패했습니다: ' + error.message);
    } finally {
      if (parentId) setSubmittingReplyId(null);
      else setSubmittingRoot(false);
      guardingRef.current = false;
    }
  };

  // 댓글 수정
  const handleUpdateComment = async (commentId, newContent) => {
    const trimmed = (newContent || '').trim();
    if (!trimmed) return;

    setSubmittingReplyId(commentId);

    let safeContent;
    try {
      ({ comment: safeContent } = ensureSafeContent([
        { key: 'comment', label: '댓글', value: trimmed, allowEmpty: false },
      ]));
    } catch (error) {
      setSubmittingReplyId(null);
      Alert.alert('수정 불가', error.message);
      return;
    }

    const { error } = await supabase.rpc('update_comment', {
      p_comment_id: commentId,
      p_new_content: safeContent,
    });

    setSubmittingReplyId(null);
    if (error) {
      Alert.alert('오류', '댓글 수정에 실패했습니다: ' + error.message);
    } else {
      await fetchComments();
    }
  };

  // 댓글 삭제
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
              await fetchComments();
            }
          },
        },
      ],
    );
  };

  // 사용자 차단
  const handleBlockUser = async (authorId, authorNickname) => {
    if (!user) return;
    Alert.alert(
      '사용자 차단',
      `'${authorNickname || '익명'}'님을 차단하시겠습니까?\n차단한 사용자의 게시물과 댓글은 더 이상 보이지 않습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '차단',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('blocked_users').insert({
                user_id: user.id,
                blocked_user_id: authorId,
              });
              if (error && error.code !== '23505') throw error; // 중복(이미 차단) 에러는 무시
              Alert.alert(
                '차단 완료',
                '사용자가 성공적으로 차단되었습니다. 앱을 다시 시작하면 모든 콘텐츠가 숨겨집니다.',
              );
              fetchComments();
            } catch (err) {
              console.error('Block user error:', err);
              Alert.alert(
                '차단 실패',
                err.message || '사용자 차단 중 오류가 발생했습니다.',
              );
            }
          },
        },
      ],
    );
  };

  // 댓글 옵션(수정/삭제/신고/차단)
  const showCommentOptions = comment => {
    if (!user) {
      return Alert.alert('로그인 필요', '로그인이 필요한 기능입니다.');
    }

    const isAuthor = user.id === comment.users?.auth_user_id;

    if (Platform.OS === 'ios') {
      const options = ['취소'];
      const actions = {};

      if (isAuthor) {
        options.push('수정하기', '삭제하기');
        actions[1] = () => setEditingComment(comment);
        actions[2] = () => handleDeleteComment(comment.id);
      } else {
        options.push('댓글 신고하기', '이 사용자 차단하기');
        actions[1] = () => {
          setSelectedComment(comment);
          setReportModalVisible(true);
        };
        actions[2] = () =>
          handleBlockUser(comment.users.auth_user_id, comment.users.nickname);
      }

      const destructiveButtonIndex = isAuthor ? 2 : 2;

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex,
          title: '댓글 옵션',
        },
        buttonIndex => {
          if (actions[buttonIndex]) {
            actions[buttonIndex]();
          }
        },
      );
    } else {
      // Android: Alert 사용
      const buttons = [];

      if (isAuthor) {
        buttons.push(
          { text: '수정하기', onPress: () => setEditingComment(comment) },
          {
            text: '삭제하기',
            style: 'destructive',
            onPress: () => handleDeleteComment(comment.id),
          },
        );
      } else {
        buttons.push(
          {
            text: '댓글 신고하기',
            onPress: () => {
              setSelectedComment(comment);
              setReportModalVisible(true);
            },
          },
          {
            text: '이 사용자 차단하기',
            style: 'destructive',
            onPress: () =>
              handleBlockUser(
                comment.users.auth_user_id,
                comment.users.nickname,
              ),
          },
        );
      }

      buttons.push({ text: '취소', style: 'cancel' });

      Alert.alert('댓글 옵션', '', buttons);
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
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <CommentItem
              comment={item}
              profile={profile}
              onReplyPress={setReplyingToId}
              onShowOptions={showCommentOptions}
              onEditSubmit={handleUpdateComment}
              editingComment={editingComment}
              setEditingComment={setEditingComment}
              replyingToId={replyingToId}
              submittingReplyId={submittingReplyId}
              onReplySubmit={handleAddComment}
              depth={0} // ✅ 루트는 0
            />
          )}
          ListEmptyComponent={
            <Text style={styles.noCommentsText}>
              가장 먼저 댓글을 남겨보세요.
            </Text>
          }
          keyboardShouldPersistTaps="always"
          scrollEnabled={false}
        />
      )}

      {/* 작성 바 */}
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

      {/* 신고 모달 */}
      {selectedComment && (
        <ReportModal
          isVisible={isReportModalVisible}
          onClose={() => {
            setReportModalVisible(false);
            setSelectedComment(null);
          }}
          contentId={selectedComment.id}
          contentType="comment"
          authorId={selectedComment.users?.auth_user_id}
        />
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
  optionsButton: {
    padding: 5, // 터치 영역 확보
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

  /** ✅ 첫 레벨(대댓글 컨테이너)에만 적용할 들여쓰기/좌측 라인 */
  repliesContainerIndented: {
    marginLeft: 20,
    borderLeftWidth: 2,
    borderLeftColor: '#e9ecef',
    paddingLeft: 10,
  },
  /** ✅ 두 번째 레벨 이상에선 추가 들여쓰기 없음 */
  repliesContainerFlat: {
    marginLeft: 0,
    borderLeftWidth: 0,
    paddingLeft: 0,
  },

  /** 루트에 달리는 답글 입력창(한 번만 들여쓰기) */
  replyInputContainer: {
    marginVertical: 10,
    marginLeft: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
  },
  /** 대댓글 이상에서의 답글 입력창(추가 들여쓰기 없음) */
  replyInputContainerFlat: {
    marginVertical: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
  },
  /** 수정 입력창은 항상 본문 위치에 그대로 */
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
