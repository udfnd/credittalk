// src/components/PartnersCarousel.js
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

function cleanUrl(raw) {
  if (!raw) return null;
  return String(raw)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // 제로폭/불가시 공백 제거
    .trim();
}

// URL 정규화: 스킴이 없으면 https:// 붙임
function normalizeUrl(raw) {
  if (!raw) return null;
  const url = String(raw).trim();
  if (!url) return null;
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(url)) return url; // 이미 스킴 있음
  if (/^www\./i.test(url)) return `https://${url}`;      // www. 시작
  return `https://${url}`;                                // 기본 https 가정
}

async function handleOpen(raw) {
  const primary = normalizeUrl(raw);
  if (!primary) {
    Alert.alert('링크가 없어요', '배너의 링크 URL이 비어 있습니다.');
    return;
  }
  try {
    if (await Linking.canOpenURL(primary)) {
      await Linking.openURL(primary);
      return;
    }

    const fallback = primary.replace(/^https:\/\//i, 'http://');
    if (fallback !== primary && (await Linking.canOpenURL(fallback))) {
      await Linking.openURL(fallback);
      return;
    }
    Alert.alert('열 수 없는 링크', cleanUrl(raw) || '');
  } catch (e) {
    Alert.alert('링크를 열 수 없어요', e?.message ?? String(e));
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
        .select('id, title, image_url, link_url, sort')
        .eq('is_active', true)
        .order('sort', { ascending: true })
        .order('created_at', { ascending: false });

      if (!mounted) return;
      if (error) {
        console.log('[partners] fetch error:', error.message);
        setItems([]);
      } else {
        const filtered = (data || []).filter(
          (b) => b.image_url && b.image_url.trim().length > 0
        );
        setItems(filtered);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 무한 루프용 복제 배열
  const doubled = useMemo(() => (items.length ? [...items, ...items] : []), [items]);

  // 자동 좌측 이동 (linear, 무한 반복)
  useEffect(() => {
    if (!items.length) return;

    const unit = CARD_WIDTH + GAP;           // 카드 1개 + 간격
    const loopWidth = items.length * unit;   // 원본 한 줄 길이
    const speed = 60;                        // px/sec (원하는 속도로 조절)
    const duration = Math.max(300, Math.round((loopWidth / speed) * 1000));

    let cancelled = false;

    const run = () => {
      translateX.setValue(0);
      Animated.timing(translateX, {
        toValue: -loopWidth, // 한 줄 길이만큼 왼쪽으로 이동
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!cancelled && finished) {
          // 자연스럽게 이어진 뒤 원점으로 리셋하고 다시 시작
          run();
        }
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

      <View style={styles.scroller}>
        <Animated.View style={[styles.row, { transform: [{ translateX }] }]}>
          {doubled.map((b, i) => (
            <Pressable
              key={`${b.id}-${i}`}
              onPress={() => handleOpen(b.link_url)}
              style={{ marginRight: GAP }}
              android_ripple={{ color: '#e5e7eb' }}
              hitSlop={8}
            >
              <Image source={{ uri: b.image_url }} style={styles.card} resizeMode="cover" />
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
