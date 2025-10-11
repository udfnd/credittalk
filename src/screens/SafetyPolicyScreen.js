import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SAFETY_POLICY_SECTIONS, SAFETY_POLICY_SUMMARY } from '../lib/contentSafety';

const SafetyPolicyScreen = () => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>커뮤니티 안전 약관</Text>
      <Text style={styles.subtitle}>{SAFETY_POLICY_SUMMARY}</Text>
      {SAFETY_POLICY_SECTIONS.map(section => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionBody}>{section.body}</Text>
        </View>
      ))}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>운영진 대응</Text>
        <Text style={styles.sectionBody}>
          신고된 콘텐츠와 이용자는 최대 24시간 내에 검토하며, 위반 사실이 확인되면 해당 콘텐츠를 삭제하고
          이용자 계정을 즉시 제한합니다. 반복 위반 시 서비스 이용이 영구 중단됩니다.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2933',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#4a5568',
    lineHeight: 22,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a202c',
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#2d3748',
  },
});

export default SafetyPolicyScreen;
