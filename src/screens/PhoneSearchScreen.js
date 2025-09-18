// PhoneSearchScreen.js
import React from 'react';
import SearchBaseScreen, { SEARCH_TYPES } from './SearchBaseScreen'; // 경로 확인

function PhoneSearchScreen() {
  return (
    <SearchBaseScreen searchType={SEARCH_TYPES.PHONE} title="사기 번호 검색" />
  );
}

export default PhoneSearchScreen;
