import assert from 'node:assert';

/* eslint-disable n/no-missing-import */
import main from './dist/main.cjs';
/* eslint-enable n/no-missing-import */

assert.deepStrictEqual(main.result, {
  data: {
    __proto__: null,
    hello: 'world',
  },
});

console.log('Test script: Got correct result from Webpack bundle!');
