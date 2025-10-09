import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// 댓글 항목 UI 컴포넌트
const CommentItem = ({ comment, currentUserId, onDelete }) => {
  const isMyComment = comment.user_id === currentUserId;
  const authorProfile = comment.users;
  const authorName = authorProfile?.is_admin
    ? '관리자'
    : authorProfile?.nickname || authorProfile?.name || '작성자';
  const isAdminComment = authorProfile?.is_admin;

  return (
    <View
      style={[
        styles.commentContainer,
        isMyComment ? styles.myComment : styles.otherComment,
      ]}>
      <View style={styles.commentHeader}>
        <Text
          style={[
            styles.commentAuthor,
            isAdminComment && styles.adminAuthor,
            isMyComment && { color: '#fff' },
          ]}>
          {authorName}
        </Text>
        {isMyComment && (
          <TouchableOpacity onPress={() => onDelete(comment.id)}>
            <Icon name="close-circle-outline" size={18} color="#e0e0e0" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.commentContent, isMyComment && { color: 'white' }]}>
        {comment.content}
      </Text>
      <Text
        style={[styles.commentTimestamp, isMyComment && { color: '#e0e0e0' }]}>
        {new Date(comment.created_at).toLocaleString()}
      </Text>
    </View>
  );
};

export default function HelpDeskDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { questionId } = route.params;
  const { user, profile } = useAuth();

  const [question, setQuestion] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 데이터 로딩 함수 (질문 + 댓글)
  const fetchData = useCallback(async () => {
    if (!questionId) return;

    setLoading(true);
    // 1. 질문 상세 정보 가져오기
    const { data: questionData, error: questionError } = await supabase
      .from('help_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (questionError) {
      console.error('Error fetching question:', questionError);
      Alert.alert('오류', '질문 정보를 불러오는 데 실패했습니다.');
      setLoading(false);
      return;
    }
    setQuestion(questionData);

    // 2. 댓글 목록 가져오기 (작성자 프로필 정보 포함)
    const { data: commentsData, error: commentsError } = await supabase
      .from('help_desk_comments')
      .select('*, users(nickname, name, is_admin)')
      .eq('question_id', questionId)
      .order('created_at', { ascending: true });

    if (commentsError) {
      console.error('Error fetching comments:', commentsError);
    } else {
      setComments(commentsData);
    }

    setLoading(false);
  }, [questionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 댓글 제출 함수
  const handleAddComment = async () => {
    if (!newComment.trim() || !user) return;

    setIsSubmitting(true);
    const { error } = await supabase.from('help_desk_comments').insert({
      question_id: questionId,
      content: newComment.trim(),
      user_id: user.id,
    });

    if (error) {
      console.error('Error posting comment:', error);
      Alert.alert('오류', '댓글을 작성하는 데 실패했습니다.');
    } else {
      setNewComment('');
      // 새 댓글 추가 후 데이터 다시 로드
      await fetchData();
    }
    setIsSubmitting(false);
  };

  // 댓글 삭제 함수
  const handleDeleteComment = async commentId => {
    Alert.alert('댓글 삭제', '이 댓글을 정말로 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        onPress: async () => {
          const { error } = await supabase
            .from('help_desk_comments')
            .delete()
            .eq('id', commentId);

          if (error) {
            Alert.alert('오류', '댓글 삭제에 실패했습니다.');
            console.error('Error deleting comment:', error);
          } else {
            setComments(prev => prev.filter(c => c.id !== commentId));
          }
        },
        style: 'destructive',
      },
    ]);
  };

  // 권한 확인 (관리자 또는 글 작성자인지)
  const canComment = profile?.is_admin || question?.user_id === user?.id;

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }

  if (!question) {
    return (
      <View style={styles.container}>
        <Text style={styles.centerText}>질문을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flexContainer}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.questionSection}>
          <Text style={styles.title}>{question.title}</Text>
          <Text style={styles.meta}>
            작성자: {question.user_name} |{' '}
            {new Date(question.created_at).toLocaleDateString()}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.content}>{question.content}</Text>
        </View>

        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>답변 및 문의</Text>
          {comments.length > 0 ? (
            comments.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                currentUserId={user?.id}
                onDelete={handleDeleteComment}
              />
            ))
          ) : (
            <Text style={styles.noCommentsText}>아직 답변이 없습니다.</Text>
          )}
        </View>
      </ScrollView>

      {/* 댓글 입력창 (권한이 있는 경우에만 표시) */}
      {canComment && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={newComment}
            onChangeText={setNewComment}
            placeholder="답변 또는 문의를 입력하세요..."
            multiline
            editable={!isSubmitting}
            placeholderTextColor="#888"
          />
          <TouchableOpacity
            style={[styles.sendButton, isSubmitting && styles.disabledButton]}
            onPress={handleAddComment}
            disabled={isSubmitting || !newComment.trim()}>
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Icon name="send" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexContainer: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  container: {
    flex: 1,
    paddingHorizontal: 15,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  questionSection: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  meta: {
    fontSize: 13,
    color: 'gray',
    marginBottom: 15,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginBottom: 15,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
  },
  commentsSection: {
    marginBottom: 20,
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    paddingLeft: 5,
    color: '#333',
  },
  noCommentsText: {
    textAlign: 'center',
    color: 'gray',
    marginTop: 20,
    padding: 20,
  },
  commentContainer: {
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    maxWidth: '85%',
  },
  myComment: {
    backgroundColor: '#3d5afe',
    alignSelf: 'flex-end',
  },
  otherComment: {
    backgroundColor: 'white',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  commentAuthor: {
    fontWeight: 'bold',
    color: '#333',
  },
  adminAuthor: {
    color: '#0056b3',
  },
  commentContent: {
    fontSize: 15,
    lineHeight: 20,
    color: '#333',
  },
  commentTimestamp: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderColor: '#ccc',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#3d5afe',
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  disabledButton: {
    backgroundColor: '#a9a9a9',
  },
});
