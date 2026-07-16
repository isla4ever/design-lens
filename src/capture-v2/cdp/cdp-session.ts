export type CdpTarget = { tabId: number };
export type CdpCommand = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;

export type CdpTransport = {
  attach: (target: CdpTarget, protocolVersion: string) => Promise<void>;
  detach: (target: CdpTarget) => Promise<void>;
  sendCommand: <T = unknown>(target: CdpTarget, method: string, params?: Record<string, unknown>) => Promise<T>;
  onDetach: {
    addListener: (listener: (target: CdpTarget, reason: string) => void) => void;
    removeListener: (listener: (target: CdpTarget, reason: string) => void) => void;
  };
};

export async function withCdpSession<T>(
  transport: CdpTransport,
  tabId: number,
  run: (command: CdpCommand) => Promise<T>,
  timeoutMs = 5000
) {
  const target = { tabId };
  let attached = false;
  let detachedReason: string | undefined;
  let detachedError: Error | undefined;
  let rejectDetached: (error: Error) => void = () => undefined;
  const detached = new Promise<never>((_resolve, reject) => {
    rejectDetached = reject;
  });
  void detached.catch(() => undefined);
  const onDetach = (source: CdpTarget, reason: string) => {
    if (source.tabId !== tabId) return;
    detachedReason = reason;
    detachedError = new Error(`Chrome debugger detached: ${reason}`);
    rejectDetached(detachedError);
  };
  transport.onDetach.addListener(onDetach);

  try {
    const attachPromise = transport.attach(target, "1.3");
    try {
      await withTimeout(attachPromise, timeoutMs, "Chrome debugger attach timed out");
    } catch (error) {
      void attachPromise.then(() => transport.detach(target).catch(() => undefined), () => undefined);
      throw error;
    }
    attached = true;
    const command: CdpCommand = <T = unknown>(method: string, params?: Record<string, unknown>) => withTimeout(
      Promise.race([transport.sendCommand<T>(target, method, params), detached]),
      timeoutMs,
      `CDP command timed out: ${method}`
    );
    const result = await run(command);
    if (detachedError) throw detachedError;
    return result;
  } finally {
    transport.onDetach.removeListener(onDetach);
    if (attached && !detachedReason) {
      await withTimeout(transport.detach(target), timeoutMs, "Chrome debugger detach timed out").catch(() => undefined);
    }
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
