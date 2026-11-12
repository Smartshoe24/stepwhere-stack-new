import React from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ShoeLoader } from "@/components/loading/shoe-loader";

export function ActivityLoadingState() {
  return (
    <View style={styles.container}>
      <ShoeLoader size={64} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.spacing[7],
    alignItems: "center",
    justifyContent: "center",
  },
}));
