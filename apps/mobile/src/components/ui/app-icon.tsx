import FontAwesome5, {
  type FontAwesome5SolidIconName,
} from "@react-native-vector-icons/fontawesome5";
import FontAwesome6, {
  type FontAwesome6SolidIconName,
} from "@react-native-vector-icons/fontawesome6";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import React from "react";
import { View, type TextStyle } from "react-native";

export type AppIconName =
  | "account-plus"
  | "account-switch"
  | "activity"
  | "arrow-left"
  | "battery"
  | "battery-empty"
  | "battery-full"
  | "battery-low"
  | "battery-medium"
  | "battery-unknown"
  | "bell"
  | "calendar"
  | "camera"
  | "cellphone"
  | "city"
  | "check"
  | "close"
  | "chat"
  | "clock"
  | "copy"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "email"
  | "exclamation"
  | "family"
  | "flash"
  | "flash-off"
  | "geofence"
  | "help"
  | "home"
  | "id-card"
  | "image"
  | "info"
  | "keypad"
  | "layers"
  | "logs"
  | "logout"
  | "pencil"
  | "navigation"
  | "plus"
  | "profile"
  | "qrcode"
  | "scan"
  | "save"
  | "share"
  | "shoe"
  | "shield"
  | "shield-half"
  | "shield-check"
  | "shield-cross"
  | "shield-off"
  | "shield-sleep"
  | "shield-sync"
  | "signal"
  | "signal-none"
  | "signal-one"
  | "signal-three"
  | "signal-two"
  | "target"
  | "trash"
  | "user"
  | "walk"
  | "children"
  | "shield-alt"
  | "sun"
  | "moon";

const materialIconMap: Record<
  Exclude<AppIconName, "children" | "shield-alt">,
  React.ComponentProps<typeof MaterialCommunityIcons>["name"]
> = {
  "account-plus": "account-plus-outline",
  "account-switch": "account-switch-outline",
  activity: "chart-bar",
  "arrow-left": "arrow-left",
  battery: "battery-high",
  "battery-empty": "battery-10",
  "battery-full": "battery-high",
  "battery-low": "battery-20",
  "battery-medium": "battery-50",
  "battery-unknown": "battery-outline",
  bell: "bell-outline",
  calendar: "calendar-month-outline",
  camera: "camera-outline",
  cellphone: "cellphone",
  city: "city",
  check: "check",
  close: "close",
  chat: "message-outline",
  clock: "clock-outline",
  copy: "content-copy",
  "chevron-down": "chevron-down",
  "chevron-left": "chevron-left",
  "chevron-right": "chevron-right",
  "chevron-up": "chevron-up",
  email: "email-outline",
  exclamation: "exclamation-thick",
  family: "account-group-outline",
  flash: "flash-outline",
  "flash-off": "flash-off",
  geofence: "map-marker-radius-outline",
  help: "help-circle",
  home: "home-variant-outline",
  "id-card": "card-account-details-outline",
  image: "image-outline",
  info: "information-outline",
  keypad: "dialpad",
  layers: "layers-outline",
  logs: "clipboard-text-outline",
  logout: "logout",
  pencil: "pencil-outline",
  navigation: "navigation-variant",
  plus: "plus",
  profile: "account-circle-outline",
  qrcode: "qrcode-scan",
  scan: "line-scan",
  save: "content-save",
  share: "share-variant-outline",
  shoe: "shoe-sneaker",
  shield: "shield-check-outline",
  "shield-half": "shield-half-full",
  "shield-check": "shield-check",
  "shield-cross": "shield-cross-outline",
  "shield-off": "shield-off-outline",
  "shield-sleep": "shield-moon-outline",
  "shield-sync": "shield-sync-outline",
  signal: "signal",
  "signal-none": "signal-cellular-outline",
  "signal-one": "signal-cellular-1",
  "signal-three": "signal-cellular-3",
  "signal-two": "signal-cellular-2",
  sun: "weather-sunny",
  target: "crosshairs-gps",
  trash: "trash-can-outline",
  user: "account-outline",
  walk: "walk",
  moon: "weather-night",
};

const fontAwesome6IconMap: Record<"children", FontAwesome6SolidIconName> = {
  children: "children",
};

const fontAwesome5IconMap: Record<"shield-alt", FontAwesome5SolidIconName> = {
  "shield-alt": "shield-alt",
};

type AppIconProps = {
  color: string;
  name: AppIconName;
  size: number;
};

function getIconTextStyle(size: number, width: number): TextStyle {
  return {
    width,
    height: size,
    lineHeight: size,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  };
}

export function AppIcon({ color, name, size }: AppIconProps) {
  const frameStyle = {
    width: size,
    height: size,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  if (name === "shield-alt")
    return (
      <View style={frameStyle}>
        <FontAwesome5
          color={color}
          iconStyle="solid"
          name={fontAwesome5IconMap[name]}
          size={size}
          style={getIconTextStyle(size, size * 1.25)}
        />
      </View>
    );
  if (name === "children") {
    return (
      <View style={frameStyle}>
        <FontAwesome6
          color={color}
          iconStyle="solid"
          name={fontAwesome6IconMap[name]}
          size={size}
          style={getIconTextStyle(size, size * 1.25)}
        />
      </View>
    );
  }
  return (
    <View style={frameStyle}>
      <MaterialCommunityIcons
        color={color}
        name={materialIconMap[name]}
        size={size}
        style={getIconTextStyle(size, size)}
      />
    </View>
  );
}
