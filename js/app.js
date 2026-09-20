// App principale — versione PWA (browser puro, nessun Electron/Node).

let malattieDb = [];
let infoPrincipiAttivi = {};
let cache = null; // { farmaci, atc, equivalenti, gruppoEquivalenza, dosaggioPerAic, meta }

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const footerMeta = document.getElementById('footerMeta');
const syncBtn = document.getElementById('syncBtn');
const syncMsg = document.getElementById('syncMsg');
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const indexBtn = document.getElementById('indexBtn');
const resultsEl = document.getElementById('results');

function escapeHtml(valore) {
  if (valore === null || valore === undefined) return '';
  return String(valore)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}

async function aggiornaStato() {
  if (cache && cache.meta) {
    statusDot.classList.add('ok');
    statusText.innerHTML = `Database AIFA sincronizzato — <b>${cache.meta.numeroFarmaci.toLocaleString('it-IT')}</b> confezioni, aggiornato il <b>${formatData(cache.meta.ultimoAggiornamento)}</b>`;
    footerMeta.textContent = `ultima sincronizzazione: ${formatData(cache.meta.ultimoAggiornamento)}`;
  } else {
    statusDot.classList.remove('ok');
    statusText.textContent = 'Database AIFA non ancora sincronizzato — tocca "Sincronizza" qui sopra (serve connessione internet).';
    footerMeta.textContent = 'non ancora sincronizzato';
  }
}

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncMsg.textContent = 'Avvio sincronizzazione…';
  try {
    const meta = await sincronizza((msg) => { syncMsg.textContent = msg; });
    cache = await caricaCacheIndexedDb();
    syncMsg.textContent = `Fatto — ${meta.numeroFarmaci.toLocaleString('it-IT')} confezioni caricate.`;
    await aggiornaStato();
    if (vistaCorrente.tipo === 'ricerca' && searchInput.value.trim()) eseguiRicerca();
  } catch (err) {
    syncMsg.textContent = `Impossibile sincronizzare: ${err.message}`;
  } finally {
    syncBtn.disabled = false;
  }
});

let vistaCorrente = { tipo: 'ricerca' };

searchInput.addEventListener('input', eseguiRicerca);
clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  vistaCorrente = { tipo: 'ricerca' };
  resultsEl.innerHTML = '';
});
indexBtn.addEventListener('click', apriIndicePatologie);

async function apriIndicePatologie() {
  vistaCorrente = { tipo: 'indice' };
  const gruppi = elencoMalattie(malattieDb);
  renderIndicePatologie(gruppi);
}

function renderIndicePatologie(gruppi) {
  const totale = gruppi.reduce((somma, g) => somma + g.patologie.length, 0);

  resultsEl.innerHTML = `
    <button class="back-btn" id="backBtnIndice">← torna alla ricerca</button>
    <div class="indice-intro">Elenco completo delle ${totale} patologie inserite, raggruppate per area terapeutica. Tocca una voce per cercarla.</div>
    ${gruppi.map((g) => `
      <div class="aifa-card">
        <div class="aifa-card-titolo">${escapeHtml(g.categoria)}</div>
        <ul class="aifa-campo-lista">${g.patologie.map((nome) => `
          <li><button class="farmaco-chip-inline" data-malattia="${escapeHtml(nome)}">${escapeHtml(nome)}</button></li>
        `).join('')}</ul>
      </div>
    `).join('')}
  `;

  document.getElementById('backBtnIndice').addEventListener('click', () => {
    searchInput.value = '';
    vistaCorrente = { tipo: 'ricerca' };
    resultsEl.innerHTML = '';
  });
  resultsEl.querySelectorAll('.farmaco-chip-inline[data-malattia]').forEach((btn) => {
    btn.addEventListener('click', () => {
      searchInput.value = btn.dataset.malattia;
      eseguiRicerca();
    });
  });
}

function eseguiRicerca() {
  const q = searchInput.value.trim();
  vistaCorrente = { tipo: 'ricerca' };
  if (!q) { resultsEl.innerHTML = ''; return; }
  const risultato = cercaOvunque(q, cache, malattieDb);
  renderRicerca(risultato, !!cache);
}

function renderRicerca(risultato, statusSincronizzato) {
  const { malattie, farmaci } = risultato;
  const nessunaMalattia = !malattie || malattie.length === 0;
  const nessunFarmaco = !farmaci || farmaci.length === 0;

  if (nessunaMalattia && nessunFarmaco) {
    resultsEl.innerHTML = `<div class="empty"><div class="big">Nessun risultato</div>Prova il nome di una patologia (es. "asma") o di un farmaco/principio attivo (es. "ibuprofene").</div>`;
    return;
  }

  let html = '';

  if (!nessunFarmaco) {
    html += `
      <div class="aifa-card">
        <div class="aifa-card-titolo">Farmaci trovati</div>
        <ul class="aifa-campo-lista">${farmaci.map((f) => `
          <li><button class="farmaco-chip-inline" data-farmaco="${escapeHtml(f.denominazione)}">${escapeHtml(f.denominazione)}</button></li>
        `).join('')}</ul>
      </div>
    `;
  }

  if (!nessunaMalattia) {
    html += malattie.map((r) => {
      let corpo = '';
      if (!statusSincronizzato) {
        corpo = `<div class="no-data-hint">Sincronizza il database AIFA per vedere i farmaci disponibili per questa patologia.</div>`;
      } else if (r.farmaci.length === 0) {
        corpo = `<div class="aifa-campo-vuoto">Nessun farmaco trovato nel database sincronizzato per le classi terapeutiche associate.</div>`;
      } else {
        corpo = `<ul class="aifa-campo-lista">${r.farmaci.map((f) => `
          <li><button class="farmaco-chip-inline" data-farmaco="${escapeHtml(f.denominazione)}">${escapeHtml(f.denominazione)}</button></li>
        `).join('')}</ul>`;
      }

      return `
        <div class="aifa-card">
          <div class="aifa-card-titolo">${escapeHtml(r.name)}</div>
          <div class="aifa-card-azienda"><b>Area terapeutica:</b> ${escapeHtml(r.cat)}</div>
          <div class="aifa-grid">
            <div>
              <div class="aifa-campo-titolo">Farmaci associati</div>
              ${corpo}
            </div>
            <div>
              <div class="aifa-campo-titolo">Nota</div>
              <div style="font-size:13.5px;color:var(--ink);line-height:1.5;">${escapeHtml(r.note)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  resultsEl.innerHTML = html;
  resultsEl.querySelectorAll('.farmaco-chip, .farmaco-chip-inline[data-farmaco]').forEach((btn) => {
    btn.addEventListener('click', () => apriDettaglio(btn.dataset.farmaco));
  });
}

function apriDettaglio(denominazione) {
  const scheda = dettaglioFarmaco(denominazione, cache, malattieDb, infoPrincipiAttivi);
  vistaCorrente = { tipo: 'dettaglio', denominazione };
  if (!scheda) {
    resultsEl.innerHTML = `<button class="back-btn" id="backBtn">← torna alla ricerca</button><div class="empty"><div class="big">Scheda non trovata</div>Il farmaco potrebbe non essere più presente nel database sincronizzato.</div>`;
    document.getElementById('backBtn').addEventListener('click', tornaAllaRicerca);
    return;
  }
  renderDettaglio(scheda);
}

function tornaAllaRicerca() {
  vistaCorrente = { tipo: 'ricerca' };
  if (searchInput.value.trim()) {
    eseguiRicerca();
  } else {
    resultsEl.innerHTML = '';
  }
}

function renderDettaglio(scheda) {
  const info = scheda.infoCurata;
  const azienda = scheda.varianti[0] && scheda.varianti[0].azienda ? scheda.varianti[0].azienda : '';

  const infoCard = `
    <div class="aifa-card">
      <div class="aifa-card-titolo aifa-card-titolo-sm">Informazioni sul principio attivo</div>
      ${info ? `
        <div class="aifa-grid aifa-grid-info">
          <div><div class="aifa-campo-titolo">Categoria</div><div class="aifa-campo-testo">${escapeHtml(info.categoria)}</div></div>
          <div><div class="aifa-campo-titolo">Come agisce</div><div class="aifa-campo-testo">${escapeHtml(info.comeAgisce)}</div></div>
          <div><div class="aifa-campo-titolo">Usi principali</div><div class="aifa-campo-testo">${escapeHtml(info.usiPrincipali)}</div></div>
          ${info.controindicazioniPrincipali ? `<div><div class="aifa-campo-titolo">Controindicazioni principali</div><div class="aifa-campo-testo">${escapeHtml(info.controindicazioniPrincipali)}</div></div>` : ''}
          ${info.effettiCollateraliComuni ? `<div><div class="aifa-campo-titolo">Effetti collaterali comuni</div><div class="aifa-campo-testo">${escapeHtml(info.effettiCollateraliComuni)}</div></div>` : ''}
          ${info.interazioniPrincipali ? `<div><div class="aifa-campo-titolo">Interazioni principali</div><div class="aifa-campo-testo">${escapeHtml(info.interazioniPrincipali)}</div></div>` : ''}
          <div><div class="aifa-campo-titolo">Avvertenze generiche</div><div class="aifa-campo-testo">${escapeHtml(info.avvertenzeGeneriche)}</div></div>
        </div>
      ` : `<div class="aifa-campo-vuoto">Nessuna scheda disponibile per questo principio attivo.</div>`}
    </div>
  `;

  const malattieCard = `
    <div class="aifa-card">
      <div class="aifa-card-titolo aifa-card-titolo-sm">A cosa serve — patologie collegate</div>
      ${scheda.malattie && scheda.malattie.length > 0
        ? `<ul class="aifa-campo-lista">${scheda.malattie.map((m) => `
            <li><button class="farmaco-chip-inline" data-malattia="${escapeHtml(m.name)}">${escapeHtml(m.name)}</button></li>
          `).join('')}</ul>`
        : `<div class="aifa-campo-vuoto">Nessuna patologia collegata trovata nell'elenco curato.</div>`}
    </div>
  `;

  const variantiCard = `
    <div class="aifa-card">
      <div class="aifa-card-titolo aifa-card-titolo-sm">Varianti di prodotto disponibili</div>
      ${scheda.varianti.length > 0 ? `
        <table class="varianti-tabella">
          <thead>
            <tr><th>Nome commerciale</th><th>Composizione / confezione</th><th>AIC</th><th>Stato</th><th></th></tr>
          </thead>
          <tbody>
            ${scheda.varianti.map((v) => `
              <tr>
                <td>${escapeHtml(v.nomeEffettivo || v.denominazione) || '—'}</td>
                <td>${v.composizione
                    ? escapeHtml(v.composizione) + (v.soloDosaggio ? ' <span class="badge-dosaggio">solo dosaggio</span>' : '')
                    : '<span class="composizione-mancante">non disponibile</span>'}</td>
                <td class="mono">${escapeHtml(v.aic) || '—'}</td>
                <td>${escapeHtml(v.stato) || '—'}</td>
                <td>${v.equivalente ? '<span class="badge-eq">equivalente</span>' : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<div class="aifa-campo-vuoto">Nessuna variante trovata nel database sincronizzato.</div>`}
    </div>
  `;

  const genericiCard = `
    <div class="aifa-card">
      <div class="aifa-card-titolo aifa-card-titolo-sm">Farmaci generici collegati</div>
      ${scheda.generici.length > 0
        ? `<ul class="aifa-campo-lista">${scheda.generici.map((nome) => `
            <li><button class="farmaco-chip-inline" data-farmaco="${escapeHtml(nome)}">${escapeHtml(nome)}</button></li>
          `).join('')}</ul>`
        : `<div class="aifa-campo-vuoto">Nessun farmaco equivalente collegato (può trattarsi di un farmaco ancora coperto da brevetto/esclusiva).</div>`}
    </div>
  `;

  resultsEl.innerHTML = `
    <button class="back-btn" id="backBtn">← torna alla ricerca</button>

    <div class="aifa-card">
      <div class="aifa-card-titolo">${escapeHtml(scheda.denominazione)}</div>
      ${azienda ? `<div class="aifa-card-azienda"><b>Azienda titolare:</b> ${escapeHtml(azienda)}</div>` : ''}

      <div class="aifa-link-row">
        <a class="aifa-link" href="${escapeHtml(scheda.linkFi)}" target="_blank" rel="noopener" title="Apre il foglio illustrativo sul sito AIFA">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
          Foglio Illustrativo
        </a>
        <a class="aifa-link" href="${escapeHtml(scheda.linkRcp)}" target="_blank" rel="noopener" title="Apre il riassunto caratteristiche prodotto sul sito AIFA">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="7 12 10 12 11 9 13 15 14 12 17 12"/></svg>
          Riassunto Caratteristiche Prodotto
        </a>
        <button class="aifa-link aifa-link-fallback" id="cercaAifaBtn" data-nome="${escapeHtml(scheda.denominazione)}" title="Se i link diretti sopra non si aprono, cerca il farmaco manualmente sul portale AIFA">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Cerca su AIFA
        </button>
      </div>
      <div class="install-hint">Se il Foglio Illustrativo o il Riassunto Caratteristiche Prodotto non si aprono (capita, AIFA a volte rifiuta il link diretto), usa "Cerca su AIFA": copia il nome del farmaco e apre la ricerca ufficiale, pronto da incollare.</div>

      <div class="aifa-grid">
        <div>
          <div class="aifa-campo-titolo">Principi Attivi</div>
          ${scheda.principiAttivi.length > 0
            ? `<ul class="aifa-campo-lista">${scheda.principiAttivi.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
            : `<div class="aifa-campo-vuoto">non specificato</div>`}
        </div>
        <div>
          <div class="aifa-campo-titolo">Vie di somministrazione</div>
          ${scheda.vieSomministrazione.length > 0
            ? `<ul class="aifa-campo-lista">${scheda.vieSomministrazione.map((v) => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`
            : `<div class="aifa-campo-vuoto">non deducibile dai dati sincronizzati</div>`}
        </div>
        <div>
          <div class="aifa-campo-titolo">Classe terapeutica</div>
          ${scheda.descrizioneAtc
            ? `<ul class="aifa-campo-lista"><li>${escapeHtml(scheda.descrizioneAtc)}</li></ul>`
            : `<div class="aifa-campo-vuoto">non specificata</div>`}
        </div>
        <div>
          <div class="aifa-campo-titolo">Forma farmaceutica</div>
          ${scheda.formeFarmaceutiche.length > 0
            ? `<ul class="aifa-campo-lista">${scheda.formeFarmaceutiche.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
            : `<div class="aifa-campo-vuoto">non deducibile dai dati sincronizzati</div>`}
        </div>
        <div>
          <div class="aifa-campo-titolo">Regime di fornitura</div>
          ${scheda.fornitura
            ? `<ul class="aifa-campo-lista"><li>${escapeHtml(scheda.fornitura)}</li></ul>`
            : `<div class="aifa-campo-vuoto">non specificato</div>`}
        </div>
      </div>
    </div>

    ${infoCard}
    ${malattieCard}
    ${variantiCard}
    ${genericiCard}
  `;

  document.getElementById('backBtn').addEventListener('click', tornaAllaRicerca);
  const cercaAifaBtn = document.getElementById('cercaAifaBtn');
  if (cercaAifaBtn) {
    cercaAifaBtn.addEventListener('click', () => {
      const nome = cercaAifaBtn.dataset.nome || '';
      if (navigator.clipboard && nome) {
        navigator.clipboard.writeText(nome).catch(() => {});
      }
      window.open('https://medicinali.aifa.gov.it/it/#/it/', '_blank', 'noopener');
    });
  }
  resultsEl.querySelectorAll('.farmaco-chip, .farmaco-chip-inline[data-farmaco]').forEach((btn) => {
    btn.addEventListener('click', () => apriDettaglio(btn.dataset.farmaco));
  });
  resultsEl.querySelectorAll('.farmaco-chip-inline[data-malattia]').forEach((btn) => {
    btn.addEventListener('click', () => {
      searchInput.value = btn.dataset.malattia;
      eseguiRicerca();
    });
  });
}

// --- Avvio ---
async function avvia() {
  const [malattieRes, principiRes] = await Promise.all([
    fetch('data/malattie-atc.json'),
    fetch('data/principi-attivi-info.json')
  ]);
  malattieDb = await malattieRes.json();
  infoPrincipiAttivi = await principiRes.json();

  cache = await caricaCacheIndexedDb();
  await aggiornaStato();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

avvia();
