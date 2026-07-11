/* CrunchyMurmur renderer localisation. Keep catalogs structurally identical. */
(() => {
  const supported = ['en', 'it', 'es', 'pt', 'fr', 'de', 'da', 'no', 'sv', 'zh', 'ko', 'ja'];
  const phrases = {
    'Application language': ['Lingua dell’applicazione','Idioma de la aplicación','Idioma da aplicação','Langue de l’application','Anwendungssprache','Applikationssprog','Programspråk','Programspråk','应用语言','앱 언어','アプリの言語'],
    'System default': ['Predefinita di sistema','Predeterminado del sistema','Predefinição do sistema','Par défaut du système','Systemstandard','Systemstandard','Systemstandard','Systemstandard','系统默认','시스템 기본값','システムのデフォルト'],
    'Changes apply immediately and are saved for the next launch.': ['Le modifiche vengono applicate subito e salvate per il prossimo avvio.','Los cambios se aplican inmediatamente y se guardan para el próximo inicio.','As alterações são aplicadas imediatamente e guardadas para o próximo arranque.','Les modifications s’appliquent immédiatement et sont enregistrées pour le prochain lancement.','Änderungen werden sofort angewendet und für den nächsten Start gespeichert.','Ændringer anvendes straks og gemmes til næste start.','Endringer tas i bruk umiddelbart og lagres til neste start.','Ändringar tillämpas direkt och sparas till nästa start.','更改会立即应用并保存供下次启动使用。','변경 사항은 즉시 적용되며 다음 실행을 위해 저장됩니다.','変更はすぐに適用され、次回起動時にも保持されます。'],
    'File':['File','Archivo','Ficheiro','Fichier','Datei','Filer','Fil','Arkiv','文件','파일','ファイル'], 'Edit':['Modifica','Editar','Editar','Modifier','Bearbeiten','Rediger','Rediger','Redigera','编辑','편집','編集'], 'View':['Vista','Ver','Ver','Affichage','Ansicht','Vis','Vis','Visa','查看','보기','表示'], 'Help':['Aiuto','Ayuda','Ajuda','Aide','Hilfe','Hjælp','Hjelp','Hjälp','帮助','도움말','ヘルプ'],
    'Library':['Libreria','Biblioteca','Biblioteca','Bibliothèque','Bibliothek','Bibliotek','Bibliotek','Bibliotek','资料库','라이브러리','ライブラリ'], 'Configuration':['Configurazione','Configuración','Configuração','Configuration','Konfiguration','Konfiguration','Konfigurasjon','Konfiguration','配置','설정','設定'],
    'Dashboard':['Dashboard','Panel','Painel','Tableau de bord','Übersicht','Oversigt','Oversikt','Översikt','仪表板','대시보드','ダッシュボード'], 'Recordings':['Registrazioni','Grabaciones','Gravações','Enregistrements','Aufnahmen','Optagelser','Opptak','Inspelningar','录音','녹음','録音'], 'Meetings':['Riunioni','Reuniones','Reuniões','Réunions','Besprechungen','Møder','Møter','Möten','会议','회의','会議'], 'Notes':['Note','Notas','Notas','Notes','Notizen','Noter','Notater','Anteckningar','笔记','노트','ノート'], 'Templates':['Modelli','Plantillas','Modelos','Modèles','Vorlagen','Skabeloner','Maler','Mallar','模板','템플릿','テンプレート'], 'Models':['Modelli','Modelos','Modelos','Modèles','Modelle','Modeller','Modeller','Modeller','模型','모델','モデル'], 'Engine':['Motore','Motor','Motor','Moteur','Engine','Motor','Motor','Motor','引擎','엔진','エンジン'], 'General':['Generale','General','Geral','Général','Allgemein','Generelt','Generelt','Allmänt','常规','일반','一般'],
    'Today':['Oggi','Hoy','Hoje','Aujourd’hui','Heute','I dag','I dag','I dag','今天','오늘','今日'], 'Start':['Avvia','Iniciar','Iniciar','Démarrer','Starten','Start','Start','Starta','开始','시작','開始'], 'Stop':['Interrompi','Detener','Parar','Arrêter','Stoppen','Stop','Stopp','Stoppa','停止','중지','停止'], 'Delete':['Elimina','Eliminar','Eliminar','Supprimer','Löschen','Slet','Slett','Ta bort','删除','삭제','削除'], 'Cancel':['Annulla','Cancelar','Cancelar','Annuler','Abbrechen','Annuller','Avbryt','Avbryt','取消','취소','キャンセル'], 'Save':['Salva','Guardar','Guardar','Enregistrer','Speichern','Gem','Lagre','Spara','保存','저장','保存'], 'Close':['Chiudi','Cerrar','Fechar','Fermer','Schließen','Luk','Lukk','Stäng','关闭','닫기','閉じる'], 'Add':['Aggiungi','Añadir','Adicionar','Ajouter','Hinzufügen','Tilføj','Legg til','Lägg till','添加','추가','追加'], 'Copy':['Copia','Copiar','Copiar','Copier','Kopieren','Kopiér','Kopier','Kopiera','复制','복사','コピー'],
    'Search recordings':['Cerca registrazioni','Buscar grabaciones','Pesquisar gravações','Rechercher des enregistrements','Aufnahmen suchen','Søg i optagelser','Søk i opptak','Sök inspelningar','搜索录音','녹음 검색','録音を検索'], 'Clear All':['Cancella tutto','Borrar todo','Limpar tudo','Tout effacer','Alle löschen','Ryd alle','Tøm alle','Rensa alla','全部清除','모두 지우기','すべて消去'], 'No recordings yet':['Nessuna registrazione','Aún no hay grabaciones','Ainda não há gravações','Aucun enregistrement','Noch keine Aufnahmen','Ingen optagelser endnu','Ingen opptak ennå','Inga inspelningar än','暂无录音','아직 녹음 없음','録音はまだありません'],
    'Appearance':['Aspetto','Apariencia','Aparência','Apparence','Darstellung','Udseende','Utseende','Utseende','外观','모양','外観'], 'System':['Sistema','Sistema','Sistema','Système','System','System','System','System','系统','시스템','システム'], 'Light':['Chiaro','Claro','Claro','Clair','Hell','Lys','Lys','Ljust','浅色','라이트','ライト'], 'Dark':['Scuro','Oscuro','Escuro','Sombre','Dunkel','Mørk','Mørk','Mörkt','深色','다크','ダーク'], 'Microphone':['Microfono','Micrófono','Microfone','Microphone','Mikrofon','Mikrofon','Mikrofon','Mikrofon','麦克风','마이크','マイク'], 'Language':['Lingua','Idioma','Idioma','Langue','Sprache','Sprog','Språk','Språk','语言','언어','言語'], 'Automatic updates':['Aggiornamenti automatici','Actualizaciones automáticas','Atualizações automáticas','Mises à jour automatiques','Automatische Updates','Automatiske opdateringer','Automatiske oppdateringer','Automatiska uppdateringar','自动更新','자동 업데이트','自動更新'], 'Permissions':['Autorizzazioni','Permisos','Permissões','Autorisations','Berechtigungen','Tilladelser','Tillatelser','Behörigheter','权限','권한','権限'], 'Support and local data':['Supporto e dati locali','Soporte y datos locales','Suporte e dados locais','Assistance et données locales','Support und lokale Daten','Support og lokale data','Støtte og lokale data','Support och lokala data','支持和本地数据','지원 및 로컬 데이터','サポートとローカルデータ'],
    'Finishing':['Completamento','Finalizando','A concluir','Finalisation','Abschluss','Afslutter','Fullfører','Slutför','正在完成','마무리 중','完了処理中'],
    'Meeting recording':['Riunione in registrazione','Grabando reunión','Reunião a ser gravada','Enregistrement de la réunion','Meeting wird aufgenommen','Møde optages','Møtet tas opp','Mötet spelas in','正在录制会议','회의 녹음 중','会議を録音中'],
    'Recording':['Registrazione','Grabando','A gravar','Enregistrement','Aufnahme','Optager','Tar opp','Spelar in','正在录音','녹음 중','録音中'], 'Transcribing':['Trascrizione','Transcribiendo','A transcrever','Transcription','Transkription','Transskriberer','Transkriberer','Transkriberar','正在转写','변환 중','文字起こし中'], 'Mic unavailable':['Microfono non disponibile','Micrófono no disponible','Microfone indisponível','Microphone indisponible','Mikrofon nicht verfügbar','Mikrofon ikke tilgængelig','Mikrofon utilgjengelig','Mikrofonen är inte tillgänglig','麦克风不可用','마이크를 사용할 수 없음','マイクを使用できません'], 'Mic blocked':['Microfono bloccato','Micrófono bloqueado','Microfone bloqueado','Microphone bloqué','Mikrofon blockiert','Mikrofon blokeret','Mikrofon blokkert','Mikrofonen blockerad','麦克风已被阻止','마이크 차단됨','マイクがブロックされました'], 'Recording meeting · click to stop':['Registrazione riunione · fai clic per interrompere','Grabando reunión · haz clic para detener','A gravar reunião · clique para parar','Réunion en cours · cliquez pour arrêter','Besprechungsaufnahme · zum Stoppen klicken','Optager møde · klik for at stoppe','Tar opp møte · klikk for å stoppe','Spelar in möte · klicka för att stoppa','正在录制会议 · 点击停止','회의 녹음 중 · 중지하려면 클릭','会議を録音中 · クリックして停止']
  };
  const sourceMessages = window.__CRUNCHY_I18N_CATALOGS__?.en || {};
  const catalogs = {};
  for (const language of supported) catalogs[language] = Object.fromEntries(Object.keys(sourceMessages).map(key => [key, key]));
  Object.assign(catalogs.en, Object.fromEntries(Object.keys(phrases).map(key => [key, key])));
  supported.slice(1).forEach((language, index) => {
    Object.assign(catalogs[language], Object.fromEntries(Object.entries(phrases).map(([key, values]) => [key, values[index]])));
  });
  let locale = 'en';
  const reverseKeys = new Map();
  for (const catalog of Object.values(catalogs)) {
    for (const [key, value] of Object.entries(catalog)) if (!reverseKeys.has(value)) reverseKeys.set(value, key);
  }
  const parameterMatchers = Object.keys(catalogs.en).flatMap(key => {
    if (!/\{\d+\}/.test(key)) return [];
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{(\d+)\\\}/g, '(.+?)');
    return [{ key, expression: new RegExp(`^${escaped}$`, 's') }];
  });
  const sourceKey = value => {
    if (catalogs.en[value]) return value;
    return reverseKeys.get(value) || value;
  };
  const normalize = value => { const code = String(value || '').toLowerCase().split('-')[0]; return supported.includes(code) ? code : 'en'; };
  function t(key, vars = {}) { let value = catalogs[locale]?.[key] || catalogs.en[key] || key; for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, replacement); return value; }
  function translateValue(visible) {
    const exact = sourceKey(visible);
    if (catalogs.en[exact]) return t(exact);
    for (const { key, expression } of parameterMatchers) {
      const match = visible.match(expression);
      if (match) return t(key, Object.fromEntries(match.slice(1).map((value, index) => [index, value])));
    }
    return visible;
  }
  function translate(root = document) {
    const i18nElements = root.matches?.('[data-i18n]') ? [root, ...root.querySelectorAll('[data-i18n]')] : root.querySelectorAll('[data-i18n]');
    i18nElements.forEach(el => { el.textContent = t(el.dataset.i18n); });
    const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) { const visible = node.nodeValue.trim(); const translated = translateValue(visible); if (translated !== visible) node.nodeValue = node.nodeValue.replace(visible, translated); }
    const attributeElements = root.matches?.('[placeholder],[title],[aria-label]') ? [root, ...root.querySelectorAll('[placeholder],[title],[aria-label]')] : root.querySelectorAll('[placeholder],[title],[aria-label]');
    attributeElements.forEach(el => { for (const attr of ['placeholder','title','aria-label']) { const visible = el.getAttribute(attr); const key = sourceKey(visible); if (key && catalogs.en[key]) el.setAttribute(attr, t(key)); } });
    document.documentElement.lang = locale;
  }
  function setLocale(value, systemLocale = navigator.language) { locale = value === 'system' ? normalize(systemLocale) : normalize(value); translate(); window.dispatchEvent(new CustomEvent('localechange', { detail: locale })); }
  window.i18n = { t, translate, setLocale, get locale() { return locale; }, supported, catalogs };
  const nativeDialogs = { alert: window.alert?.bind(window), confirm: window.confirm?.bind(window), prompt: window.prompt?.bind(window) };
  for (const name of Object.keys(nativeDialogs)) if (nativeDialogs[name]) window[name] = (message, ...args) => nativeDialogs[name](translateValue(String(message)), ...args);
  let observing = false;
  new MutationObserver(records => {
    if (observing) return;
    observing = true;
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) { const visible = node.nodeValue.trim(); node.nodeValue = node.nodeValue.replace(visible, translateValue(visible)); }
      else if (node.nodeType === Node.ELEMENT_NODE) translate(node);
    }
    observing = false;
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
