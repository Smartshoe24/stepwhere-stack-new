import React from 'react';
import { Linking, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { TextLink } from './billing-ui';

// Terms and privacy match ProfileLegalCard; the refund policy page is
// expected alongside them on the website.
const LINKS = [
  { label: 'Terms', url: 'https://www.stepwhere.in/policies/terms-of-service' },
  { label: 'Privacy', url: 'https://www.stepwhere.in/policies/privacy-policy' },
  { label: 'Refunds', url: 'https://www.stepwhere.in/policies/refund-policy' },
];

export function BillingLegalLinks() {
  return (
    <View style={styles.row}>
      {LINKS.map(link => (
        <TextLink key={link.label} label={link.label} muted onPress={() => {
          void Linking.openURL(link.url);
        }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: theme.spacing[1],
  },
}));
