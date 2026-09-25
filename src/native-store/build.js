import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform !== 'darwin' || process.arch !== 'arm64' || Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Native store build requires Darwin arm64 Node 24');
const version = execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 }).trim();
if (!/^\d+\.\d+(?:\.\d+)?$/.test(version) || Number(version.split('.')[0]) < 27) throw new Error('Native store build requires macOS >=27.0; older macOS is not qualified');
const here = path.dirname(fileURLToPath(import.meta.url));
const include = process.env.NODE_INCLUDE_DIR ?? '/opt/homebrew/include/node';
if (!existsSync(path.join(include, 'node_api.h'))) throw new Error('Set NODE_INCLUDE_DIR to installed Node 24 headers; no headers are downloaded');
if (!/^#define NODE_MAJOR_VERSION 24$/m.test(readFileSync(path.join(include, 'node_version.h'), 'utf8'))) throw new Error('Installed Node 24 headers required');
mkdirSync(path.join(here, 'build'), { recursive: true });
const result = spawnSync('/usr/bin/cc', ['-arch', 'arm64', '-mmacosx-version-min=27.0', '-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', '-fvisibility=hidden', '-DNAPI_VERSION=8', '-I', include, '-bundle', '-undefined', 'dynamic_lookup', '-o', path.join(here, 'build', 'store-darwin-arm64.node'), path.join(here, 'store.c')], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Native store build failed: ${result.status}`);
console.log('Built macOS >=27.0 arm64 N-API 8 store backend; private local APFS plus process-local operator sync-exclusion attestation required; no power-loss qualification');
