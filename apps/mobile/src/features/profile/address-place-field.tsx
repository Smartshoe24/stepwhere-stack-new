import type { AddressPlaceSuggestionDto } from "@stepwhere/types";
import React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AppIcon } from "@/components/ui/app-icon";
import { ApiError, resolveAddressPlace, searchAddressPlaces } from "@/lib/api-client";

type AddressPlaceFieldProps = {
  disabled?: boolean;
  error?: string | null;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  value: string;
};

function buildSessionToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `address-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AddressPlaceField({
  disabled = false,
  error = null,
  onChangeText,
  onFocus,
  value,
}: AddressPlaceFieldProps) {
  const [sessionToken, setSessionToken] = React.useState(buildSessionToken);
  const [suggestions, setSuggestions] = React.useState<AddressPlaceSuggestionDto[]>([]);
  const [hasFocus, setHasFocus] = React.useState(false);
  const [isResolving, setIsResolving] = React.useState(false);
  const [internalError, setInternalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const query = value.trim();
    if (!hasFocus || query.length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const next = await searchAddressPlaces(query, sessionToken, {
          operationName: "searchAddressPlaces",
          signal: controller.signal,
        });
        setSuggestions(next);
        setInternalError(null);
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }
        setSuggestions([]);
        setInternalError(nextError instanceof ApiError
          ? nextError.message
          : "Address suggestions are unavailable. You can still type your address.");
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [hasFocus, sessionToken, value]);

  async function handleSelect(suggestion: AddressPlaceSuggestionDto) {
    if (isResolving) {
      return;
    }

    setIsResolving(true);
    setInternalError(null);
    try {
      const address = await resolveAddressPlace({
        providerPlaceId: suggestion.providerPlaceId,
        sessionToken,
      }, { operationName: "resolveAddressPlace" });
      onChangeText(address.formattedAddress);
      setSuggestions([]);
      setHasFocus(false);
      setSessionToken(buildSessionToken());
    } catch (nextError) {
      setInternalError(nextError instanceof ApiError
        ? nextError.message
        : "Unable to use that address. You can still type it manually.");
    } finally {
      setIsResolving(false);
    }
  }

  const combinedError = error ?? internalError;

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Current address</Text>
      <View style={styles.inputWrap(Boolean(error))}>
        <AppIcon color={styles.leadingIcon.color} name="navigation" size={18} />
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          editable={!disabled}
          onBlur={() => {
            setTimeout(() => setHasFocus(false), 140);
          }}
          onChangeText={(nextValue) => {
            onChangeText(nextValue);
            setInternalError(null);
          }}
          onFocus={() => {
            setHasFocus(true);
            onFocus?.();
          }}
          placeholder="Flat, street, area, city"
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
          value={value}
        />
        {isResolving ? <ActivityIndicator color={styles.spinner.color} size="small" /> : null}
      </View>

      {hasFocus && value.trim().length >= 3 && suggestions.length > 0 ? (
        <View style={styles.suggestionsCard}>
          {suggestions.map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              key={suggestion.providerPlaceId}
              onPress={() => { void handleSelect(suggestion); }}
              style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}
            >
              <View style={styles.suggestionIconWrap}>
                <AppIcon color={styles.suggestionIcon.color} name="navigation" size={15} />
              </View>
              <View style={styles.suggestionCopy}>
                <Text numberOfLines={1} style={styles.suggestionTitle}>{suggestion.mainText}</Text>
                {suggestion.secondaryText ? (
                  <Text numberOfLines={2} style={styles.suggestionSubtitle}>{suggestion.secondaryText}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          <View style={styles.providerRow}>
            <Text style={styles.providerText}>Suggestions by Google · You can also type the address</Text>
          </View>
        </View>
      ) : null}

      {combinedError ? <Text style={error ? styles.errorText : styles.helperText}>{combinedError}</Text> : (
        <Text style={styles.helperText}>Choose a suggestion when available, or keep your typed address.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: { gap: theme.spacing[2] },
  label: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  inputWrap: (hasError: boolean) => ({
    minHeight: 54,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: hasError ? theme.colors.alertBorder : theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[4],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  }),
  leadingIcon: { color: theme.colors.textSecondary },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    fontWeight: theme.typography.weight.medium,
    paddingVertical: 0,
  },
  placeholder: { color: theme.colors.textMuted },
  spinner: { color: theme.colors.primaryGreen },
  suggestionsCard: {
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
    ...theme.shadows.card,
  },
  suggestionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  suggestionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  suggestionIcon: { color: theme.colors.primaryGreen },
  suggestionCopy: { flex: 1, gap: 2 },
  suggestionTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  suggestionSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  providerRow: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surfaceMuted,
  },
  providerText: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    lineHeight: 15,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  pressed: { opacity: theme.colors.button.pressedOpacity },
}));
