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

  // Strings this script injects at runtime, per page language (static text is
  // translated at build time by generate-i18n.js). {os} and {tag} are placeholders.
  const UI_STRINGS = {
    en: { downloadFor: 'Download for {os}', download: 'Download', latestRelease: 'Latest release {tag}', noRelease: 'First public release coming soon — installers link to GitHub Releases', copied: 'Copied!', copy: 'Copy' },
    it: { downloadFor: 'Scarica per {os}', download: 'Scarica', latestRelease: 'Ultima versione {tag}', noRelease: 'Prima versione pubblica in arrivo — i link portano a GitHub Releases', copied: 'Copiato!', copy: 'Copia' },
    es: { downloadFor: 'Descargar para {os}', download: 'Descargar', latestRelease: 'Última versión {tag}', noRelease: 'Primera versión pública próximamente — los enlaces llevan a GitHub Releases', copied: '¡Copiado!', copy: 'Copiar' },
    pt: { downloadFor: 'Transferir para {os}', download: 'Transferir', latestRelease: 'Última versão {tag}', noRelease: 'Primeira versão pública em breve — as ligações apontam para o GitHub Releases', copied: 'Copiado!', copy: 'Copiar' },
    fr: { downloadFor: 'Télécharger pour {os}', download: 'Télécharger', latestRelease: 'Dernière version {tag}', noRelease: 'Première version publique bientôt disponible — les liens pointent vers GitHub Releases', copied: 'Copié !', copy: 'Copier' },
    de: { downloadFor: 'Für {os} herunterladen', download: 'Herunterladen', latestRelease: 'Neueste Version {tag}', noRelease: 'Erste öffentliche Version folgt in Kürze — Links führen zu GitHub Releases', copied: 'Kopiert!', copy: 'Kopieren' },
    da: { downloadFor: 'Hent til {os}', download: 'Hent', latestRelease: 'Seneste udgivelse {tag}', noRelease: 'Første offentlige udgivelse kommer snart — links fører til GitHub Releases', copied: 'Kopieret!', copy: 'Kopiér' },
    no: { downloadFor: 'Last ned for {os}', download: 'Last ned', latestRelease: 'Siste utgivelse {tag}', noRelease: 'Første offentlige utgivelse kommer snart — lenkene går til GitHub Releases', copied: 'Kopiert!', copy: 'Kopier' },
    sv: { downloadFor: 'Ladda ner för {os}', download: 'Ladda ner', latestRelease: 'Senaste utgåvan {tag}', noRelease: 'Första publika utgåvan kommer snart — länkarna går till GitHub Releases', copied: 'Kopierat!', copy: 'Kopiera' },
    zh: { downloadFor: '下载 {os} 版', download: '下载', latestRelease: '最新版本 {tag}', noRelease: '首个公开版本即将发布 — 链接指向 GitHub Releases', copied: '已复制！', copy: '复制' },
    ko: { downloadFor: '{os}용 다운로드', download: '다운로드', latestRelease: '최신 릴리스 {tag}', noRelease: '첫 공개 릴리스가 곧 제공됩니다 — 링크는 GitHub Releases로 연결됩니다', copied: '복사됨!', copy: '복사' },
    ja: { downloadFor: '{os}版をダウンロード', download: 'ダウンロード', latestRelease: '最新リリース {tag}', noRelease: '初の公開リリースは近日公開 — リンクはGitHub Releasesへ', copied: 'コピーしました！', copy: 'コピー' },
  };
  const strings = UI_STRINGS[document.documentElement.lang] || UI_STRINGS.en;

  const OS_NAMES = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
  const OS_LABELS = {
    windows: strings.downloadFor.replace('{os}', OS_NAMES.windows),
    mac: strings.downloadFor.replace('{os}', OS_NAMES.mac),
    linux: strings.downloadFor.replace('{os}', OS_NAMES.linux),
    unknown: strings.download,
  };

  // --- Language picker navigates to the selected page. ---
  const langPicker = document.getElementById('lang-picker');
  if (langPicker) langPicker.addEventListener('change', () => { window.location.href = langPicker.value; });

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
      copyBtn.textContent = strings.copied;
      setTimeout(() => { copyBtn.textContent = strings.copy; }, 1600);
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
      versionEl.textContent = strings.latestRelease.replace('{tag}', release.tag_name);
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
      versionEl.textContent = strings.noRelease;
    });
})();
