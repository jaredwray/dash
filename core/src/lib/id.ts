export function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replaceAll("-", "");
  }
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}
