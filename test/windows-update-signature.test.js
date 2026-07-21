const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEMPORARY_WINDOWS_CERTIFICATE,
  createWindowsUpdateSignatureVerifier,
  inspectWindowsSignature,
  installWindowsUpdateSignatureVerifier,
} = require('../src/windows-update-signature');

const installerPath = 'C:\\Downloads\\CrunchyMurmur-win-x64.exe';
const validTemporarySignature = {
  status: 1,
  statusName: 'UnknownError',
  path: installerPath,
  subject: TEMPORARY_WINDOWS_CERTIFICATE.subject,
  thumbprint: TEMPORARY_WINDOWS_CERTIFICATE.thumbprint,
  notBefore: '2026-07-10T00:00:00.000Z',
  notAfter: '2027-07-10T23:59:59.000Z',
};

test('Windows updates accept the pinned temporary signer when only its trust chain is unknown', async () => {
  const verify = createWindowsUpdateSignatureVerifier({
    verifyTrustedSignature: async () => 'publisher validation failed',
    inspectSignature: async () => validTemporarySignature,
    now: () => new Date('2026-07-21T12:00:00.000Z'),
  });

  assert.equal(await verify(['CrunchyMurmur Temporary Self-Signed Publisher'], installerPath), null);
});

test('Windows updates reject a different self-signed certificate', async () => {
  const originalFailure = 'publisher validation failed';
  const verify = createWindowsUpdateSignatureVerifier({
    verifyTrustedSignature: async () => originalFailure,
    inspectSignature: async () => ({ ...validTemporarySignature, thumbprint: '00'.repeat(20) }),
    now: () => new Date('2026-07-21T12:00:00.000Z'),
  });

  assert.equal(await verify(['CrunchyMurmur Temporary Self-Signed Publisher'], installerPath), originalFailure);
});

test('Windows updates preserve the trusted verifier failure for unsafe temporary signatures', async () => {
  const originalFailure = 'publisher validation failed';
  const unsafeSignatures = [
    { ...validTemporarySignature, status: 3, statusName: 'HashMismatch' },
    { ...validTemporarySignature, status: 2, statusName: 'NotSigned' },
    { ...validTemporarySignature, subject: 'CN=Someone Else' },
    { ...validTemporarySignature, path: 'C:\\Downloads\\Different.exe' },
    { ...validTemporarySignature, notAfter: '2026-07-20T23:59:59.000Z' },
    { ...validTemporarySignature, notBefore: '2026-07-22T00:00:00.000Z' },
  ];

  for (const signature of unsafeSignatures) {
    const verify = createWindowsUpdateSignatureVerifier({
      verifyTrustedSignature: async () => originalFailure,
      inspectSignature: async () => signature,
      now: () => new Date('2026-07-21T12:00:00.000Z'),
    });
    assert.equal(await verify(['CrunchyMurmur Temporary Self-Signed Publisher'], installerPath), originalFailure);
  }
});

test('Windows updates keep Electron trusted-signature verification as the primary path', async () => {
  let inspected = false;
  const verify = createWindowsUpdateSignatureVerifier({
    verifyTrustedSignature: async () => null,
    inspectSignature: async () => { inspected = true; },
  });

  assert.equal(await verify(['Future Trusted Publisher'], installerPath), null);
  assert.equal(inspected, false);
});

test('Windows signature inspection asks PowerShell for bounded certificate metadata', async () => {
  let invocation;
  const inspected = await inspectWindowsSignature("C:\\Downloads\\Owner's update.exe", {
    execFile(command, args, options, callback) {
      invocation = { command, args, options };
      callback(null, JSON.stringify({
        Status: 1,
        StatusName: 'UnknownError',
        Path: "C:\\Downloads\\Owner's update.exe",
        Subject: TEMPORARY_WINDOWS_CERTIFICATE.subject,
        Thumbprint: TEMPORARY_WINDOWS_CERTIFICATE.thumbprint,
        NotBefore: '2026-07-10T00:00:00.000Z',
        NotAfter: '2027-07-10T23:59:59.000Z',
      }), '');
    },
  });

  assert.equal(invocation.command, 'powershell.exe');
  assert.deepEqual(invocation.args.slice(0, 4), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']);
  assert.equal(invocation.args[4], '-EncodedCommand');
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.options.timeout, 15_000);
  assert.deepEqual(inspected, {
    ...validTemporarySignature,
    path: "C:\\Downloads\\Owner's update.exe",
  });
});

test('Windows updater installation wraps its existing trusted verifier', async () => {
  const originalFailure = 'publisher validation failed';
  const updater = {
    verifyUpdateCodeSignature: async () => originalFailure,
  };
  installWindowsUpdateSignatureVerifier(updater, {
    platform: 'win32',
    inspectSignature: async () => validTemporarySignature,
    now: () => new Date('2026-07-21T12:00:00.000Z'),
  });

  assert.equal(await updater.verifyUpdateCodeSignature([], installerPath), null);
});
