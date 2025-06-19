# Integration Tests

This directory contains integration tests for GraphQL.js across different environments and bundlers, testing basic GraphQL.JS functionality, as well as development mode and production mode behavior.

Tests are run via the main integration test suite in `resources/integration-test.ts`.

## Test Structure

### Basic GraphQL.JS Functionality Tests

Each subdirectory represents a different environment/bundler:

- `node` - tests for supported Node.js versions
- `ts` - tests for supported Typescript versions
- `webpack` - tests for Webpack

### Verifying Development Mode Tests

Each subdirectory represents a different environment/bundler demonstrating enabling development mode via conditional exports or by explicitly importing `graphql/dev`:

- `dev-bun/`: via `bun --conditions=development test.js`
- `dev-deno-implicit`: via `deno run --unstable-node-conditions=development test.js`
- `dev-deno-explicit`: via `import 'graphql/dev'`
- `dev-node-implicit`: via `node --conditions=development test.js`
- `dev-node-explicit`: via `import 'graphql/dev'`
- `dev-webpack`: via `{resolve: { conditionNames: ['development'] } }`
- `dev-rspack`: via `{resolve: { conditionNames: ['development'] } }`
- `dev-esbuild`: via `esbuild --conditions=development test.js`
- `dev-rollup`: via `@rollup/plugin-node-resolve` with `conditions: ['development']`
- `dev-swc`: via `import 'graphql/dev'`
- `dev-vitest`: via `resolve.conditions: ['development']`
- `dev-jest`: via `testEnvironmentOptions.customExportConditions: ['development']` and `@swc/jest` transform

### Verifying Production Mode Tests

Each subdirectory represents a different environment/bundler demonstrating production mode when development mode is not enabled:

- `prod-bun/`: via `bun test.js`
- `prod-deno`: via `deno run test.js`
- `prod-node`: via `node test.js`
- `prod-webpack`: via default Webpack configuration
- `prod-rspack`: via default Rspack configuration
- `prod-esbuild`: via `esbuild test.js`
- `prod-rollup`: via default Rollup configuration
- `prod-swc`: via default SWC configuration
