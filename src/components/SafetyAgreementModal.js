import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { SAFETY_POLICY_SECTIONS, SAFETY_POLICY_SUMMARY } from '../lib/contentSafety';

const SafetyAgreementModal = ({ visible, onAccept }) => {
  return (
    <Modal animationType="slide" transparent={false} visible={visible}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>커뮤니티 안전 약관 동의</Text>
          <Text style={styles.subtitle}>{SAFETY_POLICY_SUMMARY}</Text>
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {SAFETY_POLICY_SECTIONS.map(section => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>
            ))}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>무관용 정책</Text>
              <Text style={styles.sectionBody}>
                본 약관에 동의하면 귀하는 부적절한 콘텐츠나 이용자에 대해 즉시 신고하고, 신고된 내용은
                운영진이 24시간 이내에 검토하여 필요한 경우 콘텐츠 삭제 및 사용자 퇴출 조치를 진행한다는
                것에 동의하는 것입니다. 약관에 동의하지 않으면 커뮤니티 기능을 이용할 수 없습니다.
              </Text>
            </View>
          </ScrollView>
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
            <Text style={styles.acceptButtonText}>약관에 동의하고 계속하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 20,
    color: '#1f2933',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 22,
    color: '#4a5568',
  },
  scrollArea: {
    flex: 1,
    marginTop: 24,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  section: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#f8fafc',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#1a202c',
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },
  acceptButton: {
    backgroundColor: '#3d5afe',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default SafetyAgreementModal;
