import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function HelpDeskPinnedNotices({ notices, onPressNotice }) {
  if (!notices?.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Icon name="bullhorn-variant-outline" size={18} color="#1f6feb" />
        <Text style={styles.headerText}>공지사항</Text>
      </View>

      {notices.map(n => {
        const firstImage =
          Array.isArray(n.image_urls) && n.image_urls.length > 0
            ? n.image_urls[0]
            : null;
        return (
          <TouchableOpacity
            key={n.id}
            style={styles.notice}
            onPress={() => onPressNotice?.(n)}
            activeOpacity={0.7}>
            {firstImage ? (
              <Image
                source={{ uri: firstImage }}
                style={styles.thumb}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.textCol}>
              <Text numberOfLines={1} style={styles.title}>
                {n.title}
              </Text>
              <Text numberOfLines={2} style={styles.body}>
                {n.body}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#eef6ff',
    borderBottomColor: '#d0e3ff',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  headerText: { marginLeft: 6, fontWeight: '700', color: '#1f6feb' },
  notice: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5efff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: '#f3f4f6',
  },
  textCol: { flex: 1 },
  title: { fontWeight: '700', color: '#111827', marginBottom: 4 },
  body: { color: '#374151', fontSize: 13 },
});
