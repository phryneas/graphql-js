import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'graphql/dev') {
      return {
        shortCircuit: true,
        url: new URL('../src/dev/index.development.ts', import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});
