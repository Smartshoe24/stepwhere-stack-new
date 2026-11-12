import { Image } from "expo-image";

import React from "react";
import { StyleSheet as RNStyleSheet, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { ActivityInsightBannerDto } from "@stepwhere/types";

import { AppIcon, type AppIconName } from "@/components/ui/app-icon";

const lightActiveBannerSource = require("../../../assets/images/activity-banner-light-active.png");
const lightInactiveBannerSource = require("../../../assets/images/activity-banner-light-inactive.png");
const darkActiveBannerSource = require("../../../assets/images/activity-banner-dark-active.png");
const darkInactiveBannerSource = require("../../../assets/images/activity-banner-dark-inactive.png");

type ActivityInsightBannerProps = {
  banner: ActivityInsightBannerDto;
};

type BannerTheme = "light" | "dark";

type BannerPalette = {
  title: string;
  value: string;
  shadowColor: string;
  shadowRadius: number;
  accent: Record<ActivityInsightBannerDto["points"][number]["tone"], string>;
  scrim: Record<ActivityInsightBannerDto["mode"], string>;
};

const LIGHT_BANNER_PALETTE: BannerPalette = {
  title: "#FFFFFF",
  value: "#FFFFFF",
  shadowColor: "rgba(0, 0, 0, 0.24)",
  shadowRadius: 5,
  accent: {
    green: "#86EFAC",
    blue: "#93C5FD",
    yellow: "#FCD34D",
  },
  scrim: {
    active: "rgba(10, 18, 38, 0.14)",
    inactive: "rgba(10, 18, 38, 0.22)",
  },
};

const DARK_BANNER_PALETTE: BannerPalette = {
  title: "#172033",
  value: "#334155",
  shadowColor: "rgba(255, 255, 255, 0.35)",
  shadowRadius: 2,
  accent: {
    green: "#15803D",
    blue: "#1D4ED8",
    yellow: "#B45309",
  },
  scrim: {
    active: "rgba(255, 255, 255, 0.08)",
    inactive: "rgba(255, 255, 255, 0.10)",
  },
};

function getBannerSource(
  mode: ActivityInsightBannerDto["mode"],
  bannerTheme: BannerTheme,
) {
  if (bannerTheme === "dark") {
    return mode === "active" ? darkActiveBannerSource : darkInactiveBannerSource;
  }

  return mode === "active" ? lightActiveBannerSource : lightInactiveBannerSource;
}

function getBannerPalette(bannerTheme: BannerTheme) {
  return bannerTheme === "dark" ? DARK_BANNER_PALETTE : LIGHT_BANNER_PALETTE;
}

function getPointIcon(
  point: ActivityInsightBannerDto["points"][number],
): AppIconName {
  switch (point.id) {
    case "more-active":
      return "shoe";
    case "most-active-location":
      return "city";
    case "least-active":
      return "clock";
    case "steps-decrease":
    case "steps-decreased":
      return "shoe";
    default:
      return point.tone === "blue"
        ? "clock"
        : point.tone === "yellow"
          ? "clock"
          : "shoe";
  }
}

function getPointTextAccent(
  tone: ActivityInsightBannerDto["points"][number]["tone"],
  palette: BannerPalette,
) {
  return palette.accent[tone];
}

export function ActivityInsightBanner({ banner }: ActivityInsightBannerProps) {
  const { rt } = useUnistyles();
  const bannerTheme = rt.themeName === "dark" ? "dark" : "light";
  const palette = getBannerPalette(bannerTheme);

  return (
    <View style={styles.container}>
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        contentFit="cover"
        contentPosition="center"
        source={getBannerSource(banner.mode, bannerTheme)}
        style={RNStyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.scrim(banner.mode, palette)} />
      <View style={styles.content}>
        <Text numberOfLines={2} style={styles.title(palette)}>
          {banner.title}
        </Text>
        <View style={styles.metricsRow}>
          {banner.points.map((point, index) => (
            <React.Fragment key={point.id}>
              {/*{index > 0 ? <View style={styles.metricDivider} /> : null}*/}
              <View style={styles.metricItem}>
                <View style={styles.metricIconWrap}>
                  <AppIcon
                    color={getPointTextAccent(point.tone, palette)}
                    name={getPointIcon(point)}
                    size={20}
                  />
                </View>
                <View style={styles.metricCopy}>
                  <Text
                    numberOfLines={1}
                    style={styles.metricLabel(point.tone, palette)}
                  >
                    {point.label}
                  </Text>
                  <Text
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    numberOfLines={1}
                    style={styles.metricValue(palette)}
                  >
                    {point.value}
                  </Text>
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    minHeight: 166,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  scrim: (
    mode: ActivityInsightBannerDto["mode"],
    palette: BannerPalette,
  ) => ({
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: palette.scrim[mode],
  }),
  content: {
    width: "68%",
    minHeight: 166,
    padding: theme.spacing[4],
    justifyContent: "space-between",
    gap: theme.spacing[5],
  },
  title: (palette: BannerPalette) => ({
    color: palette.title,
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: theme.typography.weight.bold,
    textShadowColor: palette.shadowColor,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: palette.shadowRadius,
  }),
  metricsRow: {
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  metricItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  metricCopy: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: (
    tone: ActivityInsightBannerDto["points"][number]["tone"],
    palette: BannerPalette,
  ) => ({
    color: getPointTextAccent(tone, palette),
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  }),
  metricValue: (palette: BannerPalette) => ({
    marginTop: 2,
    color: palette.value,
    fontFamily: theme.typography.family.body,
    fontSize: 10,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  }),
  metricDivider: {
    width: 1,
    height: 44,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
}));
