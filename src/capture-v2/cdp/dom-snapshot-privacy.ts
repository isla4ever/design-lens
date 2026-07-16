type JsonObject = Record<string, unknown>;

export function sanitizeDomSnapshot(value: unknown) {
  const snapshot = structuredClone(value) as JsonObject;
  const strings = Array.isArray(snapshot.strings) ? snapshot.strings as unknown[] : [];
  const documents = Array.isArray(snapshot.documents) ? snapshot.documents as JsonObject[] : [];

  for (const document of documents) {
    const nodes = isObject(document.nodes) ? document.nodes : undefined;
    if (!nodes) continue;
    const nodeNames = Array.isArray(nodes.nodeName) ? nodes.nodeName as number[] : [];
    const attributes = Array.isArray(nodes.attributes) ? nodes.attributes as unknown[][] : [];

    for (let index = 0; index < attributes.length; index += 1) {
      const tagName = readString(strings, nodeNames[index]).toUpperCase();
      if (!FORM_TAGS.has(tagName)) continue;
      const pairs = attributes[index];
      if (!Array.isArray(pairs)) continue;
      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 2) {
        const nameIndex = pairs[pairIndex];
        const valueIndex = pairs[pairIndex + 1];
        if (typeof nameIndex === "number" && typeof valueIndex === "number" && readString(strings, nameIndex).toLowerCase() === "value") {
          strings[valueIndex] = "***";
        }
      }
    }

    maskRareStringData(nodes.inputValue, strings);
    maskRareStringData(nodes.textValue, strings);
  }
  return snapshot;
}

const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION"]);

function maskRareStringData(value: unknown, strings: unknown[]) {
  if (!isObject(value) || !Array.isArray(value.value)) return;
  for (const stringIndex of value.value) {
    if (typeof stringIndex === "number") strings[stringIndex] = "***";
  }
}

function readString(strings: unknown[], index: number | undefined) {
  return typeof index === "number" && typeof strings[index] === "string" ? strings[index] : "";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
