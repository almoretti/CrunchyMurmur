/* CrunchyMurmur renderer localisation. Keep catalogs structurally identical. */
(() => {
  const supported = ['en', 'it', 'es', 'pt', 'fr', 'de', 'da', 'no', 'sv', 'zh', 'ko', 'ja'];
  const phrases = {
    'Application language': ['Lingua dell?applicazione','Idioma de la aplicaci?n','Idioma da aplica??o','Langue de l?application','Anwendungssprache','Applikationssprog','Programspr?k','Programspr?k','????','? ??','??????'],
    'System default': ['Predefinita di sistema','Predeterminado del sistema','Predefini??o do sistema','Langue du syst?me','Systemstandard','Systemstandard','Systemstandard','Systemstandard','????','??? ???','??????????'],
    'Changes apply immediately and are saved for the next launch.': ['Le modifiche vengono applicate subito e salvate per il prossimo avvio.','Los cambios se aplican inmediatamente y se guardan para el pr?ximo inicio.','As altera??es s?o aplicadas imediatamente e guardadas para o pr?ximo arranque.','Les modifications s?appliquent imm?diatement et sont enregistr?es pour le prochain lancement.','?nderungen werden sofort angewendet und f?r den n?chsten Start gespeichert.','?ndringer anvendes straks og gemmes til n?ste start.','Endringer tas i bruk umiddelbart og lagres til neste start.','?ndringar till?mpas direkt och sparas till n?sta start.','??????????????????','?? ??? ?? ???? ?? ??? ?? ?????.','?????????????????????????'],
    'File':['File','Archivo','Ficheiro','Fichier','Datei','Filer','Fil','Arkiv','??','??','????'], 'Edit':['Modifica','Editar','Editar','Modifier','Bearbeiten','Rediger','Rediger','Redigera','??','??','??'], 'View':['Vista','Ver','Ver','Affichage','Ansicht','Vis','Vis','Visa','??','??','??'], 'Help':['Aiuto','Ayuda','Ajuda','Aide','Hilfe','Hj?lp','Hjelp','Hj?lp','??','???','???'],
    'Library':['Libreria','Biblioteca','Biblioteca','Biblioth?que','Bibliothek','Bibliotek','Bibliotek','Bibliotek','???','?????','?????'], 'Configuration':['Configurazione','Configuraci?n','Configura??o','Configuration','Konfiguration','Konfiguration','Konfigurasjon','Konfiguration','??','??','??'],
    'Dashboard':['Dashboard','Panel','Painel','Tableau de bord','?bersicht','Oversigt','Oversikt','?versikt','???','????','???????'], 'Recordings':['Registrazioni','Grabaciones','Grava??es','Enregistrements','Aufnahmen','Optagelser','Opptak','Inspelningar','??','??','??'], 'Meetings':['Riunioni','Reuniones','Reuni?es','R?unions','Besprechungen','M?der','M?ter','M?ten','??','??','??'], 'Notes':['Note','Notas','Notas','Notes','Notizen','Noter','Notater','Anteckningar','??','??','???'], 'Templates':['Modelli','Plantillas','Modelos','Mod?les','Vorlagen','Skabeloner','Maler','Mallar','??','???','??????'], 'Models':['Modelli','Modelos','Modelos','Mod?les','Modelle','Modeller','Modeller','Modeller','??','??','???'], 'Engine':['Motore','Motor','Motor','Moteur','Engine','Motor','Motor','Motor','??','??','????'], 'General':['Generale','General','Geral','G?n?ral','Allgemein','Generelt','Generelt','Allm?nt','??','??','??'],
    'Today':['Oggi','Hoy','Hoje','Aujourd?hui','Heute','I dag','I dag','I dag','??','??','??'], 'Start':['Avvia','Iniciar','Iniciar','D?marrer','Starten','Start','Start','Starta','??','??','??'], 'Stop':['Interrompi','Detener','Parar','Arr?ter','Stoppen','Stop','Stopp','Stoppa','??','??','??'], 'Delete':['Elimina','Eliminar','Eliminar','Supprimer','L?schen','Slet','Slett','Ta bort','??','??','??'], 'Cancel':['Annulla','Cancelar','Cancelar','Annuler','Abbrechen','Annuller','Avbryt','Avbryt','??','??','?????'], 'Save':['Salva','Guardar','Guardar','Enregistrer','Speichern','Gem','Lagre','Spara','??','??','??'], 'Close':['Chiudi','Cerrar','Fechar','Fermer','Schlie?en','Luk','Lukk','St?ng','??','??','???'], 'Add':['Aggiungi','A?adir','Adicionar','Ajouter','Hinzuf?gen','Tilf?j','Legg til','L?gg till','??','??','??'], 'Copy':['Copia','Copiar','Copiar','Copier','Kopieren','Kopi?r','Kopier','Kopiera','??','??','???'],
    'Search recordings':['Cerca registrazioni','Buscar grabaciones','Pesquisar grava??es','Rechercher des enregistrements','Aufnahmen suchen','S?g i optagelser','S?k i opptak','S?k inspelningar','????','?? ??','?????'], 'Clear All':['Cancella tutto','Borrar todo','Limpar tudo','Tout effacer','Alle l?schen','Ryd alle','T?m alle','Rensa alla','????','?? ???','?????'], 'No recordings yet':['Nessuna registrazione','A?n no hay grabaciones','Ainda n?o h? grava??es','Aucun enregistrement','Noch keine Aufnahmen','Ingen optagelser endnu','Ingen opptak enn?','Inga inspelningar ?n','????','?? ?? ??','??????????'],
    'Appearance':['Aspetto','Apariencia','Apar?ncia','Apparence','Darstellung','Udseende','Utseende','Utseende','??','??','??'], 'System':['Sistema','Sistema','Sistema','Syst?me','System','System','System','System','??','???','????'], 'Light':['Chiaro','Claro','Claro','Clair','Hell','Lys','Lys','Ljust','??','???','???'], 'Dark':['Scuro','Oscuro','Escuro','Sombre','Dunkel','M?rk','M?rk','M?rkt','??','??','???'], 'Microphone':['Microfono','Micr?fono','Microfone','Microphone','Mikrofon','Mikrofon','Mikrofon','Mikrofon','???','???','???'], 'Language':['Lingua','Idioma','Idioma','Langue','Sprache','Sprog','Spr?k','Spr?k','??','??','??'], 'Automatic updates':['Aggiornamenti automatici','Actualizaciones autom?ticas','Atualiza??es autom?ticas','Mises ? jour automatiques','Automatische Updates','Automatiske opdateringer','Automatiske oppdateringer','Automatiska uppdateringar','????','?? ????','????'], 'Permissions':['Autorizzazioni','Permisos','Permiss?es','Autorisations','Berechtigungen','Tilladelser','Tillatelser','Beh?righeter','??','??','??'], 'Support and local data':['Supporto e dati locali','Soporte y datos locales','Suporte e dados locais','Assistance et donn?es locales','Support und lokale Daten','Support og lokale data','St?tte og lokale data','Support och lokala data','???????','?? ? ?? ???','????????????'],
    'Recording':['Registrazione','Grabando','A gravar','Enregistrement','Aufnahme','Optager','Tar opp','Spelar in','????','?? ?','???'], 'Transcribing':['Trascrizione','Transcribiendo','A transcrever','Transcription','Transkription','Transskriberer','Transkriberer','Transkriberar','????','?? ?','??????'], 'Mic unavailable':['Microfono non disponibile','Micr?fono no disponible','Microfone indispon?vel','Microphone indisponible','Mikrofon nicht verf?gbar','Mikrofon ikke tilg?ngelig','Mikrofon utilgjengelig','Mikrofonen ?r inte tillg?nglig','??????','???? ??? ? ??','???????????'], 'Mic blocked':['Microfono bloccato','Micr?fono bloqueado','Microfone bloqueado','Microphone bloqu?','Mikrofon blockiert','Mikrofon blokeret','Mikrofon blokkert','Mikrofonen blockerad','???????','??? ???','?????????????'], 'Recording meeting ? click to stop':['Registrazione riunione ? fai clic per interrompere','Grabando reuni?n ? haz clic para detener','A gravar reuni?o ? clique para parar','R?union en cours ? cliquez pour arr?ter','Besprechungsaufnahme ? zum Stoppen klicken','Optager m?de ? klik for at stoppe','Tar opp m?te ? klikk for ? stoppe','Spelar in m?te ? klicka f?r att stoppa','?????? ? ????','?? ?? ? ? ????? ??','?????? ? ????????']
  };
  const sourceMessages = window.__CRUNCHY_I18N_CATALOGS__?.en || {};
  const catalogs = {};
  for (const language of supported) catalogs[language] = Object.fromEntries(Object.keys(sourceMessages).map(key => [key, key]));
  Object.assign(catalogs.en, Object.fromEntries(Object.keys(phrases).map(key => [key, key])));
  supported.slice(1).forEach((language, index) => {
    Object.assign(catalogs[language], Object.fromEntries(Object.entries(phrases).map(([key, values]) => [key, values[index]])));
  });
  let locale = 'en';
  const sourceKey = value => {
    if (catalogs.en[value]) return value;
    for (const catalog of Object.values(catalogs)) {
      const match = Object.entries(catalog).find(([, translated]) => translated === value);
      if (match) return match[0];
    }
    return value;
  };
  const normalize = value => { const code = String(value || '').toLowerCase().split('-')[0]; return supported.includes(code) ? code : 'en'; };
  function t(key, vars = {}) { let value = catalogs[locale]?.[key] || catalogs.en[key] || key; for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, replacement); return value; }
  function translateValue(visible) {
    const exact = sourceKey(visible);
    if (catalogs.en[exact]) return t(exact);
    for (const key of Object.keys(catalogs.en)) {
      if (!/\{\d+\}/.test(key)) continue;
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{(\d+)\\\}/g, '(.+?)');
      const match = visible.match(new RegExp(`^${escaped}$`, 's'));
      if (match) return t(key, Object.fromEntries(match.slice(1).map((value, index) => [index, value])));
    }
    return visible;
  }
  function translate(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) { const visible = node.nodeValue.trim(); const translated = translateValue(visible); if (translated !== visible) node.nodeValue = node.nodeValue.replace(visible, translated); }
    root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => { for (const attr of ['placeholder','title','aria-label']) { const visible = el.getAttribute(attr); const key = sourceKey(visible); if (key && catalogs.en[key]) el.setAttribute(attr, t(key)); } });
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

