// src/components/ImageSelectionModal.js
import React from "react";
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

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
      {item.source ? (
        <>
          <Image
            source={item.source}
            style={styles.image}
            resizeMode="contain"
          />
          <Text style={styles.textItem} numberOfLines={2} ellipsizeMode="tail">
            {item.name}
          </Text>
        </>
      ) : (
        <Text style={styles.textOnlyItem}>{item.name}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Icon name="close" size={28} color="#333" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.name}-${index}`}
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
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  listContainer: {
    padding: 10,
  },
  itemContainer: {
    flex: 1,
    margin: 5,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 5,
    aspectRatio: 1,
    backgroundColor: "#f8f9fa",
  },
  image: {
    width: "70%",
    height: "70%",
    marginBottom: 5,
  },
  textItem: {
    fontSize: 12,
    fontWeight: "500",
    color: "#343a40",
    textAlign: "center",
  },
  textOnlyItem: {
    fontSize: 16,
    fontWeight: "500",
    color: "#343a40",
    textAlign: "center",
  },
});

export default ImageSelectionModal;
