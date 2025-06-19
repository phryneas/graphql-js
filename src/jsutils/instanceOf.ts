/**
 * "src/development.ts" includes an additional check for development mode
 * which throws on multiple versions of graphql-js.
 *
 * This additional check will be included:
 * 1. if 'graphql/dev' is imported explicitly prior to all
 *    other imports from this library, or
 * 2. if the "development" condition is set.
 */
const check: (_value: unknown, _constructor: Constructor) => void =
  (globalThis as any)[Symbol.for('graphql.instanceOfCheck')] ??
  ((_value: unknown, _constructor: Constructor) => {
    /* no-op */
  });

export function instanceOf(value: unknown, constructor: Constructor): boolean {
  if (value instanceof constructor) {
    return true;
  }
  check(value, constructor);
  return false;
}

export interface Constructor {
  prototype: {
    [Symbol.toStringTag]: string;
  };
  new (...args: Array<any>): any;
}
