import type { SmartCaptureBudgetSummary, SmartCaptureSafetyLevel } from "./types";

const LONG_TASK_DEGRADE_MS = 50;
const EXTREME_TASK_MS = 200;
const MUTATION_SOFT_LIMIT = 750;
const MUTATION_HARD_LIMIT = 10_000;
const MUTATION_STORM_RATE = 500;
const MUTATION_STORM_WINDOWS = 2;
const SAFETY_LEVEL_ORDER: Record<SmartCaptureSafetyLevel, number> = {
  normal: 0,
  reduced: 1,
  "snapshot-only": 2,
  stopped: 3
};

export class CaptureBudgetGuard {
  private longTaskObserver: PerformanceObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private readonly reasons = new Set<string>();
  private longTaskCount = 0;
  private maxLongTaskMs = 0;
  private mutationCount = 0;
  private mutationWindowCount = 0;
  private mutationWindowStartedAt = 0;
  private observationStartedAt = 0;
  private stormWindows = 0;
  private mutationStorm = false;
  private safetyLevel: SmartCaptureSafetyLevel = "normal";

  constructor(
    private readonly doc: Document,
    private readonly win: Window,
    private readonly onSafetyLevelChange?: (level: SmartCaptureSafetyLevel, reason: string) => void
  ) {}

  start() {
    this.observationStartedAt = this.win.performance.now();
    this.mutationWindowStartedAt = this.observationStartedAt;
    this.startLongTaskObserver();
    this.mutationObserver = new MutationObserver((records) => this.recordMutations(records.length));
    this.mutationObserver.observe(this.doc.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-state", "aria-expanded", "aria-hidden"],
      childList: true,
      subtree: true
    });
  }

  stop(): SmartCaptureBudgetSummary {
    this.longTaskObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.longTaskObserver = null;
    this.mutationObserver = null;
    return this.snapshot();
  }

  markDegraded(reason: string, level: SmartCaptureSafetyLevel = "reduced") {
    this.reasons.add(reason);
    if (SAFETY_LEVEL_ORDER[level] <= SAFETY_LEVEL_ORDER[this.safetyLevel]) return;
    this.safetyLevel = level;
    this.onSafetyLevelChange?.(level, reason);
  }

  isDegraded() {
    return this.reasons.size > 0;
  }

  getSafetyLevel() {
    return this.safetyLevel;
  }

  snapshot(): SmartCaptureBudgetSummary {
    return {
      degraded: this.isDegraded(),
      safetyLevel: this.safetyLevel,
      reasons: Array.from(this.reasons),
      longTaskCount: this.longTaskCount,
      maxLongTaskMs: Math.round(this.maxLongTaskMs),
      mutationCount: this.mutationCount,
      mutationStorm: this.mutationStorm
    };
  }

  private startLongTaskObserver() {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.startTime < this.observationStartedAt) continue;
          this.longTaskCount += 1;
          this.maxLongTaskMs = Math.max(this.maxLongTaskMs, entry.duration);
          if (entry.duration >= LONG_TASK_DEGRADE_MS) this.markDegraded("long-task", "reduced");
          if (entry.duration >= EXTREME_TASK_MS) this.markDegraded("extreme-long-task", "stopped");
        }
      });
      this.longTaskObserver.observe({ type: "longtask", buffered: true });
    } catch {
      this.longTaskObserver = null;
    }
  }

  private recordMutations(count: number) {
    this.mutationCount += count;
    this.mutationWindowCount += count;
    if (this.mutationCount >= MUTATION_SOFT_LIMIT) this.markDegraded("high-mutation-volume", "reduced");
    if (this.mutationCount >= MUTATION_HARD_LIMIT) {
      this.markDegraded("mutation-hard-limit", "stopped");
      this.mutationObserver?.disconnect();
      return;
    }

    const now = this.win.performance.now();
    const elapsed = now - this.mutationWindowStartedAt;
    if (elapsed < 1_000) return;
    const rate = (this.mutationWindowCount / Math.max(1, elapsed)) * 1_000;
    this.stormWindows = rate > MUTATION_STORM_RATE ? this.stormWindows + 1 : 0;
    this.mutationWindowCount = 0;
    this.mutationWindowStartedAt = now;
    if (this.stormWindows >= MUTATION_STORM_WINDOWS) {
      this.mutationStorm = true;
      this.markDegraded("mutation-storm", "snapshot-only");
      this.mutationObserver?.disconnect();
    }
  }
}
