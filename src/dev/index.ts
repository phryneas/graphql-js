export function instanceOf(value: unknown, constructor: Constructor): boolean {
  return value instanceof constructor;
}

interface Constructor {
  prototype: {
    [Symbol.toStringTag]: string;
  };
  new (...args: Array<any>): any;
}
