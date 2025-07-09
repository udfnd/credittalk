// src/components/CommentsSection.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';

// 개별 댓글 아이템
const CommentItem = ({ comment, currentProfileId }) => {
  const handleDelete = async () => {
    Alert.alert(
      "댓글 삭제", "정말로 이 댓글을 삭제하시겠습니까?",
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
      <Text style={styles.commentDate}>
        {formatDistanceToNow(parseISO(comment.created_at), { addSuffix: true, locale: ko })}
      </Text>
    </View>
  );
};

// 댓글 섹션 전체
const CommentsSection = ({ postId, boardType }) => {
  const { user, profile } = useAuth(); // 인증 컨텍스트에서 profile 정보를 가져옵니다.
  const navigation = useNavigation();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*, users(nickname)') // Foreign Key 관계로 users 테이블의 nickname을 바로 가져옵니다.
        .eq('post_id', postId)
        .eq('board_type', boardType)
        .order('created_at', { ascending: true }); // 시간순 정렬

      if (error) throw error;
      setComments(data || []);
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

  const handleAddComment = async () => {
    if (!user || !profile?.id) {
      Alert.alert("로그인 필요", "댓글을 작성하려면 로그인이 필요합니다.");
      return;
    }
    if (!newComment.trim()) return;

    Keyboard.dismiss();
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      board_type: boardType,
      user_id: profile.id,
      content: newComment.trim(),
    });

    if (error) {
      Alert.alert("오류", "댓글 등록에 실패했습니다: " + error.message);
    } else {
      setNewComment("");
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
            renderItem={({ item }) => <CommentItem comment={item} currentProfileId={profile?.id} />}
            ListEmptyComponent={<Text style={styles.noCommentsText}>가장 먼저 댓글을 남겨보세요.</Text>}
            scrollEnabled={false}
          />
        )}
      {user ? (
        <View style={styles.inputContainer}>
          <TextInput style={styles.input} placeholder="따뜻한 댓글을 남겨주세요." value={newComment} onChangeText={setNewComment} multiline/>
          <TouchableOpacity style={styles.submitButton} onPress={handleAddComment}>
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
  commentContainer: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  commentAuthor: { fontWeight: 'bold', fontSize: 15, color: '#444' },
  commentDate: { fontSize: 12, color: '#999', marginTop: 8 },
  commentContent: { fontSize: 14, lineHeight: 21, color: '#555' },
  deleteButton: { padding: 5 },
  noCommentsText: { textAlign: 'center', color: '#aaa', marginVertical: 25, fontSize: 14 },
  loginPrompt: { justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f8f9fa', borderRadius: 8, marginTop: 10 },
  loginPromptText: { fontSize: 14, color: '#555', marginBottom: 10 },
  loginButtonText: { fontSize: 15, color: '#3d5afe', fontWeight: 'bold' },
});

export default CommentsSection;
