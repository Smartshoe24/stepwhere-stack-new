import type { ExpoConfig } from "expo/config";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const APP_VARIANT = process.env.APP_VARIANT ?? "development";
const IS_PRODUCTION = APP_VARIANT === "production";
const EAS_PROJECT_ID =
  process.env.EAS_PROJECT_ID ?? "652fdb22-ac7e-4e6a-9b41-54662c032f6e";
const EXPO_OWNER = process.env.EXPO_OWNER ?? "stepwhere-app";

const GOOGLE_SERVICES_FILE = "./google-services.json";
const IOS_GOOGLE_SERVICES_FILE = IS_PRODUCTION
  ? "./GoogleService-Info.plist"
  : "./GoogleService-Info.dev.plist";

const config: ExpoConfig = {
  name: IS_PRODUCTION ? "Stepwhere" : "Stepwhere Dev",
  slug: "stepwhere-mobile-app",
  version: "2.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: IS_PRODUCTION ? "stepwhere" : ["stepwhere-dev", "stepwhere"],
  userInterfaceStyle: "automatic",
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
  },
  runtimeVersion: {
    policy: "appVersion",
  },

  ios: {
    associatedDomains: IS_PRODUCTION
      ? ["applinks:share.stepwhere.in"]
      : undefined,
    icon: "./assets/images/icon.png",
    bundleIdentifier: IS_PRODUCTION ? "com.stepwhere" : "com.stepwhere.dev",
    googleServicesFile: IOS_GOOGLE_SERVICES_FILE,
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Stepwhere displays location reported by your linked shoe on the map. Your iPhone’s location is not collected or used for child tracking.",
    },
  },

  android: {
    version: "2.0.0-preview.5",
    // Play review treats these as sensitive, and nothing in the app uses them.
    // RECORD_AUDIO arrives via expo-image-picker's plugin; SYSTEM_ALERT_WINDOW is
    // boilerplate from Expo's bare template ("OPTIONAL PERMISSIONS, REMOVE
    // WHATEVER YOU DO NOT NEED"). A child-tracking app asking for the microphone
    // or draw-over-other-apps with no matching feature invites rejection.
    //
    // These only take effect through prebuild. `android/` is gitignored build
    // output, so a stale copy silently ships the unblocked permissions — verify
    // the generated manifest after changing this list.
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
    adaptiveIcon: {
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    googleServicesFile: GOOGLE_SERVICES_FILE,
    predictiveBackGestureEnabled: false,
    package: IS_PRODUCTION ? "com.stepwhere" : "com.stepwhere.dev",
    intentFilters: IS_PRODUCTION
      ? [
          {
            action: "VIEW",
            autoVerify: true,
            data: [
              {
                scheme: "https",
                host: "share.stepwhere.in",
                pathPrefix: "/family/join",
              },
            ],
            category: ["BROWSABLE", "DEFAULT"],
          },
        ]
      : undefined,
  },

  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },

  plugins: [
    "expo-router",
    "./plugins/with-gradle-memory",
    "react-native-nitro-google-signin",
    [
      "react-native-maps",
      {
        iosGoogleMapsApiKey: GOOGLE_MAPS_API_KEY,
        androidGoogleMapsApiKey: GOOGLE_MAPS_API_KEY,
      },
    ],
    "expo-secure-store",
    [
      "expo-camera",
      {
        cameraPermission: "Allow StepWhere to scan your child's shoe QR code.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-image-picker",
      {
        cameraPermission: "Allow StepWhere to take a profile photo.",
        microphonePermission: false,
        photosPermission:
          "Allow StepWhere to choose a profile photo from your library.",
      },
    ],
    "@react-native-community/datetimepicker",
    [
      "expo-notifications",
      {
        sounds: ["./assets/alertnotification.wav"],
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#FFFFFF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 160,
        resizeMode: "contain",
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    router: {},
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },

  owner: EXPO_OWNER,
};

export default config;
