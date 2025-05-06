// AccountSearchScreen.js
import React from 'react';
import SearchBaseScreen, { SEARCH_TYPES } from './SearchBaseScreen'; // 경로 확인

function AccountSearchScreen() {
  return (
    <SearchBaseScreen
      searchType={SEARCH_TYPES.ACCOUNT}
      title="사기 계좌 검색"
    />
  );
}

export default AccountSearchScreen;
