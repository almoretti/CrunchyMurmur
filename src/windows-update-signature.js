const TEMPORARY_WINDOWS_CERTIFICATE = Object.freeze({
  subject: 'CN=CrunchyMurmur Temporary Self-Signed Publisher',
  thumbprint: '44C466EA973008A8D4C3B18775795AC9549810F2',
});

function inspectWindowsSignature(filePath, { execFile = require('node:child_process').execFile } = {}) {
  const quotedPath = String(filePath).replaceAll("'", "''");
  const script = [
    `$signature = Get-AuthenticodeSignature -LiteralPath '${quotedPath}'`,
    '$certificate = $signature.SignerCertificate',
    '[PSCustomObject]@{',
    '  Status = [int]$signature.Status',
    '  StatusName = $signature.Status.ToString()',
    '  Path = $signature.Path',
    '  Subject = if ($certificate) { $certificate.Subject } else { $null }',
    '  Thumbprint = if ($certificate) { $certificate.Thumbprint } else { $null }',
    "  NotBefore = if ($certificate) { $certificate.NotBefore.ToUniversalTime().ToString('o') } else { $null }",
    "  NotAfter = if ($certificate) { $certificate.NotAfter.ToUniversalTime().ToString('o') } else { $null }",
    '} | ConvertTo-Json -Compress',
  ].join('\n');
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedCommand,
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 15_000,
      windowsHide: true,
    }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        const result = JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim());
        resolve({
          status: result.Status,
          statusName: result.StatusName,
          path: result.Path,
          subject: result.Subject,
          thumbprint: result.Thumbprint,
          notBefore: result.NotBefore,
          notAfter: result.NotAfter,
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function normalizeWindowsPath(value) {
  return String(value || '').replaceAll('/', '\\').toLowerCase();
}

function isPinnedTemporarySignature(signature, filePath, now = new Date()) {
  if (!signature || Number(signature.status) !== 1 || signature.statusName !== 'UnknownError') return false;
  if (normalizeWindowsPath(signature.path) !== normalizeWindowsPath(filePath)) return false;
  if (signature.subject !== TEMPORARY_WINDOWS_CERTIFICATE.subject) return false;
  if (String(signature.thumbprint || '').toUpperCase() !== TEMPORARY_WINDOWS_CERTIFICATE.thumbprint) return false;
  const notBefore = new Date(signature.notBefore);
  const notAfter = new Date(signature.notAfter);
  return Number.isFinite(notBefore.getTime())
    && Number.isFinite(notAfter.getTime())
    && now >= notBefore
    && now <= notAfter;
}

function createWindowsUpdateSignatureVerifier({ verifyTrustedSignature, inspectSignature, now = () => new Date(), logger } = {}) {
  return async (publisherNames, filePath) => {
    const trustedResult = await verifyTrustedSignature(publisherNames, filePath);
    if (trustedResult == null) return null;

    try {
      const signature = await inspectSignature(filePath);
      if (isPinnedTemporarySignature(signature, filePath, now())) {
        logger?.warn?.('[updater] accepted update signed by the pinned temporary Windows certificate');
        return null;
      }
    } catch (error) {
      logger?.warn?.('[updater] temporary Windows certificate verification failed:', error);
    }

    return trustedResult;
  };
}

function installWindowsUpdateSignatureVerifier(updater, {
  platform = process.platform,
  inspectSignature = inspectWindowsSignature,
  now,
  logger,
} = {}) {
  if (platform !== 'win32' || typeof updater?.verifyUpdateCodeSignature !== 'function') return false;
  const verifyTrustedSignature = updater.verifyUpdateCodeSignature.bind(updater);
  updater.verifyUpdateCodeSignature = createWindowsUpdateSignatureVerifier({
    verifyTrustedSignature,
    inspectSignature,
    now,
    logger,
  });
  return true;
}

module.exports = {
  TEMPORARY_WINDOWS_CERTIFICATE,
  createWindowsUpdateSignatureVerifier,
  inspectWindowsSignature,
  installWindowsUpdateSignatureVerifier,
  isPinnedTemporarySignature,
};
