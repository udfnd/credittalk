import React from 'react';
import SearchBaseScreen, { SEARCH_TYPES } from './SearchBaseScreen'; // 경로 확인

function UnifiedSearchScreen() {
  return (
    <SearchBaseScreen searchType={SEARCH_TYPES.UNIFIED} title="통합 검색" />
  );
}
export default UnifiedSearchScreen;
