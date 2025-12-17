import React from 'react';
import { useRoute } from '@react-navigation/native';
import SearchBaseScreen from './SearchBaseScreen'; // 경로 확인

function UnifiedSearchScreen() {
  const route = useRoute();
  // Deep Link에서 phoneNumber 파라미터를 받거나, 일반 네비게이션에서 initialSearchTerm을 받음
  const searchTerm = route.params?.phoneNumber || route.params?.initialSearchTerm || '';

  return <SearchBaseScreen title="피해 사례 검색" searchTerm={searchTerm} />;
}
export default UnifiedSearchScreen;
