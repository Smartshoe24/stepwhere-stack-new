type BackgroundTaskState = {
  consecutiveFailures: number;
  running: boolean;
};

type BackgroundTaskOptions = {
  preventOverlap?: boolean;
};

type ScheduledBackgroundTaskOptions = {
  initialDelayMs: number;
  intervalMs: number;
  name: string;
  task: () => Promise<void>;
};

type ErrorRecord = Record<string, unknown>;

const taskStates = new Map<string, BackgroundTaskState>();

export class BackgroundTaskPhaseError extends Error {
  readonly phase: string;

  constructor(phase: string, cause: unknown) {
    super(
      cause instanceof Error ? cause.message : "Background task phase failed.",
      {
        cause,
      },
    );
    this.name = "BackgroundTaskPhaseError";
    this.phase = phase;
  }
}

export async function runBackgroundTaskPhase<T>(
  phase: string,
  task: () => Promise<T>,
) {
  try {
    return await task();
  } catch (error) {
    throw new BackgroundTaskPhaseError(phase, error);
  }
}

export function getSafeErrorDetails(error: unknown): ErrorRecord {
  const phaseError = error instanceof BackgroundTaskPhaseError ? error : null;
  const source = phaseError?.cause ?? error;
  const record = isErrorRecord(source) ? source : null;

  return removeUndefinedValues({
    name: source instanceof Error ? source.name : "UnknownError",
    message: source instanceof Error ? source.message : String(source),
    phase: phaseError?.phase,
    code: toSafeString(record?.code),
    severity: toSafeString(record?.severity ?? record?.severity_local),
    routine: toSafeString(record?.routine),
  });
}

export function logBackgroundTaskFailure(input: {
  error: unknown;
  name: string;
  phase?: string;
}) {
  const details = getSafeErrorDetails(input.error);

  console.error("[background-task] task phase failed", {
    task: input.name,
    ...details,
    phase: input.phase ?? details.phase,
  });
}

export async function runBackgroundTask(
  name: string,
  task: () => Promise<void>,
  options: BackgroundTaskOptions = {},
) {
  const preventOverlap = options.preventOverlap ?? true;
  const state = taskStates.get(name) ?? {
    consecutiveFailures: 0,
    running: false,
  };
  taskStates.set(name, state);

  if (preventOverlap && state.running) {
    console.warn("[background-task] skipped overlapping run", { task: name });
    return;
  }

  state.running = true;
  const startedAt = Date.now();

  try {
    await task();

    if (state.consecutiveFailures > 0) {
      console.info("[background-task] task recovered", {
        task: name,
        durationMs: Date.now() - startedAt,
        previousConsecutiveFailures: state.consecutiveFailures,
      });
    }

    state.consecutiveFailures = 0;
  } catch (error) {
    state.consecutiveFailures += 1;
    console.error("[background-task] task failed", {
      task: name,
      durationMs: Date.now() - startedAt,
      consecutiveFailures: state.consecutiveFailures,
      ...getSafeErrorDetails(error),
    });
  } finally {
    state.running = false;
  }
}

export function detachBackgroundTask(
  name: string,
  task: () => Promise<void>,
  options: BackgroundTaskOptions = {},
) {
  runBackgroundTask(name, task, options).catch((error) => {
    // runBackgroundTask is deliberately non-throwing. Keep this final handler so
    // a future regression in the boundary cannot become an unhandled rejection.
    console.error("[background-task] boundary failed", {
      task: name,
      ...getSafeErrorDetails(error),
    });
  });
}

export function scheduleBackgroundTask(
  options: ScheduledBackgroundTaskOptions,
) {
  const scheduleNext = (delayMs: number) => {
    const timer = setTimeout(() => {
      runBackgroundTask(options.name, options.task)
        .then(() => scheduleNext(options.intervalMs))
        .catch((error) => {
          console.error("[background-task] scheduler failed", {
            task: options.name,
            ...getSafeErrorDetails(error),
          });
          scheduleNext(options.intervalMs);
        });
    }, delayMs);

    timer.unref();
  };

  scheduleNext(options.initialDelayMs);
}

function isErrorRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null;
}

function toSafeString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function removeUndefinedValues(record: ErrorRecord) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}
