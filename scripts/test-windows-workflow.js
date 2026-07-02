'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'windows-build.yml'), 'utf8');

function indexOfRequired(text, needle) {
  const index = text.indexOf(needle);
  assert.notStrictEqual(index, -1, `missing workflow text: ${needle}`);
  return index;
}

const releaseMeta = indexOfRequired(workflow, 'name: Prepare GitHub Release metadata');
const stampVersion = indexOfRequired(workflow, 'name: Stamp Windows package version');
const buildArtifacts = indexOfRequired(workflow, 'name: Build Windows artifacts');

assert.ok(releaseMeta < stampVersion, 'release metadata must be computed before stamping package.json');
assert.ok(stampVersion < buildArtifacts, 'package.json must be stamped before Windows artifacts are built');
assert.ok(workflow.includes('"package_version=$packageVersion"'), 'release metadata must expose the package version');
assert.ok(workflow.includes("$pkg.version = '${{ steps.release_meta.outputs.package_version }}'"), 'stamp step must write the release package version');
assert.ok(workflow.includes("Set-Content -Path package.json"), 'stamp step must persist package.json');
assert.ok(workflow.includes("if ($tag -notmatch '^v\\d+\\.\\d+\\.\\d+-win\\.[1-9]\\d*$')"), 'manual Windows release tags must be validated');

console.log('windows workflow tests passed');
