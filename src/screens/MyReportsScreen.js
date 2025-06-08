import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';

function MyReportsScreen({ navigation }) {
    const [reports, setReports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchMyReports = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('로그인이 필요합니다.');
            }

            const { data, error: functionError } = await supabase.functions.invoke(
                'get-my-decrypted-reports',
                {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                },
            );

            if (functionError) throw functionError;
            setReports(data || []);
        } catch (err) {
            setError(err.message || '데이터를 불러오는데 실패했습니다.');
            setReports([]);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchMyReports();
        }, [fetchMyReports]),
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchMyReports();
    }, [fetchMyReports]);

    const renderItem = ({ item }) => (
        <TouchableOpacity
            style={styles.itemContainer}
            onPress={() => {
                /* 상세 페이지 구현 시 네비게이션 로직 추가 */
            }}
        >
            <Text style={styles.itemTitle}>{item.category}</Text>
            <Text style={styles.itemText}>이름: {item.name || '미입력'}</Text>
            <Text style={styles.itemText}>연락처: {item.phone_number || '미입력'}</Text>
            <Text style={styles.itemText}>
                계좌번호: {item.account_number || '미입력'}
            </Text>
            <Text style={styles.dateText}>
                신고일: {new Date(item.created_at).toLocaleDateString()}
            </Text>
        </TouchableOpacity>
    );

    if (isLoading && !refreshing) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#3d5afe" />
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.centered}>
                <Icon name="alert-circle-outline" size={50} color="#e74c3c" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>다시 시도</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={reports}
                renderItem={renderItem}
                keyExtractor={(item) => item.id.toString()}
                ListEmptyComponent={
                    !isLoading && (
                        <View style={styles.centered}>
                            <Icon name="file-document-outline" size={50} color="#bdc3c7" />
                            <Text style={styles.emptyText}>작성한 피해사례가 없습니다.</Text>
                        </View>
                    )
                }
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f2f5' },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    itemContainer: {
        backgroundColor: '#ffffff',
        padding: 15,
        marginVertical: 8,
        marginHorizontal: 16,
        borderRadius: 8,
        elevation: 2,
    },
    itemTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#3d5afe',
    },
    itemText: {
        fontSize: 15,
        marginBottom: 4,
        color: '#333',
    },
    dateText: {
        fontSize: 12,
        color: '#777',
        textAlign: 'right',
        marginTop: 8,
    },
    errorText: {
        marginTop: 10,
        fontSize: 16,
        color: '#e74c3c',
        textAlign: 'center',
    },
    emptyText: {
        marginTop: 10,
        fontSize: 16,
        color: '#7f8c8d',
    },
    retryButton: {
        marginTop: 20,
        backgroundColor: '#3d5afe',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    retryButtonText: {
        color: 'white',
        fontSize: 16,
    },
});

export default MyReportsScreen;
