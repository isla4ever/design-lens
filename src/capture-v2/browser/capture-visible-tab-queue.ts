export type CaptureVisibleTabQueue = {
  run: <T>(capture: () => Promise<T>) => Promise<T>;
};

export function createCaptureVisibleTabQueue(
  minIntervalMs = 550,
  now: () => number = Date.now,
  wait: (durationMs: number) => Promise<void> = delay
): CaptureVisibleTabQueue {
  let queue: Promise<void> = Promise.resolve();
  let nextCaptureAt = 0;

  return {
    run<T>(capture: () => Promise<T>) {
      const scheduled = queue.then(async () => {
        const waitMs = Math.max(0, nextCaptureAt - now());
        if (waitMs > 0) await wait(waitMs);
        try {
          return await capture();
        } finally {
          nextCaptureAt = now() + minIntervalMs;
        }
      });
      queue = scheduled.then(() => undefined, () => undefined);
      return scheduled;
    }
  };
}

function delay(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}
