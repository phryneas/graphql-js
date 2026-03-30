/* eslint-disable no-await-in-loop */

// declaring a few types this old TS version doesn't know about
declare global {
  interface AbortSignal {
    readonly aborted: boolean;
    throwIfAborted: () => void;
  }
}
declare const performance: {
  now: () => number;
};

declare class MessageChannel {
  port1: {
    onmessage: (() => any) | null;
    close?: () => void;
  };

  port2: {
    postMessage: (message: any) => void;
  };
}
// for eslint to recognize the global type
type AbortSignal = globalThis.AbortSignal;

interface ScheduleSignal
  extends Pick<AbortSignal, 'aborted' | 'throwIfAborted'> {
  shouldYield: boolean;
  bump: () => void;
}

type Command =
  | { kind: 'yield' }
  | {
      kind: 'execute';
      fn: (...args: Array<unknown>) => unknown;
      args: Array<unknown>;
      this?: unknown;
      startImmediately?: boolean;
    };

export type SchedulableIterable<T> = Generator<Command, T>;

const yieldNow: Command = { kind: 'yield' };

export const scheduler = {
  yieldNow,
  execute<Ret, Args extends Array<unknown>, ThisArg>(
    fn: (...args: Args) => Ret,
    thisArg: ThisArg,
    args: Args,
    startImmediately = false,
  ): SchedulableIterable<Ret> {
    return (function* executeCommand(): Generator<Command, Ret> {
      const result = yield {
        kind: 'execute' as const,
        fn: fn as any,
        args,
        this: thisArg,
        startImmediately,
      };
      return result as Ret;
    })();
  },
  getSignal(): ScheduleSignal {
    const returnedSignal = signal ?? syncSignal;
    returnedSignal.throwIfAborted();
    return returnedSignal;
  },
};

let signal: ScheduleSignal | null = null;
const syncSignal: ScheduleSignal = {
  shouldYield: false,
  aborted: false,
  throwIfAborted() {
    /** */
  },
  bump() {
    /** */
  },
};

const schedulableImplementationSignal = Symbol();
export interface SchedulableFunction<
  Ret,
  Args extends Array<unknown> = [],
  ThisArg = unknown,
> {
  (this: ThisArg, ...args: Args): Ret;
  sync: (this: ThisArg, ...args: Args) => Ret;
  [schedulableImplementationSignal]: (
    this: ThisArg,
    ...args: Args
  ) => SchedulableIterable<Ret>;
}

export function asSchedulable<Ret, Args extends Array<unknown>, ThisArg>(
  fn: (this: ThisArg, ...args: Args) => Ret,
  schedulableImplementation: (
    this: ThisArg,
    ...args: Args
  ) => SchedulableIterable<Ret>,
): asserts fn is SchedulableFunction<Ret, Args, ThisArg> {
  Object.defineProperty(fn, schedulableImplementationSignal, {
    value: schedulableImplementation,
    enumerable: false,
  });
  Object.defineProperty(fn, 'sync', {
    value(this: ThisArg, ...args: Args) {
      return syncScheduler(schedulableImplementation.apply(this, args));
    },
    enumerable: false,
  });
}

export function makeSchedulable<
  Ret,
  Args extends Array<unknown> = [],
  ThisArg = unknown,
>(
  schedulableImplementation: (
    this: ThisArg,
    ...args: Args
  ) => SchedulableIterable<Ret>,
): SchedulableFunction<Ret, Args, ThisArg> {
  const schedulable = function schedulable(this: ThisArg, ...args: Args) {
    return syncScheduler(schedulableImplementation.apply(this, args));
  };
  asSchedulable(schedulable, schedulableImplementation);
  return schedulable;
}

function isSchedulableFunction<Ret, Args extends Array<unknown>>(
  fn: unknown,
): fn is SchedulableFunction<Ret, Args> {
  return typeof fn === 'function' && schedulableImplementationSignal in fn;
}

export function syncScheduler<T>(iterable: SchedulableIterable<T>): T {
  const previousSignal = signal;
  try {
    signal = syncSignal;
    const iterator = iterable[Symbol.iterator]();
    let nextArg: unknown;
    do {
      const result = iterator.next(nextArg);
      nextArg = undefined;
      if (result.done) {
        return result.value;
      }
      switch (result.value.kind) {
        case 'yield': {
          break;
        }
        case 'execute': {
          const { fn, args, this: thisArg } = result.value;
          nextArg = isSchedulableFunction(fn)
            ? syncScheduler(fn[schedulableImplementationSignal](...args))
            : fn.apply(thisArg, args);
          break;
        }
      }
      // eslint-disable-next-line no-constant-condition
    } while (true);
  } finally {
    signal = previousSignal;
  }
}

export function runWithScheduler<Ret, Args extends Array<unknown>>(
  fn: ((..._: Args) => Ret) | SchedulableFunction<Ret, Args>,
  args: Args,
  abortSignal?: AbortSignal | ScheduleSignal,
): Promise<Ret> {
  if (!isSchedulableFunction(fn)) {
    // eslint-disable-next-line no-undef, no-console
    console?.warn('Running a non-schedulable function with runWithScheduler!');
    return Promise.resolve().then(() => fn(...args));
  }
  return chunkedScheduler(
    fn[schedulableImplementationSignal](...args),
    abortSignal,
  ) as Promise<Ret>;
}

function chunkedScheduler<T>(
  iterable: SchedulableIterable<T>,
  abortSignal?: AbortSignal | ScheduleSignal,
): Promise<T> {
  let scheduleSignal: ScheduleSignal;
  if (abortSignal && 'shouldYield' in abortSignal) {
    scheduleSignal = abortSignal;
  } else {
    let nextYield = performance.now() + 16;
    scheduleSignal = {
      get aborted() {
        return abortSignal?.aborted ?? false;
      },
      throwIfAborted() {
        abortSignal?.throwIfAborted();
      },
      get shouldYield() {
        abortSignal?.throwIfAborted();
        return performance.now() >= nextYield;
      },
      bump() {
        nextYield = performance.now() + 16;
      },
    };
  }

  let continueLoop = () => {
    /* */
  };
  return new Promise<T>((resolve, reject) => {
    const mainLoop = iterate();
    continueLoop = () => {
      mainLoop
        .next()
        .then((result) => {
          if (result.done) {
            resolve(result.value);
          }
        })
        .catch(reject);
    };
    continueLoop();
  });

  async function* iterate(): AsyncGenerator<void, T> {
    const iterator = iterable[Symbol.iterator]();
    let nextArg: unknown;
    do {
      let result: IteratorResult<Command, T>;
      const previousSignal = signal;
      try {
        signal = scheduleSignal;
        result = iterator.next(nextArg);
        nextArg = undefined;
      } finally {
        signal = previousSignal;
      }
      if (result.done) {
        return result.value as Awaited<T>;
      }
      switch (result.value.kind) {
        case 'yield': {
          schedule(continueLoop);
          yield;
          scheduleSignal.bump();
          break;
        }
        case 'execute': {
          const { fn, args, this: thisArg, startImmediately } = result.value;
          if (!startImmediately && scheduleSignal.shouldYield) {
            schedule(continueLoop);
            yield;
            scheduleSignal.bump();
          }
          if (isSchedulableFunction(fn)) {
            nextArg = await chunkedScheduler(
              fn[schedulableImplementationSignal](...args),
              scheduleSignal,
            );
            // we are just back from an async call, so we don't need to yield again for a while
            scheduleSignal.bump();
          } else {
            nextArg = fn.apply(thisArg, args);
          }
          continue;
        }
      }
    } while (true);
  }
}

function schedule(fn: () => void) {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => {
    port1.close?.();
    fn();
  };
  port2.postMessage(null);
}
