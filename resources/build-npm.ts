import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { changeExtensionInImportPaths } from './change-extension-in-import-paths.js';
import { inlineInvariant } from './inline-invariant.js';
import {
  prettify,
  readPackageJSON,
  readTSConfig,
  showDirStats,
  writeGeneratedFile,
} from './utils.js';

console.log('\n./npmDist');
await buildPackage('./npmDist');
showDirStats('./npmDist');

async function buildPackage(outDir: string): Promise<void> {
  const devDir = path.join(outDir, '__dev__');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir);
  fs.mkdirSync(devDir);

  fs.copyFileSync('./LICENSE', `${outDir}/LICENSE`);
  fs.copyFileSync('./README.md', `${outDir}/README.md`);

  const packageJSON = readPackageJSON();

  delete packageJSON.private;
  delete packageJSON.scripts;
  delete packageJSON.devDependencies;

  assert(packageJSON.types === undefined, 'Unexpected "types" in package.json');
  const supportedTSVersions = Object.keys(packageJSON.typesVersions);
  assert(
    supportedTSVersions.length === 1,
    'Property "typesVersions" should have exactly one key.',
  );
  // TODO: revisit once TS implements https://github.com/microsoft/TypeScript/issues/32166
  const notSupportedTSVersionFile = 'NotSupportedTSVersion.d.ts';
  fs.writeFileSync(
    path.join(outDir, notSupportedTSVersionFile),
    // Provoke syntax error to show this message
    `"Package 'graphql' support only TS versions that are ${supportedTSVersions[0]}".`,
  );

  packageJSON.typesVersions = {
    ...packageJSON.typesVersions,
    '*': { '*': [notSupportedTSVersionFile] },
  };

  // TODO: move to integration tests
  const publishTag = packageJSON.publishConfig?.tag;
  assert(publishTag != null, 'Should have packageJSON.publishConfig defined!');

  const { version } = packageJSON;
  const versionMatch = /^\d+\.\d+\.\d+-?(?<preReleaseTag>.*)?$/.exec(version);
  if (versionMatch?.groups == null) {
    throw new Error('Version does not match semver spec: ' + version);
  }

  const { preReleaseTag } = versionMatch.groups;

  if (preReleaseTag != null) {
    const splittedTag = preReleaseTag.split('.');
    // Note: `experimental-*` take precedence over `alpha`, `beta` or `rc`.
    const versionTag = splittedTag[2] ?? splittedTag[0];
    assert(
      ['alpha', 'beta', 'rc'].includes(versionTag) ||
        versionTag.startsWith('experimental-'),
      `"${versionTag}" tag is not supported.`,
    );
    assert.equal(
      versionTag,
      publishTag,
      'Publish tag and version tag should match!',
    );
  }
  packageJSON.exports = {};

  const { emittedTSFiles } = emitTSFiles({
    outDir,
    module: 'es2020',
    extension: '.js',
  });

  for (const prodFile of emittedTSFiles) {
    const { dir, base } = path.parse(prodFile);

    const match = base.match(/^([^.]*)\.?(.*)$/);
    assert(match);
    const [, name, ext] = match;

    if (ext === 'js.map') {
      continue;
    } else if (path.basename(dir) === 'dev') {
      packageJSON.exports['./dev'] = './dev/index.js';
      continue;
    }

    const relativePathToProd = crossPlatformRelativePath(prodFile, outDir);
    const relativePathAndName = crossPlatformRelativePath(
      outDir,
      `${dir}/${name}`,
    );

    const lines =
      ext === 'd.ts' ? [] : [`import '${relativePathToProd}/dev/index.js';`];
    lines.push(
      `export * from '${relativePathToProd}/${relativePathAndName}.js';`,
    );
    const body = lines.join('\n');

    writeGeneratedFile(
      path.join(devDir, path.relative(outDir, prodFile)),
      body,
    );

    if (base === 'index.js') {
      const dirname = path.dirname(relativePathAndName);
      packageJSON.exports[dirname === '.' ? dirname : `./${dirname}`] = {
        development: `./__dev__/${relativePathAndName}.js`,
        default: `./${relativePathAndName}.js`,
      };
    }
  }

  // Temporary workaround to allow "internal" imports, no grantees provided
  packageJSON.exports['./*.js'] = {
    development: './__dev__/*.js',
    default: './*.js',
  };
  packageJSON.exports['./*'] = {
    development: './__dev__/*.js',
    default: './*.js',
  };

  packageJSON.sideEffects = [
    ...(packageJSON.sideEffects as Array<string>),
    '__dev__/*',
  ];

  const packageJsonPath = `./${outDir}/package.json`;
  const prettified = await prettify(
    packageJsonPath,
    JSON.stringify(packageJSON),
  );
  // Should be done as the last step so only valid packages can be published
  writeGeneratedFile(packageJsonPath, prettified);
}

// Based on https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#getting-the-dts-from-a-javascript-file
function emitTSFiles(options: {
  outDir: string;
  module: string;
  extension: string;
}): {
  emittedTSFiles: ReadonlyArray<string>;
} {
  const { outDir, module, extension } = options;
  const tsOptions = readTSConfig({
    module,
    noEmit: false,
    declaration: true,
    declarationDir: outDir,
    outDir,
    listEmittedFiles: true,
  });

  const tsHost = ts.createCompilerHost(tsOptions);
  tsHost.writeFile = (filepath, body) => writeGeneratedFile(filepath, body);

  const tsProgram = ts.createProgram(
    ['src/index.ts', 'src/dev/index.ts'],
    tsOptions,
    tsHost,
  );
  const tsResult = tsProgram.emit(undefined, undefined, undefined, undefined, {
    after: [changeExtensionInImportPaths({ extension }), inlineInvariant],
  });
  assert(
    !tsResult.emitSkipped,
    'Fail to generate `*.d.ts` files, please run `npm run check`',
  );

  assert(tsResult.emittedFiles != null);
  return {
    emittedTSFiles: tsResult.emittedFiles.sort((a, b) => a.localeCompare(b)),
  };
}

function crossPlatformRelativePath(from: string, to: string): string {
  const relativePath = path.relative(from, to);
  if (process.platform !== 'win32') {
    return relativePath;
  }
  return path.posix.format({ ...path.parse(relativePath), root: '' });
}
