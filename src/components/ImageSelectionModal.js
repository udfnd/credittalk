// src/components/ImageSelectionModal.js
import React from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const ImageSelectionModal = ({ visible, onClose, items, onSelect, title }) => {
  const handleSelect = (item) => {
    onSelect(item.name);
    onClose();
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.itemContainer}
      onPress={() => handleSelect(item)}
    >
      <Image
        source={item.source}
        style={styles.itemImage}
        resizeMode="contain"
      />
      <Text style={styles.itemText}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.name}
          numColumns={3}
          contentContainerStyle={styles.listContainer}
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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginLeft: 30, // to center title
  },
  closeButton: {
    padding: 5,
  },
  listContainer: {
    padding: 10,
  },
  itemContainer: {
    flex: 1,
    margin: 5,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    height: 120,
  },
  itemImage: {
    width: 60,
    height: 60,
    marginBottom: 8,
  },
  itemText: {
    fontSize: 12,
    textAlign: 'center',
  },
});

export default ImageSelectionModal;
