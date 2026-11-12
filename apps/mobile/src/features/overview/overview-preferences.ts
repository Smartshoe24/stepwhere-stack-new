import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "stepwhere.selected-child-id";

export async function getSelectedChildIdPreference() {
  return SecureStore.getItemAsync(STORAGE_KEY);
}

export async function setSelectedChildIdPreference(childId: string) {
  await SecureStore.setItemAsync(STORAGE_KEY, childId);
}
