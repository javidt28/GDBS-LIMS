const TIME_ZONE = "America/Grenada";

export function formatDate(value?: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }).format(value);
}

export function formatDateTime(value?: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(value);
}

export function humanize(value?: string | null) {
  if (!value) return null;
  const text = value.replaceAll("_", " ").replaceAll(".", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
