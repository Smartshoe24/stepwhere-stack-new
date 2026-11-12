const { withGradleProperties } = require("@expo/config-plugins");

const GRADLE_MEMORY_PROPERTIES = {
  "org.gradle.jvmargs": "-Xmx6g -XX:MaxMetaspaceSize=2g -Dfile.encoding=UTF-8",
  "org.gradle.workers.max": "4",
};

function upsertGradleProperty(properties, key, value) {
  const existing = properties.find(
    (property) => property.type === "property" && property.key === key,
  );

  if (existing) {
    existing.value = value;
    return;
  }

  properties.push({
    type: "property",
    key,
    value,
  });
}

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (nextConfig) => {
    for (const [key, value] of Object.entries(GRADLE_MEMORY_PROPERTIES)) {
      upsertGradleProperty(nextConfig.modResults, key, value);
    }

    return nextConfig;
  });
};
