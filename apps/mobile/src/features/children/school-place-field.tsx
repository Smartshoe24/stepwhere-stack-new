import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { PlaceDto } from '@stepwhere/types';

import { AppIcon } from '@/components/ui/app-icon';
import { ApiError, resolveSchoolPlace, searchSchoolPlaces } from '@/lib/api-client';
import { useOnboardingScroll } from '@/features/onboarding/components/onboarding-scroll-context';

type SchoolPlaceFieldProps = {
  error?: string | null;
  label?: string;
  onSelect: (place: PlaceDto | null) => void;
  selectedPlace: PlaceDto | null;
  onFocus?: () => void;
};

type Suggestion = {
  provider: 'google';
  providerPlaceId: string;
  mainText: string;
  secondaryText: string | null;
};

function buildLocalSessionToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `places-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SchoolPlaceField({
  error,
  label = "School*",
  onSelect,
  onFocus,
  selectedPlace,
}: SchoolPlaceFieldProps) {
  const { revealFocusedField } = useOnboardingScroll();
  const [sessionToken] = React.useState(() => buildLocalSessionToken());
  const [query, setQuery] = React.useState('');
  const [isResolving, setIsResolving] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [internalError, setInternalError] = React.useState<string | null>(null);
  const [hasFocus, setHasFocus] = React.useState(false);

  React.useEffect(() => {
    const normalizedQuery = query.trim();

    if (!hasFocus || normalizedQuery.length < 2) {
      return;
    }

    let cancelled = false;

    const timeout = setTimeout(async () => {
      try {
        const nextSuggestions = await searchSchoolPlaces(normalizedQuery, sessionToken, {
          operationName: 'searchSchoolPlaces',
        });

        if (!cancelled) {
          setSuggestions(nextSuggestions);
          setInternalError(null);
          if (nextSuggestions.length > 0) {
            revealFocusedField();
          }
        }
      } catch (nextError) {
        if (!cancelled) {
          setSuggestions([]);
          setInternalError(
            nextError instanceof ApiError
              ? nextError.message
              : 'Unable to search for schools right now.',
          );
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [hasFocus, query, revealFocusedField, sessionToken]);

  async function handleSelectSuggestion(suggestion: Suggestion) {
    if (isResolving) {
      return;
    }

    setIsResolving(true);
    setInternalError(null);

    try {
      const place = await resolveSchoolPlace({
        providerPlaceId: suggestion.providerPlaceId,
      }, {
        operationName: 'resolveSchoolPlace',
      });

      onSelect(place);
      setQuery(place.label);
      setSuggestions([]);
      setHasFocus(false);
    } catch (nextError) {
      setInternalError(
        nextError instanceof ApiError
          ? nextError.message
          : 'Unable to use that school right now.',
      );
    } finally {
      setIsResolving(false);
    }
  }

  const combinedError = error ?? internalError;
  const showSuggestions = hasFocus && suggestions.length > 0;

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap(Boolean(combinedError))}>
        <AppIcon color={styles.leadingIcon.color} name="city" size={18} />
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          onBlur={() => {
            setTimeout(() => {
              setHasFocus(false);
            }, 120);
          }}
          onChangeText={(value) => {
            if (selectedPlace && value.trim() !== selectedPlace.label) {
              onSelect(null);
            }
            setQuery(value);
            setInternalError(null);
          }}
          onFocus={() => {
            setQuery(selectedPlace?.label ?? query);
            setHasFocus(true);
            revealFocusedField();
            onFocus?.();
          }}
          placeholder="Search for school"
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
          value={hasFocus ? query : (selectedPlace?.label ?? query)}
        />
        {isResolving ? (
          <ActivityIndicator color={styles.spinner.color} size="small" />
        ) : null}
      </View>

      {showSuggestions ? (
        <View style={styles.suggestionsCard}>
          {suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.providerPlaceId}
                onPress={() => {
                  void handleSelectSuggestion(suggestion);
                }}
                style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}
              >
                <View style={styles.suggestionIconWrap}>
                  <AppIcon color={styles.suggestionIcon.color} name="city" size={16} />
                </View>
                <View style={styles.suggestionCopy}>
                  <Text numberOfLines={1} style={styles.suggestionTitle}>
                    {suggestion.mainText}
                  </Text>
                  {suggestion.secondaryText ? (
                    <Text numberOfLines={2} style={styles.suggestionSubtitle}>
                      {suggestion.secondaryText}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>No schools found.</Text>
          )}
        </View>
      ) : null}

      {selectedPlace?.formattedAddress ? (
        <View style={styles.selectedMeta}>
          <AppIcon color={styles.metaIcon.color} name="navigation" size={14} />
          <Text style={styles.selectedMetaText}>{selectedPlace.formattedAddress}</Text>
        </View>
      ) : null}

      {combinedError ? <Text style={styles.errorText}>{combinedError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: {
    gap: theme.spacing[2],
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  }),
  leadingIcon: {
    color: theme.colors.textSecondary,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    fontWeight: theme.typography.weight.medium,
    paddingVertical: 0,
  },
  placeholder: {
    color: theme.colors.textMuted,
  },
  spinner: {
    color: theme.colors.primaryGreen,
  },
  suggestionsCard: {
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  suggestionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  suggestionIcon: {
    color: theme.colors.primaryGreen,
  },
  suggestionCopy: {
    flex: 1,
    gap: 2,
  },
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
  emptyText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  selectedMeta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  metaIcon: {
    color: theme.colors.textMuted,
  },
  selectedMetaText: {
    flex: 1,
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
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
