import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

function ArrestNewsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>검거소식</Text>
      <Text style={styles.message}>이 페이지는 준비 중입니다.</Text>
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
    marginBottom: 20,
    color: '#34495e',
  },
  message: {
    fontSize: 18,
    color: '#7f8c8d',
    textAlign: 'center',
  },
});

export default ArrestNewsScreen;
