// Cloudflare Worker — proxy per l'app "Indice Terapeutico".
// 1) Scarica i dati AIFA aggiungendo le intestazioni CORS.
// 2) Per Foglio Illustrativo e RCP: AIFA invia il PDF etichettato come
//    "file generico da scaricare", che l'iPhone non riesce a mostrare.
//    Il proxy lo rietichetta come vero PDF da visualizzare nella pagina.

const HOST_CONSENTITI = ['drive.aifa.gov.it', 'www.aifa.gov.it', 'api.aifa.gov.it'];

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', ...extra };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders({
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        })
      });
    }

    const destinazione = url.searchParams.get('url');
    if (!destinazione) {
      return new Response('Parametro "url" mancante.', { status: 400, headers: corsHeaders() });
    }

    let destUrl;
    try {
      destUrl = new URL(destinazione);
    } catch (e) {
      return new Response('URL non valido.', { status: 400, headers: corsHeaders() });
    }

    if (!HOST_CONSENTITI.includes(destUrl.hostname)) {
      return new Response('Host non consentito da questo proxy.', { status: 403, headers: corsHeaders() });
    }

    let rispostaAifa;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      rispostaAifa = await fetch(destUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'application/pdf,*/*'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (e) {
      const messaggio = e.name === 'AbortError'
        ? 'Il sito AIFA non ha risposto entro 25 secondi. Riprova tra poco.'
        : `Errore nel contattare AIFA: ${e.message}`;
      return new Response(messaggio, {
        status: 504,
        headers: corsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' })
      });
    }

    // Modalità diagnostica: aggiungendo &debug=1 all'indirizzo, il proxy
    // mostra come AIFA ha risposto (stato e intestazioni) invece del file.
    if (url.searchParams.get('debug') === '1') {
      const buffer = await rispostaAifa.arrayBuffer();
      const inizio = new TextDecoder('latin1').decode(new Uint8Array(buffer).slice(0, 8));
      const info = {
        stato: rispostaAifa.status,
        dimensioneByte: buffer.byteLength,
        inizioFile: inizio,
        intestazioni: Object.fromEntries(rispostaAifa.headers.entries())
      };
      return new Response(JSON.stringify(info, null, 2), {
        headers: corsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' })
      });
    }

    // Documenti FI/RCP: scarichiamo tutto il file e, se è un PDF,
    // lo rimandiamo etichettato correttamente per la visualizzazione.
    if (destUrl.hostname === 'api.aifa.gov.it') {
      if (!rispostaAifa.ok) {
        return new Response(`AIFA ha risposto con errore ${rispostaAifa.status}: documento non disponibile.`, {
          status: rispostaAifa.status,
          headers: corsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' })
        });
      }
      const buffer = await rispostaAifa.arrayBuffer();
      const byte = new Uint8Array(buffer);
      const ePdf = byte.length > 4 && byte[0] === 0x25 && byte[1] === 0x50 && byte[2] === 0x44 && byte[3] === 0x46; // "%PDF"
      if (!ePdf) {
        return new Response(buffer, {
          status: 200,
          headers: corsHeaders({ 'Content-Type': rispostaAifa.headers.get('Content-Type') || 'text/plain; charset=utf-8' })
        });
      }
      const tipo = destUrl.searchParams.get('ts') === 'RCP' ? 'RCP' : 'FI';
      return new Response(buffer, {
        status: 200,
        headers: corsHeaders({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${tipo}.pdf"`,
          'Content-Length': String(buffer.byteLength),
          'Cache-Control': 'public, max-age=86400'
        })
      });
    }

    // Dati CSV: passaggio diretto con intestazioni CORS.
    const nuoveIntestazioni = new Headers(rispostaAifa.headers);
    nuoveIntestazioni.set('Access-Control-Allow-Origin', '*');
    return new Response(rispostaAifa.body, {
      status: rispostaAifa.status,
      headers: nuoveIntestazioni
    });
  }
};
