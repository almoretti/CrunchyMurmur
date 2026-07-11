(() => {
  const catalogs = {
    en: {},
    it: { Recording: 'Registrazione', Finishing: 'Completamento', Transcribing: 'Trascrizione', 'Meeting recording': 'Riunione in registrazione', Stop: 'Interrompi' },
    es: { Recording: 'Grabando', Finishing: 'Finalizando', Transcribing: 'Transcribiendo', 'Meeting recording': 'Grabando reunión', Stop: 'Detener' },
    pt: { Recording: 'A gravar', Finishing: 'A concluir', Transcribing: 'A transcrever', 'Meeting recording': 'Reunião a ser gravada', Stop: 'Parar' },
    fr: { Recording: 'Enregistrement', Finishing: 'Finalisation', Transcribing: 'Transcription', 'Meeting recording': 'Enregistrement de la réunion', Stop: 'Arrêter' },
    de: { Recording: 'Aufnahme', Finishing: 'Abschluss', Transcribing: 'Transkription', 'Meeting recording': 'Meeting wird aufgenommen', Stop: 'Stoppen' },
    da: { Recording: 'Optager', Finishing: 'Afslutter', Transcribing: 'Transskriberer', 'Meeting recording': 'Møde optages', Stop: 'Stop' },
    no: { Recording: 'Tar opp', Finishing: 'Fullfører', Transcribing: 'Transkriberer', 'Meeting recording': 'Møtet tas opp', Stop: 'Stopp' },
    sv: { Recording: 'Spelar in', Finishing: 'Slutför', Transcribing: 'Transkriberar', 'Meeting recording': 'Mötet spelas in', Stop: 'Stoppa' },
    zh: { Recording: '正在录音', Finishing: '正在完成', Transcribing: '正在转写', 'Meeting recording': '正在录制会议', Stop: '停止' },
    ko: { Recording: '녹음 중', Finishing: '마무리 중', Transcribing: '전사 중', 'Meeting recording': '회의 녹음 중', Stop: '중지' },
    ja: { Recording: '録音中', Finishing: '完了処理中', Transcribing: '文字起こし中', 'Meeting recording': '会議を録音中', Stop: '停止' },
  };

  let locale = 'en';

  function normalise(value) {
    const requested = value === 'system' || !value ? navigator.language : value;
    const language = String(requested).toLowerCase().split('-')[0];
    return Object.hasOwn(catalogs, language) ? language : 'en';
  }

  window.i18n = {
    setLocale(value) { locale = normalise(value); },
    t(message) { return catalogs[locale][message] || message; },
  };
})();
