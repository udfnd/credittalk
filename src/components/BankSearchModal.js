// src/components/BankSearchModal.js
import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const BankSearchModal = ({ visible, onClose, items, onSelect, title }) => {
  const [searchText, setSearchText] = useState('');

  const filteredItems = useMemo(() => {
    if (!searchText.trim()) {
      return items;
    }
    const lowerSearch = searchText.toLowerCase().trim();
    return items.filter(item =>
      item.name.toLowerCase().includes(lowerSearch)
    );
  }, [items, searchText]);

  const handleSelect = item => {
    onSelect(item.name);
    setSearchText('');
    onClose();
  };

  const handleClose = () => {
    setSearchText('');
    onClose();
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.itemContainer}
      onPress={() => handleSelect(item)}>
      {item.source ? (
        <Image
          source={item.source}
          style={styles.itemImage}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.noImagePlaceholder}>
          <Icon name="bank-outline" size={24} color="#6c757d" />
        </View>
      )}
      <Text style={styles.itemName} numberOfLines={1}>
        {item.name}
      </Text>
      <Icon name="chevron-right" size={24} color="#adb5bd" />
    </TouchableOpacity>
  );

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Icon name="magnify" size={48} color="#adb5bd" />
      <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
      <Text style={styles.emptySubText}>
        다른 검색어로 시도하거나{'\n'}"기타"를 선택해 직접 입력하세요
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Icon name="close" size={28} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Icon name="magnify" size={22} color="#6c757d" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="은행명을 검색하세요"
            placeholderTextColor="#adb5bd"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')} style={styles.clearButton}>
              <Icon name="close-circle" size={20} color="#adb5bd" />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filteredItems}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  closeButton: {
    padding: 5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 15,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#212529',
  },
  clearButton: {
    padding: 5,
  },
  listContainer: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  itemImage: {
    width: 40,
    height: 40,
    marginRight: 12,
    borderRadius: 8,
  },
  noImagePlaceholder: {
    width: 40,
    height: 40,
    marginRight: 12,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    color: '#212529',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 12,
  },
  emptySubText: {
    fontSize: 14,
    color: '#adb5bd',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default BankSearchModal;
