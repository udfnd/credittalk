#!/usr/bin/env bash
#------------------------------------------------------------------------------#
# macOS 기본 bash(v3)에서 동작하는 한글 → 영어 파일명 일괄 변경 스크립트
# Usage:
#   chmod +x scripts/rename_site_images.sh
#   bash scripts/rename_site_images.sh
#------------------------------------------------------------------------------#

# (1) 사이트 이미지 폴더로 이동
IMAGES_DIR="$(dirname "$0")/../src/assets/images/sites"
cd "$IMAGES_DIR" || { echo "❌ 폴더를 찾을 수 없습니다: $IMAGES_DIR"; exit 1; }

# (2) Here-doc 기반 매핑 (한글|영어)
while IFS='|' read -r OLD NEW; do
  EXT=".png"
  if [ -f "${OLD}${EXT}" ]; then
    if [ -e "${NEW}${EXT}" ]; then
      echo "⚠️ Skipping, exists: ${NEW}${EXT}"
    else
      mv "${OLD}${EXT}" "${NEW}${EXT}"
      echo "✅ ${OLD}${EXT} → ${NEW}${EXT}"
    fi
  else
    echo "⚠️ Not found: ${OLD}${EXT}"
  fi

done << 'EOF'
네이버 밴드|naver_band
네이버 블로그|naver_blog
네이버 스마트스토어|naver_smart_store
네이버 카페|naver_cafe
인스타그램|instagram
유튜브|youtube
텔레그램|telegram
당근마켓|danggeun_market
중고나라|junggonara
11번가|eleven_street
G마켓|gmarket
SK 엔카|sk_encar
SLR|slr
골마켓|gol_market
구글|google
네이트온|nateon
다나와|danawa
다음 카페|daum_cafe
디스코드|discord
디시인사이드|dcinside
루리웹|ruliweb
무신사|musinsa
뮬|mool
바로템|baro_tem
번개장터|bungae_jangteo
보배드림|bobaedream
뽐뿌|ppomppu
숨고|soomgo
아이템매니아|item_mania
아이템베이|item_bay
에브리타임|everytime
옥션|auction
왓츠앱|whatsapp
왓치폼|watcha_form
위메프|wemep
위챗|wechat
인터파크|interpark
카카오톡 스토리|kakaotalk_story
콜렉티브|collective
쿠팡|coupang
클리앙|clien
탕카페|tang_cafe
트위터|twitter
티몬|tmon
티스토리|tistory
틱톡|tiktok
페이스북|facebook
포카마켓|poka_market
헝그리보더|hungry_border
헝그리앱|hungry_app
헬로마켓|hello_market
후루츠|fruits
EOF

echo "🎉 All rename done!"
