// CrunchyMurmur landing page behavior.
//
// Release sync: everything download-related links statically to the GitHub Releases
// page, then this script upgrades those links to direct asset URLs from the latest
// release via the GitHub API. If the API fails or no release exists yet, the static
// links keep working.
//
// Coupling: asset matching relies on the electron-builder artifactName pattern
// `${productName}-${os}-${arch}.${ext}` configured in the repository's package.json
// (plus scripts/normalize-linux-artifacts.js renames). See AGENTS.md → "Website".

(function () {
  'use strict';

  const REPO = 'almoretti/CrunchyMurmur';
  const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
  const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

  // Matchers for the per-platform download buttons, keyed by data-asset.
  const ASSET_MATCHERS = {
    'win-x64': /-win-x64\.exe$/i,
    'win-arm64': /-win-arm64\.exe$/i,
    'mac-dmg': /-mac-universal\.dmg$/i,
    'mac-zip': /-mac-universal\.zip$/i,
    'linux-appimage-x64': /-linux-x64\.AppImage$/i,
    'linux-deb-x64': /-linux-x64\.deb$/i,
    'linux-arm64': /-linux-arm64\.AppImage$/i,
  };

  function detectOS() {
    const ua = navigator.userAgent;
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    const haystack = `${platform} ${ua}`;
    if (/win/i.test(haystack)) return 'windows';
    if (/mac|iphone|ipad/i.test(haystack)) return 'mac';
    if (/linux|x11|cros/i.test(haystack)) return 'linux';
    return 'unknown';
  }

  function detectWindowsArm() {
    // Best-effort only: browsers rarely expose Windows-on-ARM. Default to x64.
    return /ARM64|aarch64/i.test(navigator.userAgent);
  }

  const OS_LABELS = {
    windows: 'Download for Windows',
    mac: 'Download for macOS',
    linux: 'Download for Linux',
    unknown: 'Download',
  };

  const OS_PRIMARY_ASSET = {
    windows: detectWindowsArm() ? 'win-arm64' : 'win-x64',
    mac: 'mac-dmg',
    linux: 'linux-appimage-x64',
  };

  const os = detectOS();

  // --- Hero button label reflects the detected OS immediately. ---
  const heroBtnLabel = document.getElementById('download-btn-label');
  heroBtnLabel.textContent = OS_LABELS[os];

  // --- Terminal tabs: preselect the command for the detected OS. ---
  const tabs = document.querySelectorAll('.terminal-tab');
  const panels = document.querySelectorAll('.terminal-cmd');
  function selectCmd(kind) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.cmd === kind));
    panels.forEach((p) => p.classList.toggle('active', p.dataset.cmdPanel === kind));
  }
  tabs.forEach((t) => t.addEventListener('click', () => selectCmd(t.dataset.cmd)));
  selectCmd(os === 'windows' ? 'windows' : 'unix');

  // --- Copy button for the visible command. ---
  const copyBtn = document.getElementById('copy-cmd');
  copyBtn.addEventListener('click', () => {
    const active = document.querySelector('.terminal-cmd.active code');
    if (!active) return;
    navigator.clipboard.writeText(active.textContent.trim()).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
    });
  });

  // --- Sync download links with the latest GitHub release. ---
  const versionEl = document.getElementById('release-version');
  fetch(API_LATEST, { headers: { Accept: 'application/vnd.github+json' } })
    .then((res) => {
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      return res.json();
    })
    .then((release) => {
      versionEl.textContent = `Latest release ${release.tag_name}`;
      const assets = release.assets || [];

      const urlFor = (key) => {
        const matcher = ASSET_MATCHERS[key];
        const asset = assets.find((a) => matcher.test(a.name));
        return asset ? asset.browser_download_url : null;
      };

      document.querySelectorAll('[data-asset]').forEach((link) => {
        const url = urlFor(link.dataset.asset);
        if (url) link.href = url;
      });

      const primaryKey = OS_PRIMARY_ASSET[os];
      const primaryUrl = primaryKey ? urlFor(primaryKey) : null;
      if (primaryUrl) {
        document.getElementById('download-btn').href = primaryUrl;
        heroBtnLabel.textContent = `${OS_LABELS[os]} (${release.tag_name})`;
      }
    })
    .catch(() => {
      // No published release yet (or API rate-limited): keep the static
      // releases-page links and say so instead of showing a stale version.
      versionEl.textContent = 'First public release coming soon — installers link to GitHub Releases';
    });
})();
