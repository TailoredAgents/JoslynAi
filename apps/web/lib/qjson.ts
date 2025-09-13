export function encodeQjson(items: any[], limit = 12): string {
  const trimmed = Array.isArray(items) ? items.slice(0, limit) : [];
  const json = JSON.stringify(trimmed);
  if (typeof window === "undefined") {
    // @ts-ignore Buffer exists in Node/SSR
    return Buffer.from(json, "utf-8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(json)));
}

