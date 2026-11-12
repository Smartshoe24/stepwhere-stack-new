import React from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function ActivityHeader() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Activity</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: theme.typography.weight.bold,
  },
}));
