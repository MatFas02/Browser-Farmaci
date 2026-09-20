// Sincronizzazione dati AIFA — versione browser (PWA).
// Stessa logica del main/sync.js dell'app desktop, ma usando fetch() dal
// browser invece che da Node, e salvando in IndexedDB invece che su file.

// Indirizzo del tuo Cloudflare Worker (il "ponte" che bypassa il blocco
// CORS di AIFA). Lascialo vuoto ('') per provare il download diretto dal
// browser; se AIFA lo blocca, incolla qui l'indirizzo che Cloudflare ti
// ha assegnato dopo aver pubblicato il Worker (vedi README.md), es.
// 'https://indice-terapeutico-proxy.tuonomeutente.workers.dev'
const PROXY_URL = '';

// Se il proxy è configurato, ogni richiesta ad AIFA passa da lì invece
// che direttamente al sito AIFA: il Worker inoltra la richiesta al posto
// nostro e aggiunge le intestazioni CORS che il browser richiede.
function urlEffettivo(urlAifa) {
  if (!PROXY_URL) return urlAifa;
  return `${PROXY_URL}?url=${encodeURIComponent(urlAifa)}`;
}

const URLS = {
  atc: 'https://drive.aifa.gov.it/farmaci/atc.csv',
  principiAttivi: 'https://drive.aifa.gov.it/farmaci/PA_confezioni.csv',
  farmaci: 'https://drive.aifa.gov.it/farmaci/confezioni_fornitura.csv',
  equivalenti: 'https://www.aifa.gov.it/documents/20142/825643/Lista_farmaci_equivalenti.csv'
};

function trovaColonna(headers, candidatiParole) {
  const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const headersNorm = headers.map(norm);
  for (const parola of candidatiParole) {
    const p = norm(parola);
    const idx = headersNorm.findIndex((h) => h.includes(p));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

async function scaricaTesto(url) {
  const res = await fetch(urlEffettivo(url), { mode: 'cors' });
  if (!res.ok) throw new Error(`Download fallito (${res.status}) per ${url}`);
  return res.text();
}

async function scaricaTestoLatin1(url) {
  const res = await fetch(urlEffettivo(url), { mode: 'cors' });
  if (!res.ok) throw new Error(`Download fallito (${res.status}) per ${url}`);
  const buffer = await res.arrayBuffer();
  try {
    return new TextDecoder('windows-1252').decode(buffer);
  } catch (e) {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function parseCsv(testo) {
  return Papa.parse(testo, { header: true, delimiter: ';', skipEmptyLines: true });
}

function normalizzaAic(valore) {
  const cifre = (valore || '').replace(/\D/g, '');
  return cifre ? cifre.padStart(9, '0') : '';
}

// Prova il download diretto dal browser. Se AIFA blocca la richiesta
// cross-origin (CORS), il browser stesso impedisce di leggere la
// risposta e fetch() lancia un TypeError generico "Failed to fetch":
// lo intercettiamo per dare un messaggio chiaro invece di un errore
// tecnico incomprensibile.
async function sincronizza(onProgress) {
  const log = (msg) => { if (onProgress) onProgress(msg); };

  try {
    log('Scaricamento anagrafica ATC…');
    const atcTesto = await scaricaTesto(URLS.atc);
    const atcParsed = parseCsv(atcTesto);
    const atcHeaders = atcParsed.meta.fields || [];
    const colAtcCodice = trovaColonna(atcHeaders, ['CODICEATC', 'CODICE_ATC', 'ATC']) || atcHeaders[0];
    const colAtcDesc = trovaColonna(atcHeaders, ['DESCRIZIONE', 'DESC']) || atcHeaders[1];

    const atcMap = {};
    for (const row of atcParsed.data) {
      const codice = (row[colAtcCodice] || '').trim();
      if (codice) atcMap[codice] = (row[colAtcDesc] || '').trim();
    }

    log('Scaricamento anagrafica farmaci (file grande, può richiedere un minuto)…');
    const farmaciTesto = await scaricaTesto(URLS.farmaci);
    const farmaciParsed = parseCsv(farmaciTesto);
    const fHeaders = farmaciParsed.meta.fields || [];

    const colDenominazione = trovaColonna(fHeaders, ['DENOMINAZIONE', 'NOMEFARMACO', 'MEDICINALE']);
    const colAzienda = trovaColonna(fHeaders, ['RAGIONESOCIALE', 'AZIENDA', 'TITOLARE']);
    const colStato = trovaColonna(fHeaders, ['STATOAMMINISTRATIVO', 'STATO']);
    const colPrincipioAttivo = trovaColonna(fHeaders, ['PAASSOCIATI', 'PRINCIPIOATTIVO', 'PRINCIPIO']);
    const colAtc = trovaColonna(fHeaders, ['CODICEATC', 'ATC']);
    const colAic = trovaColonna(fHeaders, ['CODICEAIC', 'AIC']);
    const colDescrizione = trovaColonna(fHeaders, ['DESCRIZIONE']);
    const colForma = trovaColonna(fHeaders, ['FORMA']);
    const colFornitura = trovaColonna(fHeaders, ['FORNITURA']);
    const colLinkFi = trovaColonna(fHeaders, ['LINKFI']);
    const colLinkRcp = trovaColonna(fHeaders, ['LINKRCP']);

    const farmaci = farmaciParsed.data
      .filter((row) => colAtc && row[colAtc])
      .map((row) => ({
        denominazione: colDenominazione ? (row[colDenominazione] || '').trim() : '',
        azienda: colAzienda ? (row[colAzienda] || '').trim() : '',
        stato: colStato ? (row[colStato] || '').trim() : '',
        principioAttivo: colPrincipioAttivo ? (row[colPrincipioAttivo] || '').trim() : '',
        atc: colAtc ? (row[colAtc] || '').trim() : '',
        aic: colAic ? normalizzaAic(row[colAic]) : '',
        descrizione: colDescrizione ? (row[colDescrizione] || '').trim() : '',
        forma: colForma ? (row[colForma] || '').trim() : '',
        fornitura: colFornitura ? (row[colFornitura] || '').trim() : '',
        linkFi: colLinkFi ? (row[colLinkFi] || '').trim() : '',
        linkRcp: colLinkRcp ? (row[colLinkRcp] || '').trim() : ''
      }));

    log('Scaricamento principi attivi per confezione…');
    const paTesto = await scaricaTesto(URLS.principiAttivi);
    const paParsed = parseCsv(paTesto);
    const paHeaders = paParsed.meta.fields || [];

    const colPaAic = trovaColonna(paHeaders, ['CODICEAIC', 'AIC']);
    const colPaPrincipio = trovaColonna(paHeaders, ['PRINCIPIOATTIVO', 'PRINCIPIO']);
    const colPaQuantita = trovaColonna(paHeaders, ['QUANTITA']);
    const colPaUnitaMisura = trovaColonna(paHeaders, ['UNITAMISURA', 'UNITADIMISURA', 'UNITA']);

    const dosaggioPerAic = {};
    if (colPaAic) {
      for (const row of paParsed.data) {
        const aic = normalizzaAic(row[colPaAic]);
        if (!aic) continue;
        const principio = colPaPrincipio ? (row[colPaPrincipio] || '').trim() : '';
        const quantita = colPaQuantita ? (row[colPaQuantita] || '').trim() : '';
        const unita = colPaUnitaMisura ? (row[colPaUnitaMisura] || '').trim() : '';
        if (!principio || principio.toUpperCase() === 'N.D.') continue;
        if (!dosaggioPerAic[aic]) dosaggioPerAic[aic] = [];
        dosaggioPerAic[aic].push({
          principio,
          quantita: quantita.toUpperCase() === 'N.D.' ? '' : quantita,
          unita: unita.toUpperCase() === 'N.D.' ? '' : unita
        });
      }
    }

    log('Scaricamento lista farmaci equivalenti…');
    const eqTesto = await scaricaTestoLatin1(URLS.equivalenti);
    const eqParsed = parseCsv(eqTesto);
    const eqHeaders = eqParsed.meta.fields || [];

    const colEqAic = trovaColonna(eqHeaders, ['AIC']);
    const colEqGruppo = trovaColonna(eqHeaders, ['CODICEGRUPPOEQUIVALENZA', 'GRUPPOEQUIVALENZA']);
    const colEqPrincipio = trovaColonna(eqHeaders, ['PRINCIPIOATTIVO', 'PRINCIPIO']);
    const colEqFarmaco = trovaColonna(eqHeaders, ['FARMACO']);
    const colEqConfezione = trovaColonna(eqHeaders, ['CONFEZIONE']);

    const equivalentiPerAic = {};
    const denominazioniPerGruppo = {};

    if (colEqAic) {
      for (const row of eqParsed.data) {
        const aic = normalizzaAic(row[colEqAic]);
        if (!aic) continue;
        const gruppo = colEqGruppo ? (row[colEqGruppo] || '').trim() : '';
        const farmaco = colEqFarmaco ? (row[colEqFarmaco] || '').trim() : '';

        equivalentiPerAic[aic] = {
          principioAttivo: colEqPrincipio ? (row[colEqPrincipio] || '').trim() : '',
          gruppoEquivalenza: gruppo, farmaco,
          confezioneTesto: colEqConfezione ? (row[colEqConfezione] || '').trim() : ''
        };

        if (gruppo && farmaco) {
          if (!denominazioniPerGruppo[gruppo]) denominazioniPerGruppo[gruppo] = {};
          denominazioniPerGruppo[gruppo][farmaco.toUpperCase()] = farmaco;
        }
      }
    }
    const gruppoEquivalenzaIndex = {};
    for (const gruppo of Object.keys(denominazioniPerGruppo)) {
      gruppoEquivalenzaIndex[gruppo] = Object.values(denominazioniPerGruppo[gruppo]);
    }

    const meta = {
      ultimoAggiornamento: new Date().toISOString(),
      numeroFarmaci: farmaci.length,
      numeroCodiciAtc: Object.keys(atcMap).length,
      numeroEquivalenti: Object.keys(equivalentiPerAic).length,
      fonte: 'AIFA - Agenzia Italiana del Farmaco (Open Data, licenza CC-BY 4.0)',
      urlFonte: 'https://www.aifa.gov.it/liste-dei-farmaci'
    };

    const cache = { farmaci, atc: atcMap, equivalenti: equivalentiPerAic, gruppoEquivalenza: gruppoEquivalenzaIndex, dosaggioPerAic, meta };
    await salvaCacheIndexedDb(cache);

    log('Sincronizzazione completata.');
    return meta;
  } catch (err) {
    if (err instanceof TypeError) {
      // fetch() con CORS bloccato lancia sempre un TypeError generico,
      // senza dettagli: lo traduciamo in un messaggio comprensibile.
      throw new Error('Il sito AIFA sta bloccando lo scaricamento diretto dal browser (blocco di sicurezza CORS). I dati precaricati nell\'app restano comunque disponibili.');
    }
    throw err;
  }
}

// --- Salvataggio in IndexedDB (equivalente browser dei file JSON locali) ---
const DB_NOME = 'indice-terapeutico';
const DB_VERSIONE = 1;
const STORE = 'cache-aifa';

function apriDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSIONE);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function salvaCacheIndexedDb(cache) {
  const db = await apriDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(cache, 'cache');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function caricaCacheIndexedDb() {
  try {
    const db = await apriDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get('cache');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

function cacheEta(meta) {
  if (!meta || !meta.ultimoAggiornamento) return Infinity;
  return Date.now() - new Date(meta.ultimoAggiornamento).getTime();
}
