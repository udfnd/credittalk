import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';

// 대댓글 입력을 위한 별도 컴포넌트
const ReplyInput = ({ onAddReply, onCancel }) => {
  const [replyText, setReplyText] = useState("");
  return (
    <View style={styles.replyInputContainer}>
      <TextInput
        style={styles.replyInput}
        placeholder="대댓글을 입력하세요..."
        value={replyText}
        onChangeText={setReplyText}
        multiline
        autoFocus
      />
      <View style={styles.replyButtonContainer}>
        <TouchableOpacity style={styles.replyActionButton} onPress={() => onAddReply(replyText)}>
          <Text style={styles.replyActionButtonText}>등록</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.replyActionButton, styles.cancelButton]} onPress={onCancel}>
          <Text style={styles.replyActionButtonText}>취소</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// 개별 댓글 아이템
// [수정됨] isReply prop을 추가하여 대댓글 여부를 전달받습니다.
const CommentItem = ({ comment, currentProfileId, onReplyPress, replyingToId, onReplySubmit, isReply = false }) => {
  const handleDelete = async () => {
    Alert.alert(
      "댓글 삭제", "정말로 이 댓글을 삭제하시겠습니까? 대댓글도 모두 삭제됩니다.",
      [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: async () => {
            const { error } = await supabase.from('comments').delete().eq('id', comment.id);
            if (error) Alert.alert("오류", "댓글 삭제에 실패했습니다: " + error.message);
          }},
      ]
    );
  };

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
          {/* [수정됨] isReply가 false일 때(즉, 원댓글일 때)만 '답글 달기' 버튼을 보여줍니다. */}
          {!isReply && (
            <TouchableOpacity onPress={() => onReplyPress(comment.id)}>
              <Text style={styles.replyButtonText}>답글 달기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 대댓글 입력 폼 */}
      {replyingToId === comment.id && (
        <ReplyInput
          onAddReply={(replyText) => onReplySubmit(replyText, comment.id)}
          onCancel={() => onReplyPress(null)}
        />
      )}

      {/* 대댓글 목록 렌더링 */}
      {comment.replies && comment.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {comment.replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentProfileId={currentProfileId}
              onReplyPress={onReplyPress}
              replyingToId={replyingToId}
              onReplySubmit={onReplySubmit}
              isReply={true} // [수정됨] 재귀적으로 호출되는 대댓글에는 isReply를 true로 전달합니다.
            />
          ))}
        </View>
      )}
    </View>
  );
};

// 댓글 섹션 전체
const CommentsSection = ({ postId, boardType }) => {
  const { user, profile } = useAuth();
  const navigation = useNavigation();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [replyingToId, setReplyingToId] = useState(null);

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*, users(nickname)')
        .eq('post_id', postId)
        .eq('board_type', boardType)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const commentsById = {};
      const topLevelComments = [];

      (data || []).forEach(comment => {
        comment.replies = [];
        commentsById[comment.id] = comment;
      });

      (data || []).forEach(comment => {
        if (comment.parent_comment_id && commentsById[comment.parent_comment_id]) {
          commentsById[comment.parent_comment_id].replies.push(comment);
        } else {
          topLevelComments.push(comment);
        }
      });

      setComments(topLevelComments);
    } catch (error) {
      console.error("Error fetching comments:", error.message);
      Alert.alert("오류", "댓글을 불러오는 데 실패했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  }, [postId, boardType]);

  useEffect(() => {
    if (!postId || !boardType) return;
    fetchComments();

    const channel = supabase.channel(`comments-for-${boardType}-${postId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}`},
        () => fetchComments()
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [postId, boardType, fetchComments]);

  const handleAddComment = async (content, parentId = null) => {
    if (!user || !profile?.id) {
      Alert.alert("로그인 필요", "댓글을 작성하려면 로그인이 필요합니다.");
      return;
    }
    if (!content.trim()) return;

    Keyboard.dismiss();
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      board_type: boardType,
      user_id: profile.id,
      content: content.trim(),
      parent_comment_id: parentId,
    });

    if (error) {
      Alert.alert("오류", "댓글 등록에 실패했습니다: " + error.message);
    } else {
      if (parentId) {
        setReplyingToId(null);
      } else {
        setNewComment("");
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>댓글 ({comments.length})</Text>
      {loading ? <ActivityIndicator style={{ marginVertical: 20 }} color="#3d5afe" />
        : (
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <CommentItem
                comment={item}
                currentProfileId={profile?.id}
                onReplyPress={setReplyingToId}
                replyingToId={replyingToId}
                onReplySubmit={handleAddComment}
                // 최상위 댓글이므로 isReply prop을 전달하지 않거나 false로 전달 (기본값이 false)
              />
            )}
            ListEmptyComponent={<Text style={styles.noCommentsText}>가장 먼저 댓글을 남겨보세요.</Text>}
            scrollEnabled={false}
          />
        )}
      {user ? (
        <View style={styles.inputContainer}>
          <TextInput style={styles.input} placeholder="따뜻한 댓글을 남겨주세요." value={newComment} onChangeText={setNewComment} multiline/>
          <TouchableOpacity style={styles.submitButton} onPress={() => handleAddComment(newComment)}>
            <Icon name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
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
  container: { padding: 15, marginTop: 10, backgroundColor: '#fff', borderTopWidth: 8, borderTopColor: '#f8f9fa' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#f8f9fa', borderRadius: 25, paddingLeft: 5 },
  input: { flex: 1, paddingVertical: 10, paddingHorizontal: 15, fontSize: 15, color: '#333' },
  submitButton: { backgroundColor: '#3d5afe', padding: 10, borderRadius: 20, margin: 4 },

  commentWrapper: {},
  commentContainer: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  commentAuthor: { fontWeight: 'bold', fontSize: 15, color: '#444' },
  commentContent: { fontSize: 14, lineHeight: 21, color: '#555' },
  commentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  commentDate: { fontSize: 12, color: '#999' },
  replyButtonText: { fontSize: 12, color: '#3d5afe', fontWeight: 'bold' },

  deleteButton: { padding: 5 },
  noCommentsText: { textAlign: 'center', color: '#aaa', marginVertical: 25, fontSize: 14 },

  repliesContainer: { marginLeft: 20, borderLeftWidth: 2, borderLeftColor: '#e9ecef', paddingLeft: 10 },

  replyInputContainer: { marginVertical: 10, marginLeft: 20, backgroundColor: '#f8f9fa', borderRadius: 8, padding: 10 },
  replyInput: { padding: 10, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  replyButtonContainer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  replyActionButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: '#3d5afe' },
  cancelButton: { backgroundColor: '#868e96', marginLeft: 10 },
  replyActionButtonText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

  loginPrompt: { justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f8f9fa', borderRadius: 8, marginTop: 10 },
  loginPromptText: { fontSize: 14, color: '#555', marginBottom: 10 },
  loginButtonText: { fontSize: 15, color: '#3d5afe', fontWeight: 'bold' },
});

export default CommentsSection;
