const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Google Play filters the app out of devices that lack a "required" hardware
 * feature, and it infers requirements the app never wrote down:
 *
 *   android.hardware.screen.portrait  <- `orientation: "portrait"` in app config
 *   android.hardware.wifi             <- the ACCESS_WIFI_STATE permission that a
 *                                        library adds
 *
 * Neither is a real requirement for a phone app. An explicit
 * `<uses-feature android:required="false">` stops Play inferring it.
 *
 * `tools:replace` keeps the build from failing if a library manifest declares
 * the same feature with a conflicting `required` value.
 *
 * This only takes effect through prebuild (EAS runs it on every build).
 * Verify the generated manifest after changing this list.
 */
const OPTIONAL_FEATURES = [
  "android.hardware.screen.portrait",
  "android.hardware.wifi",
];

module.exports = function withOptionalHardwareFeatures(config) {
  return withAndroidManifest(config, (nextConfig) => {
    const manifest = nextConfig.modResults.manifest;

    manifest.$ = manifest.$ ?? {};
    manifest.$["xmlns:tools"] =
      manifest.$["xmlns:tools"] ?? "http://schemas.android.com/tools";

    const features = manifest["uses-feature"] ?? [];

    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find(
        (feature) => feature.$ && feature.$["android:name"] === name,
      );

      if (existing) {
        existing.$["android:required"] = "false";
        existing.$["tools:replace"] = "android:required";
        continue;
      }

      features.push({
        $: {
          "android:name": name,
          "android:required": "false",
          "tools:replace": "android:required",
        },
      });
    }

    manifest["uses-feature"] = features;

    return nextConfig;
  });
};
