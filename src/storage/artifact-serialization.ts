export function serializeJsonArtifact(payload: unknown, maxBytes: number, label: string) {
  let content: string | undefined;
  try {
    content = JSON.stringify(payload);
  } catch {
    throw new Error(`${label} could not be serialized.`);
  }
  if (typeof content !== "string") {
    throw new Error(`${label} could not be serialized.`);
  }
  const size = new Blob([content]).size;
  if (size > maxBytes) {
    const maxMegabytes = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`${label} exceeds the ${maxMegabytes} MB safety limit. Capture a shorter flow or fewer states.`);
  }
  return { content, size };
}
