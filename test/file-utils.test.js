const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { atomicWriteFileSync, safeChildPath } = require('../src/file-utils');

test('safeChildPath contains paths under the requested root', () => {
  const root = path.join(os.tmpdir(), 'crunchymurmur-root');
  assert.equal(safeChildPath(root, 'Inbox', 'note.md'), path.join(root, 'Inbox', 'note.md'));
  for (const segment of ['..', '.', '../escape', 'nested/name', 'nested\\name', '']) {
    assert.throws(() => safeChildPath(root, segment), /invalid|single path component/i);
  }
});

test('atomicWriteFileSync replaces content without leaving temp files', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-atomic-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'data.json');
  atomicWriteFileSync(filename, '{"version":1}', 'utf8');
  atomicWriteFileSync(filename, '{"version":2}', 'utf8');
  assert.equal(fs.readFileSync(filename, 'utf8'), '{"version":2}');
  assert.deepEqual(fs.readdirSync(dir), ['data.json']);
});
