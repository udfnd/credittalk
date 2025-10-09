import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  Linking,
  Alert,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';

// Invisible characters(e.g., zero-width spaces) stripper
function stripInvisible(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim();
}

// ✨ 개선: canOpenURL 의존을 줄이고, http(s) 링크는 직접 open 시도 → 실패 시 Alert
async function openExternal(rawUrl) {
  const cleanedUrl = stripInvisible(rawUrl);
  if (!cleanedUrl) {
    Alert.alert('링크 오류', '연결할 URL 주소가 없습니다.');
    return;
  }

  // URL에 http:// 또는 https:// 가 없으면 https:// 를 붙여줍니다.
  const finalUrl = /^(https?|ftp):\/\//i.test(cleanedUrl)
    ? cleanedUrl
    : `https://${cleanedUrl}`;

  try {
    await Linking.openURL(finalUrl);
  } catch (error) {
    console.error('[partners] openExternal error:', error);
    Alert.alert('링크를 열 수 없어요', `이 주소는 열 수 없습니다: ${finalUrl}`);
  }
}

export default function PartnersCarousel() {
  const [items, setItems] = useState([]);
  const translateX = useRef(new Animated.Value(0)).current;

  // 배너 로드
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('partner_banners')
        .select('id, title, image_url, link_url, sort, created_at, is_active')
        .eq('is_active', true)
        .order('sort', { ascending: true })
        .order('created_at', { ascending: false });

      if (!mounted) return;
      if (error) {
        console.log('[partners] fetch error:', error.message);
        setItems([]);
      } else {
        const filtered = (data || []).filter(
          b => b.image_url && b.image_url.trim().length > 0,
        );
        setItems(filtered);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 무한 루프용 복제 배열
  const doubled = useMemo(
    () => (items.length ? [...items, ...items] : []),
    [items],
  );

  // 자동 좌측 이동 (linear, 무한 반복)
  useEffect(() => {
    if (!items.length) return;

    const unit = CARD_WIDTH + GAP;
    const loopWidth = items.length * unit;
    const speed = 60; // px/sec
    const duration = Math.max(300, Math.round((loopWidth / speed) * 1000));

    let cancelled = false;

    const run = () => {
      translateX.setValue(0);
      Animated.timing(translateX, {
        toValue: -loopWidth,
        duration,
        easing: Easing.linear,
        // ✅ 핵심 수정: native driver 사용 시 Android에서 터치 히트박스가 어긋나는 이슈가 있어 false로 설정
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!cancelled && finished) run();
      });
    };

    run();
    return () => {
      cancelled = true;
      translateX.stopAnimation();
    };
  }, [items.length, translateX]);

  if (!items.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>제휴사</Text>
      <View style={styles.scroller} pointerEvents="box-none">
        <Animated.View
          style={[styles.row, { transform: [{ translateX }] }]}
          // ✅ 터치/레이아웃 안정화 (플래트닝 방지)
          collapsable={false}
          pointerEvents="box-none">
          {doubled.map((b, i) => (
            <Pressable
              key={`${b.id}-${i}`}
              onPress={() => openExternal(b.link_url)}
              style={{ marginRight: GAP }}
              android_ripple={{ color: '#e5e7eb' }}
              hitSlop={8}
              // ✅ 각 항목도 안전하게 플래트닝 방지
              collapsable={false}>
              <Image
                source={{ uri: b.image_url }}
                style={styles.card}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

// 레이아웃 상수: 3:1 비율 카드
const CARD_HEIGHT = 48;
const CARD_WIDTH = CARD_HEIGHT * 3; // 3:1
const GAP = 12;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 16,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  label: {
    width: 60,
    fontWeight: '700',
    fontSize: 16,
    color: '#111827',
    marginRight: 8,
  },
  scroller: {
    flex: 1,
    height: CARD_HEIGHT,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
});
