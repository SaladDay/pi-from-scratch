export function parseAllowedDevOrigins(value) {
  return (
    value
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}
