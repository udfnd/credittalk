import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    TextInput, // 검색 기능 추가 시 필요
    Keyboard,  // 검색 기능 추가 시 필요
} from 'react-native';
import { supabase } from '../lib/supabaseClient'; //
import { useAuth } from '../context/AuthContext'; //
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'; // 아이콘 사용 시

function NewChatScreen() {
    const { user } = useAuth();
    const navigation = useNavigation();
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true); // 사용자 목록 로딩 상태
    const [isCreatingChat, setIsCreatingChat] = useState(false); // 채팅방 생성 로딩 상태
    const [searchTerm, setSearchTerm] = useState(''); // 사용자 검색어

    const fetchUsers = useCallback(async (currentSearchTerm = '') => {
        if (!user) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        let query = supabase
            .from('users') // public.users 테이블
            .select('id, nickname, auth_user_id')
            .neq('auth_user_id', user.id);

        if (currentSearchTerm.trim()) {
            query = query.ilike('nickname', `%${currentSearchTerm.trim()}%`);
        }

        const { data, error } = await query;

        if (error) {
            Alert.alert('오류', '사용자 목록을 불러오는데 실패했습니다.');
            console.error('Fetch users error:', error);
            setUsers([]);
        } else {
            setUsers(data || []);
        }
        setIsLoading(false);
    }, [user]);

    useEffect(() => {
        // 검색어가 없을 때만 초기 사용자 목록 로드
        if (!searchTerm.trim()) {
            fetchUsers();
        }
    }, [fetchUsers, searchTerm]); // searchTerm 변경 시에도 재검색 로직을 위해 포함 (fetchUsers 내에서 처리)

    const handleSearch = () => {
        Keyboard.dismiss();
        fetchUsers(searchTerm);
    };


    const handleCreateOrGoToChat = async (otherUser) => {
        if (!user || !otherUser.auth_user_id) {
            Alert.alert('오류', '사용자 정보가 올바르지 않아 채팅을 시작할 수 없습니다.');
            return;
        }
        if (user.id === otherUser.auth_user_id) {
            Alert.alert('오류', '자기 자신과는 채팅할 수 없습니다.');
            return;
        }

        setIsCreatingChat(true); // 채팅방 생성 로딩 시작
        console.log(`[NewChatScreen] Attempting to create/go to chat with: ${otherUser.nickname} (ID: ${otherUser.auth_user_id})`);
        console.log(`[NewChatScreen] Current user ID: ${user.id}`);

        try {
            const { data: functionData, error: functionError } = await supabase.functions.invoke(
                'create-chat-room', // 배포한 Supabase 함수 이름
                {
                    body: { otherUserId: otherUser.auth_user_id },
                }
            );

            if (functionError) {
                console.error('Invoke create-chat-room error details:', functionError);
                // Supabase 함수에서 반환된 에러 메시지를 그대로 사용하거나,
                // functionError.context?.errorMessage 등으로 더 구체적인 메시지 추출 시도
                const detailedMessage = functionError.message || '알 수 없는 함수 오류';
                throw new Error(detailedMessage);
            }

            console.log('[NewChatScreen] Supabase function response:', functionData);

            if (functionData && functionData.roomId) {
                navigation.navigate('ChatMessageScreen', {
                    roomId: functionData.roomId,
                    roomName: otherUser.nickname || '채팅', // 상대방 이름으로 채팅방 이름 설정
                });
            } else if (functionData && functionData.error) {
                // 함수 내부에서 에러를 JSON으로 반환한 경우
                throw new Error(functionData.error);
            }
            else {
                throw new Error('채팅방 ID를 받아오지 못했습니다. 함수 응답을 확인해주세요.');
            }

        } catch (error) {
            Alert.alert('채팅 시작 오류', `오류 발생: ${error.message}`);
            console.error('Error in handleCreateOrGoToChat:', error);
        } finally {
            setIsCreatingChat(false); // 채팅방 생성 로딩 종료
        }
    };

    const renderUserItem = ({ item }) => (
        <TouchableOpacity
            style={styles.userItem}
            onPress={() => handleCreateOrGoToChat(item)}
            disabled={isCreatingChat} // 채팅방 생성 중에는 버튼 비활성화
        >
            <Icon name="account-circle-outline" size={24} color="#444" style={styles.userIcon} />
            <Text style={styles.userName}>{item.nickname || '이름 없음'}</Text>
            <Icon name="chevron-right" size={22} color="#ccc" />
        </TouchableOpacity>
    );

    if (isLoading && users.length === 0) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#3d5afe" />
                <Text style={styles.loadingText}>사용자 목록을 불러오는 중...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="사용자 이름 검색..."
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    onSubmitEditing={handleSearch} // Enter 키로 검색
                    returnKeyType="search"
                />
                <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
                    <Icon name="magnify" size={24} color="white" />
                </TouchableOpacity>
            </View>

            {isLoading && users.length > 0 ? ( // 검색 중일 때 로딩 표시 (결과가 이미 있는 경우)
                <ActivityIndicator style={{ marginVertical: 10 }} size="small" color="#3d5afe" />
            ) : null}

            <FlatList
                data={users}
                keyExtractor={(item) => item.auth_user_id.toString()} // 고유한 키로 auth_user_id 사용
                renderItem={renderUserItem}
                ListEmptyComponent={
                    !isLoading && ( // 로딩 중이 아닐 때만 "없음" 메시지 표시
                        <View style={styles.centered}>
                            <Icon name="account-search-outline" size={50} color="#bdc3c7" />
                            <Text style={styles.emptyText}>
                                {searchTerm.trim() ? `'${searchTerm.trim()}' 검색 결과가 없습니다.` : '다른 사용자가 없습니다.'}
                            </Text>
                        </View>
                    )
                }
                keyboardShouldPersistTaps="handled" // 스크롤 중 키보드 숨김 처리
            />
            {isCreatingChat && ( // 채팅방 생성 중 전체 화면 로딩 오버레이 (선택 사항)
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="white" />
                    <Text style={styles.loadingOverlayText}>채팅방 준비 중...</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    searchContainer: {
        flexDirection: 'row',
        padding: 10,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    searchInput: {
        flex: 1,
        height: 40,
        borderColor: '#ddd',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        marginRight: 10,
        backgroundColor: 'white',
    },
    searchButton: {
        backgroundColor: '#3d5afe',
        paddingHorizontal: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: 'white',
    },
    userIcon: {
        marginRight: 10,
    },
    userName: {
        fontSize: 16,
        color: '#333',
        flex: 1,
    },
    emptyText: {
        textAlign: 'center',
        marginTop: 20,
        fontSize: 16,
        color: 'gray',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 14,
        color: 'gray',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject, // 화면 전체를 덮도록
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10, // 다른 요소들 위에 오도록
    },
    loadingOverlayText: {
        color: 'white',
        marginTop: 10,
        fontSize: 16,
    }
});

export default NewChatScreen;
