import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ShoeLoader } from '@/components/loading/shoe-loader';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import { Avatar } from '@/components/ui/avatar';

import { type BillingNotice, describeBillingError } from './billing-errors';
import type { RichSegment, ScheduleLineCopy } from './billing-quote';
import type { BillingShoe } from './use-billing';

// Building blocks shared by the billing card, banners and screens. They follow
// the Profile cards: one surface recipe (1px border + shadows.card), tinted
// icon plates, and tone chips built from the shared status tokens.

type Theme = ReturnType<typeof useUnistyles>['theme'];

export type BillingTone = 'green' | 'amber' | 'red' | 'neutral';

export function getBillingToneColors(theme: Theme, tone: BillingTone) {
  switch (tone) {
    case 'green':
      return { surface: theme.colors.softGreen, text: theme.status.safe.text, icon: theme.colors.primaryGreen };
    case 'amber':
      return { surface: theme.colors.transitBackground, text: theme.colors.transitText, icon: theme.colors.transitText };
    case 'red':
      return { surface: theme.colors.alertBackground, text: theme.colors.alertText, icon: theme.colors.alertText };
    case 'neutral':
    default:
      return { surface: theme.colors.surfaceMuted, text: theme.colors.textSecondary, icon: theme.colors.icon };
  }
}

export function BillingChip({ icon, label, tone }: { icon?: AppIconName; label: string; tone: BillingTone }) {
  const { theme } = useUnistyles();
  const colors = getBillingToneColors(theme, tone);

  return (
    <View style={styles.chip(colors.surface)}>
      {icon ? <AppIcon color={colors.text} name={icon} size={12} /> : null}
      <Text numberOfLines={1} style={styles.chipLabel(colors.text)}>{label}</Text>
    </View>
  );
}

export function IconPlate({ icon, size = 36, tone }: { icon: AppIconName; size?: number; tone: BillingTone }) {
  const { theme } = useUnistyles();
  const colors = getBillingToneColors(theme, tone);

  return (
    <View style={styles.plate(size, colors.surface)}>
      <AppIcon color={colors.icon} name={icon} size={Math.round(size * 0.47)} />
    </View>
  );
}

/** The brand-gradient crown tile that marks the family plan. */
export function PlanBadge({ size = 36 }: { size?: number }) {
  const { theme } = useUnistyles();

  return (
    <LinearGradient
      colors={[theme.colors.brandLogo.whereGradientStart, theme.colors.brandLogo.whereGradientEnd]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={styles.badge(size)}
    >
      <AppIcon color={theme.colors.avatar.onParentGradient} name="crown" size={Math.round(size * 0.47)} />
    </LinearGradient>
  );
}

export function PlanHeader({ caption, trailing }: { caption: string; trailing?: React.ReactNode }) {
  return (
    <View style={styles.planHeader}>
      <PlanBadge />
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>Stepwhere Family</Text>
        <Text numberOfLines={1} style={styles.caption}>{caption}</Text>
      </View>
      {trailing}
    </View>
  );
}

type BillingButtonProps = {
  accessibilityLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  icon?: AppIconName;
  label: string;
  onPress: () => void;
  size?: 'large' | 'small';
  style?: StyleProp<ViewStyle>;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function BillingButton({
  accessibilityLabel,
  busy = false,
  disabled = false,
  icon,
  label,
  onPress,
  size = 'large',
  style,
  variant = 'primary',
}: BillingButtonProps) {
  const inactive = disabled || busy;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button(variant, size),
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={styles.buttonLabel(variant).color} size="small" />
      ) : icon ? (
        <AppIcon color={styles.buttonLabel(variant).color} name={icon} size={16} />
      ) : null}
      <Text numberOfLines={1} style={styles.buttonLabel(variant)}>{label}</Text>
    </Pressable>
  );
}

export function BillingCard({
  children,
  flush = false,
  style,
  tone,
}: {
  children: React.ReactNode;
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
  tone?: 'alert';
}) {
  return <View style={[styles.card(flush, tone === 'alert'), style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: string }) {
  return <Text accessibilityRole="header" style={styles.sectionLabel}>{children}</Text>;
}

/** Renders text with bold runs (copy built in billing-quote). */
export function BillingRichText({
  segments,
  style,
  boldStyle,
}: {
  segments: RichSegment[];
  style: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={style}>
      {segments.map((segment, index) => (
        typeof segment === 'string'
          ? segment
          : <Text key={index} style={boldStyle ?? styles.bold}>{segment.bold}</Text>
      ))}
    </Text>
  );
}

/** The muted inset row used for notes like the autopay limit. */
export function InfoNote({
  children,
  icon = 'info',
  style,
}: {
  children: React.ReactNode;
  icon?: AppIconName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.note, style]}>
      <AppIcon color={styles.noteIcon.color} name={icon} size={14} />
      <View style={styles.flex}>
        {typeof children === 'string' ? <Text style={styles.noteText}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function KeyValueRows({ rows }: { rows: { icon: AppIconName; label: string; value: string }[] }) {
  return (
    <View style={styles.kvRows}>
      {rows.map((row, index) => (
        <View key={row.label} style={[styles.kvRow, index > 0 && styles.kvDivider]}>
          <AppIcon color={styles.noteIcon.color} name={row.icon} size={14} />
          <Text style={styles.kvLabel}>{row.label}</Text>
          <Text numberOfLines={1} style={styles.kvValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function BillingListRow({
  accessibilityLabel,
  compact = false,
  danger = false,
  leading,
  onPress,
  showChevron,
  showDivider = false,
  subtitle,
  title,
  trailing,
}: {
  accessibilityLabel?: string;
  compact?: boolean;
  danger?: boolean;
  leading?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  showDivider?: boolean;
  subtitle?: string | null;
  title: string;
  trailing?: React.ReactNode;
}) {
  const content = (
    <>
      {leading}
      <View style={styles.flex}>
        <Text numberOfLines={2} style={styles.rowTitle(danger)}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
      {showChevron ?? Boolean(onPress) ? (
        <AppIcon color={styles.chevron.color} name="chevron-right" size={16} />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View accessible style={[styles.row(compact), showDivider && styles.rowDivider]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row(compact), showDivider && styles.rowDivider, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function CheckCircle({ checked, size = 24 }: { checked: boolean; size?: number }) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.check(checked, size)}>
      {checked ? <AppIcon color={theme.colors.geofence.onFill.enabled} name="check" size={Math.round(size * 0.6)} /> : null}
    </View>
  );
}

export function RadioDot({ selected }: { selected: boolean }) {
  return <View style={styles.radio(selected)} />;
}

export function ProgressBar({ progress, tone }: { progress: number; tone: 'green' | 'amber' }) {
  return (
    <View style={styles.progressTrack}>
      <View style={styles.progressFill(Math.round(Math.min(1, Math.max(0, progress)) * 100), tone)} />
    </View>
  );
}

/** Avatar for a shoe: the child's avatar, or a shoe plate for a spare. */
export function ShoeAvatar({ shoe, size = 34 }: { shoe: BillingShoe; size?: number }) {
  const { theme } = useUnistyles();

  if (!shoe.child) {
    return <IconPlate icon="shoe" size={size} tone="neutral" />;
  }

  return (
    <Avatar
      backgroundColor={theme.colors.avatar.tones[shoe.child.avatarTone]}
      imageUrl={shoe.child.avatarUrl}
      initials={shoe.child.initials}
      size={size}
      textSize={Math.round(size * 0.32)}
    />
  );
}

/** Timeline of dated charges ("When you'll pay"). */
export function ChargeTimeline({ lines }: { lines: ScheduleLineCopy[] }) {
  return (
    <View style={styles.timeline}>
      {lines.map((line, index) => (
        <View
          accessible
          accessibilityLabel={`${line.when}, ${line.title}, ${line.subtitle}, ${line.amount}`}
          key={line.key}
          style={[styles.timelineRow, index > 0 && styles.rowDivider]}
        >
          <View style={styles.timelineDot(line.highlighted)} />
          <View style={styles.flex}>
            <Text style={styles.timelineWhen}>{line.when}</Text>
            <Text style={styles.timelineTitle}>{line.title}</Text>
            <Text style={styles.rowSubtitle}>{line.subtitle}</Text>
          </View>
          <Text style={styles.timelineAmount}>{line.amount}</Text>
        </View>
      ))}
    </View>
  );
}

/** Notice from the "Messages and errors" panel, also used for Home banners. */
export function BillingNoticeBanner({
  actionIcon = 'chevron-right',
  notice,
  onAction,
  onDismiss,
  style,
}: {
  actionIcon?: AppIconName;
  notice: Pick<BillingNotice, 'title' | 'icon' | 'tone' | 'actionLabel'> & { body: string | RichSegment[] };
  onAction?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View accessibilityLiveRegion="polite" style={[styles.banner, style]}>
      <IconPlate icon={notice.icon} tone={notice.tone} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle(false)}>{notice.title}</Text>
        {typeof notice.body === 'string' ? (
          <Text style={styles.rowSubtitle}>{notice.body}</Text>
        ) : (
          <BillingRichText segments={notice.body} style={styles.rowSubtitle} />
        )}
        {notice.actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onAction}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={styles.linkLabel}>{notice.actionLabel}</Text>
            <AppIcon color={styles.linkLabel.color} name={actionIcon} size={14} />
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable accessibilityLabel="Dismiss" accessibilityRole="button" hitSlop={10} onPress={onDismiss}>
          <AppIcon color={styles.chevron.color} name="close" size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function TextLink({ label, muted = false, onPress }: { label: string; muted?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Text style={muted ? styles.mutedLink : styles.linkLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Stack screen with a centred title, a scrolling body and an optional footer
 * pinned to the bottom (the mockups' `.foot`).
 */
export function BillingScreen({
  children,
  footer,
  title,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  title: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rt } = useUnistyles();

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style={rt.themeName === 'dark' ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon color={styles.backIcon.color} name="chevron-left" size={20} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent(footer ? 24 : Math.max(insets.bottom, 16) + 24)}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer(Math.max(insets.bottom, 12))}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function FinePrint({ segments }: { segments: RichSegment[] }) {
  return <BillingRichText boldStyle={styles.fineBold} segments={segments} style={styles.fine} />;
}

/** Bottom sheet on the app's modal recipe (scrim + handle + maxWidth 560). */
export function BillingSheet({
  children,
  onClose,
  visible,
}: {
  children: React.ReactNode;
  onClose: () => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={visible}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.scrim} />
        <View accessibilityViewIsModal style={styles.sheet(Math.max(insets.bottom, 12))}>
          <View style={styles.handle} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

type BillingTextVariant = 'headline' | 'title' | 'body' | 'meta' | 'caption';

/** Text on the shared scale; nest <Bold> for emphasised runs. */
export function BillingText({
  align,
  children,
  style,
  variant = 'body',
}: {
  align?: 'center';
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  variant?: BillingTextVariant;
}) {
  return <Text style={[styles.text(variant), align === 'center' && styles.center, style]}>{children}</Text>;
}

export function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

const styles = StyleSheet.create(theme => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  chip: (backgroundColor: string) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor,
  }),
  chipLabel: (color: string) => ({
    color,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    fontWeight: theme.typography.weight.semibold,
  }),
  plate: (size: number, backgroundColor: string) => ({
    width: size,
    height: size,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor,
  }),
  badge: (size: number) => ({
    width: size,
    height: size,
    borderRadius: theme.radius.cardSmall,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  cardTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.semibold,
  },
  caption: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.medium,
  },
  // Dark mode's primaryGreen is light, so its label needs dark ink: the
  // geofence `onFill.enabled` pair is the same green-fill/ink contrast pair.
  button: (variant: 'primary' | 'secondary' | 'danger', size: 'large' | 'small') => ({
    minHeight: size === 'large' ? 50 : 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.button,
    borderWidth: variant === 'secondary' ? 1 : 0,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: variant === 'primary'
      ? theme.colors.primaryGreen
      : variant === 'danger'
        ? theme.colors.alertBackground
        : theme.colors.surfaceMuted,
  }),
  buttonLabel: (variant: 'primary' | 'secondary' | 'danger') => ({
    color: variant === 'primary'
      ? theme.colors.geofence.onFill.enabled
      : variant === 'danger'
        ? theme.colors.alertText
        : theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.semibold,
  }),
  buttonDisabled: {
    opacity: 0.5,
  },
  card: (flush: boolean, alert: boolean) => ({
    marginTop: theme.spacing[3],
    marginHorizontal: theme.spacing[4],
    padding: flush ? 0 : 14,
    overflow: flush ? 'hidden' as const : 'visible' as const,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: alert ? theme.colors.alertBorder : theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  }),
  sectionLabel: {
    marginTop: theme.spacing[5],
    marginHorizontal: theme.spacing[5],
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    fontWeight: theme.typography.weight.semibold,
    textTransform: 'uppercase',
  },
  bold: {
    color: theme.colors.text,
    fontWeight: theme.typography.weight.semibold,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 10,
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
  },
  noteIcon: {
    color: theme.colors.icon,
  },
  noteText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  kvRows: {
    marginTop: theme.spacing[3],
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 9,
  },
  kvDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  kvLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  kvValue: {
    flex: 1,
    textAlign: 'right',
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
  },
  row: (compact: boolean) => ({
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingHorizontal: 14,
    paddingVertical: compact ? theme.spacing[2] : 10,
  }),
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  rowTitle: (danger: boolean) => ({
    color: danger ? theme.colors.alertText : theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontSize: 14,
    fontWeight: theme.typography.weight.semibold,
  }),
  rowSubtitle: {
    marginTop: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
  },
  chevron: {
    color: theme.colors.textMuted,
  },
  check: (checked: boolean, size: number) => ({
    width: size,
    height: size,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: checked ? theme.colors.primaryGreen : theme.colors.textMuted,
    backgroundColor: checked ? theme.colors.primaryGreen : 'transparent',
  }),
  radio: (selected: boolean) => ({
    width: 20,
    height: 20,
    borderRadius: theme.radius.circle,
    borderWidth: selected ? 6 : 2,
    borderColor: selected ? theme.colors.primaryGreen : theme.colors.textMuted,
  }),
  progressTrack: {
    height: 6,
    marginTop: theme.spacing[2],
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
  },
  progressFill: (percent: number, tone: 'green' | 'amber') => ({
    width: `${percent}%`,
    height: '100%',
    borderRadius: 3,
    backgroundColor: tone === 'green' ? theme.colors.primaryGreen : theme.colors.transitMain,
  }),
  timeline: {
    marginTop: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  timelineDot: (highlighted: boolean) => ({
    width: 12,
    height: 12,
    marginTop: 3,
    borderRadius: theme.radius.circle,
    borderWidth: 2,
    borderColor: highlighted ? theme.colors.primaryGreen : theme.colors.textMuted,
    backgroundColor: highlighted ? theme.colors.primaryGreen : theme.colors.surface,
  }),
  timelineWhen: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  timelineTitle: {
    marginTop: 2,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontSize: 14,
    fontWeight: theme.typography.weight.semibold,
  },
  timelineAmount: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.bold,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: theme.spacing[3],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginTop: 6,
  },
  linkLabel: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontWeight: theme.typography.weight.semibold,
  },
  mutedLink: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    fontWeight: theme.typography.weight.semibold,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[3],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  backIcon: {
    color: theme.colors.icon,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    fontSize: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: (bottom: number) => ({
    paddingBottom: bottom,
  }),
  footer: (bottomInset: number) => ({
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: bottomInset + theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing[2],
    ...theme.shadows.sheet,
  }),
  fine: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    ...theme.typography.tabular,
  },
  fineBold: {
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weight.semibold,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.shadowStrong,
    opacity: 0.32,
  },
  sheet: (bottomInset: number) => ({
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingTop: 10,
    paddingBottom: bottomInset + theme.spacing[4],
    ...theme.shadows.floating,
  }),
  handle: {
    width: 40,
    height: 5,
    marginBottom: 14,
    alignSelf: 'center',
    borderRadius: 3,
    backgroundColor: theme.colors.history.sheetHandle,
  },
  text: (variant: BillingTextVariant) => {
    switch (variant) {
      case 'headline':
        return {
          color: theme.colors.text,
          fontFamily: theme.typography.family.display,
          ...theme.typography.text.title,
          fontWeight: theme.typography.weight.bold,
        };
      case 'title':
        return {
          color: theme.colors.text,
          fontFamily: theme.typography.family.display,
          ...theme.typography.text.titleSmall,
          fontWeight: theme.typography.weight.semibold,
        };
      case 'meta':
        return {
          color: theme.colors.textSecondary,
          fontFamily: theme.typography.family.body,
          ...theme.typography.text.meta,
          ...theme.typography.tabular,
        };
      case 'caption':
        return {
          color: theme.colors.textMuted,
          fontFamily: theme.typography.family.body,
          ...theme.typography.text.caption,
          ...theme.typography.tabular,
          fontWeight: theme.typography.weight.medium,
        };
      case 'body':
      default:
        return {
          color: theme.colors.textSecondary,
          fontFamily: theme.typography.family.body,
          ...theme.typography.text.body,
          ...theme.typography.tabular,
        };
    }
  },
  center: {
    textAlign: 'center',
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));

/** Loading and load-error bodies for billing screens. */
export function BillingLoadState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  if (!error) {
    return (
      <View accessibilityLabel="Loading" style={stateStyles.loading}>
        <ShoeLoader size={64} />
      </View>
    );
  }

  return (
    <View style={stateStyles.error}>
      <BillingNoticeBanner
        notice={describeBillingError(error)}
        onAction={onRetry}
      />
    </View>
  );
}

const stateStyles = StyleSheet.create(theme => ({
  loading: {
    marginTop: theme.spacing[7],
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[4],
  },
}));
