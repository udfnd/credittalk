import React from 'react';
import { View, Text, StyleSheet, Button, Linking } from 'react-native';

function SettingsScreen({ navigation }) {
  const handleLink = (url) => {
    Linking.openURL(url).catch((err) =>
      console.error("Couldn't open link", err),
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>설정</Text>
      <View style={styles.spacing}>
        <Button
          title="한국금융범죄예방연구센터 카카오톡"
          onPress={() => handleLink('https://open.kakao.com/o/gKmnz1Ae')}
        />
      </View>
      <View style={styles.spacing}>
        <Button
          title="사기 정보 입력"
          onPress={() => navigation.navigate('Report')}
        />
      </View>
      {/*<View style={styles.spacing}>*/}
      {/*  <Button title="채팅" onPress={() => {}} />*/}
      {/*</View>*/}
      <View style={styles.spacing}>
        <Button
          title="홈 화면으로 돌아가기"
          onPress={() => navigation.goBack()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4f7f9',
    padding: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 40,
    color: '#1e3a5f',
  },
  spacing: {
    marginVertical: 10, // 버튼 간의 간격을 추가
  },
});

export default SettingsScreen;
