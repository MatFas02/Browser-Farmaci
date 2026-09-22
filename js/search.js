// Logica di ricerca — porting per browser (PWA) da main/search.js dell'app desktop.
// Stessa logica in tre livelli: patologia -> farmaci, farmaco -> scheda, scheda -> generici.

function normalizza(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function trovaMalattie(query, malattie) {
  const q = normalizza(query);
  if (!q) return [];
  return malattie.filter((m) => {
    const haystack = normalizza(m.name + ' ' + m.syn);
    return haystack.includes(q);
  });
}

function trovaFarmaciPerNome(query, cache, limite = 20) {
  const q = normalizza(query);
  if (!q || q.length < 3 || !cache || !cache.farmaci) return [];

  const visti = {};
  const risultati = [];
  for (const f of cache.farmaci) {
    if (risultati.length >= limite) break;
    const nome = (f.denominazione || '').trim();
    if (!nome) continue;
    const chiave = nome.toUpperCase();
    if (visti[chiave]) continue;
    const testoRicerca = normalizza(nome + ' ' + (f.principioAttivo || ''));
    if (testoRicerca.includes(q)) {
      visti[chiave] = true;
      risultati.push({ denominazione: nome, principioAttivo: f.principioAttivo });
    }
  }
  return risultati.sort((a, b) => a.denominazione.localeCompare(b.denominazione));
}

function malattiePerAtc(atc, malattie) {
  if (!atc) return [];
  return malattie
    .filter((m) => m.atc.some((prefix) => atc.startsWith(prefix)))
    .map((m) => ({ name: m.name, cat: m.cat, note: m.note }));
}

function infoPerPrincipioAttivo(principioAttivo, infoPrincipiAttivi) {
  if (!principioAttivo) return null;
  const chiaveDiretta = normalizza(principioAttivo);
  if (infoPrincipiAttivi[chiaveDiretta]) return infoPrincipiAttivi[chiaveDiretta];
  for (const chiave of Object.keys(infoPrincipiAttivi)) {
    if (chiaveDiretta.includes(chiave)) return infoPrincipiAttivi[chiave];
  }
  return null;
}

function dividiPrincipiAttivi(principioAttivo) {
  if (!principioAttivo) return [];
  return principioAttivo
    .split(/\s*\+\s*|\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const VIA_PER_FORMA = [
  { via: 'Orale', re: /COMPRESS|CAPSUL|CONFETT|GRANULAT|SCIROPP|SOSPENSIONE ORALE|GOCCE ORALI|TISANA|BUSTIN|POLVERE (PER|ORALE)/ },
  { via: 'Rettale', re: /SUPPOST|CLISMA/ },
  { via: 'Cutanea', re: /CREMA|POMATA|UNGUENTO|\bGEL\b|CEROTTO|SCHIUMA CUTANEA/ },
  { via: 'Oftalmica', re: /COLLIRIO|OFTALMIC/ },
  { via: 'Nasale', re: /NASALE/ },
  { via: 'Inalatoria', re: /INALAZ|AEROSOL|POLVERE PER INALAZIONE/ },
  { via: 'Parenterale', re: /INIETTABIL|FIALE|ENDOVEN|INTRAMUSCOL/ },
  { via: 'Vaginale', re: /OVUL|CANDELETT|VAGINALE/ },
  { via: 'Auricolare', re: /AURICOLAR|OTOLOGIC/ }
];

function dedurreVia(forma) {
  if (!forma) return null;
  const t = forma.toUpperCase();
  const match = VIA_PER_FORMA.find((p) => p.re.test(t));
  return match ? match.via : null;
}

function elencoFarmaciPerPatologia(query, cache, malattieDb) {
  const malattieTrovate = trovaMalattie(query, malattieDb);

  return malattieTrovate.map((m) => {
    const risultato = { name: m.name, cat: m.cat, note: m.note, farmaci: [] };

    if (cache && cache.farmaci) {
      const matches = cache.farmaci.filter((f) =>
        m.atc.some((prefix) => f.atc && f.atc.startsWith(prefix))
      );

      const perNome = {};
      for (const f of matches) {
        const nome = (f.denominazione || '').trim();
        if (!nome) continue;
        const chiave = nome.toUpperCase();
        if (!perNome[chiave]) {
          perNome[chiave] = { denominazione: nome, principioAttivo: f.principioAttivo, numeroConfezioni: 0 };
        }
        perNome[chiave].numeroConfezioni += 1;
      }

      risultato.farmaci = Object.values(perNome).sort((a, b) => a.denominazione.localeCompare(b.denominazione));
    }

    return risultato;
  });
}

function testoDosaggioDaAic(aic, dosaggioPerAic) {
  const voci = dosaggioPerAic && aic ? dosaggioPerAic[aic] : null;
  if (!voci || voci.length === 0) return null;
  return voci.map((v) => [v.principio, v.quantita, v.unita].filter(Boolean).join(' ')).filter(Boolean).join(' + ');
}

function dettaglioFarmaco(denominazione, cache, malattieDb, infoPrincipiAttivi) {
  if (!cache || !cache.farmaci) return null;
  const chiave = normalizza(denominazione);

  const varianti = cache.farmaci.filter((f) => normalizza(f.denominazione) === chiave);
  if (varianti.length === 0) return null;

  const atcRappresentativo = varianti[0].atc;
  const nomeDaAtc = (cache.atc && atcRappresentativo && cache.atc[atcRappresentativo]) || '';
  const principioAttivo = varianti[0].principioAttivo || nomeDaAtc;
  const atcSottogruppo = atcRappresentativo ? atcRappresentativo.slice(0, 5) : '';
  const descrizioneAtc = (cache.atc && cache.atc[atcSottogruppo]) || nomeDaAtc || '';

  const linkFi = varianti.find((f) => f.linkFi)?.linkFi || '';
  const linkRcp = varianti.find((f) => f.linkRcp)?.linkRcp || '';

  const gruppiTrovati = new Set();

  const variantiArricchite = varianti.map((f) => {
    const eq = cache.equivalenti && f.aic ? cache.equivalenti[f.aic] : null;
    if (eq && eq.gruppoEquivalenza) gruppiTrovati.add(eq.gruppoEquivalenza);
    let composizione = f.descrizione || (eq ? eq.confezioneTesto : null);
    let soloDosaggio = false;
    if (!composizione) {
      composizione = testoDosaggioDaAic(f.aic, cache.dosaggioPerAic);
      soloDosaggio = !!composizione;
    }
    return {
      aic: f.aic, denominazione: f.denominazione,
      azienda: f.azienda, stato: f.stato, atc: f.atc,
      forma: f.forma || null, fornitura: f.fornitura || null,
      composizione: composizione || null, soloDosaggio, equivalente: !!eq
    };
  });

  const variantiUniche = Object.values(
    variantiArricchite.reduce((acc, v) => { acc[v.aic || Math.random()] = v; return acc; }, {})
  );

  const formeUniche = new Set();
  const vieUniche = new Set();
  for (const v of variantiUniche) {
    if (v.forma) {
      formeUniche.add(v.forma);
      const via = dedurreVia(v.forma);
      if (via) vieUniche.add(via);
    }
  }

  const nomiGenerici = new Set();
  if (cache.gruppoEquivalenza) {
    for (const gruppo of gruppiTrovati) {
      const nomi = cache.gruppoEquivalenza[gruppo] || [];
      for (const nome of nomi) {
        if (normalizza(nome) !== chiave) nomiGenerici.add(nome);
      }
    }
  }

  const fornitureViste = variantiUniche.map((v) => v.fornitura).filter(Boolean);
  const fornitura = fornitureViste.length > 0 ? fornitureViste[0] : null;

  return {
    denominazione: varianti[0].denominazione,
    principioAttivo,
    principiAttivi: dividiPrincipiAttivi(principioAttivo),
    atc: atcRappresentativo,
    descrizioneAtc,
    formeFarmaceutiche: Array.from(formeUniche),
    vieSomministrazione: Array.from(vieUniche),
    fornitura, linkFi, linkRcp,
    infoCurata: infoPerPrincipioAttivo(principioAttivo, infoPrincipiAttivi),
    varianti: variantiUniche.sort((a, b) => (a.composizione || '').localeCompare(b.composizione || '')),
    generici: Array.from(nomiGenerici).sort((a, b) => a.localeCompare(b)),
    malattie: malattiePerAtc(atcRappresentativo, malattieDb)
  };
}

function cercaOvunque(query, cache, malattieDb) {
  return {
    malattie: elencoFarmaciPerPatologia(query, cache, malattieDb),
    farmaci: trovaFarmaciPerNome(query, cache)
  };
}

function elencoMalattie(malattieDb) {
  const perCategoria = {};
  for (const m of malattieDb) {
    if (!perCategoria[m.cat]) perCategoria[m.cat] = [];
    perCategoria[m.cat].push(m.name);
  }
  return Object.keys(perCategoria).sort((a, b) => a.localeCompare(b)).map((cat) => ({
    categoria: cat,
    patologie: perCategoria[cat].sort((a, b) => a.localeCompare(b))
  }));
}
