import 'react-native-get-random-values';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

function HomeScreen() {
  const navigation = useNavigation();

  const renderGridButton = (title, targetScreen, iconName) => (
    <TouchableOpacity
      style={styles.button}
      onPress={() => navigation.navigate(targetScreen)}
      activeOpacity={0.7}
    >
      <Icon name={iconName} size={40} color="white" style={styles.icon} />
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CreditTalk</Text>
      <Text style={styles.subtitle}>안전한 거래를 위한 첫걸음</Text>
      <View style={styles.grid}>
        {renderGridButton('통합 검색', 'UnifiedSearch', 'magnify')}
        {renderGridButton('사기 계좌 검색', 'AccountSearch', 'bank-outline')}
        {renderGridButton('사기 번호 검색', 'PhoneSearch', 'phone-outline')}
        {renderGridButton('설정', 'Settings', 'cog-outline')}
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
    fontSize: 42,
    fontWeight: 'bold',
    color: '#1e3a5f',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#546e7a',
    marginBottom: 50,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
  },
  button: {
    width: '45%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 15,
    marginVertical: 10,
    backgroundColor: '#3d5afe',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
    padding: 10,
  },
  icon: {
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 5,
  },
});

export default HomeScreen;
