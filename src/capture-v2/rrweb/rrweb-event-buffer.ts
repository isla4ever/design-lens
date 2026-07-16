export type RrwebEvent = {
  type: number;
  timestamp: number;
  data: unknown;
  [key: string]: unknown;
};

export type RrwebEventSnapshot = {
  events: RrwebEvent[];
  truncated: boolean;
};

export class RrwebEventBuffer {
  private events: RrwebEvent[] = [];
  private didTruncate = false;
  private mutationCount = 0;

  constructor(private readonly maxEvents = 2500, private readonly maxMutations = 10_000) {
    if (!Number.isInteger(maxEvents) || maxEvents < 2) throw new Error("rrweb event limit must be at least 2");
    if (!Number.isInteger(maxMutations) || maxMutations < 1) throw new Error("rrweb mutation limit must be at least 1");
  }

  push(event: RrwebEvent) {
    const mutations = countRrwebMutationOperations(event);
    if (this.events.length >= this.maxEvents || this.mutationCount + mutations > this.maxMutations) {
      this.didTruncate = true;
      return false;
    }
    this.mutationCount += mutations;
    this.events.push(event);
    return true;
  }

  snapshot(): RrwebEventSnapshot {
    return { events: this.events.slice(), truncated: this.didTruncate };
  }

  get length() {
    return this.events.length;
  }
}

export function countRrwebMutationOperations(event: RrwebEvent) {
  if (event.type !== 3 || !event.data || typeof event.data !== "object") return 0;
  const data = event.data as Record<string, unknown>;
  if (data.source !== 0) return 0;
  return ["texts", "attributes", "removes", "adds"].reduce((total, key) => {
    const value = data[key];
    return total + (Array.isArray(value) ? value.length : 0);
  }, 0);
}
