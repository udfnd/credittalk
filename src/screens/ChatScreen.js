import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

function ChatScreen() {
  return (
    <View style={styles.container}>
      <Icon name="chat-processing-outline" size={60} color="#bdc3c7" />
      <Text style={styles.title}>채팅</Text>
      <Text style={styles.message}>채팅 기능은 현재 준비 중입니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
    color: '#34495e',
  },
  message: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
  },
});

export default ChatScreen;
