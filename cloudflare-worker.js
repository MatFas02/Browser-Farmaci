// Cloudflare Worker — proxy per bypassare il blocco CORS di AIFA.
// Riceve richieste dall'app "Indice Terapeutico" e le inoltra ai server
// di AIFA, poi restituisce la risposta con le intestazioni CORS aggiunte,
// così il browser dell'utente può leggerla (cosa che AIFA impedisce se
// la richiesta arriva direttamente dal browser).

// Elenco dei soli indirizzi AIFA che il proxy è autorizzato a contattare:
// qualunque altro indirizzo viene rifiutato, per evitare che il proxy
// venga usato per scaricare contenuti arbitrari da altri siti.
const HOST_CONSENTITI = ['drive.aifa.gov.it', 'www.aifa.gov.it', 'api.aifa.gov.it'];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Gestione della richiesta "preflight" CORS che il browser invia
    // automaticamente prima della richiesta vera e propria.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    // L'indirizzo AIFA da scaricare arriva come parametro ?url=...
    const destinazione = url.searchParams.get('url');
    if (!destinazione) {
      return new Response('Parametro "url" mancante.', { status: 400 });
    }

    let destUrl;
    try {
      destUrl = new URL(destinazione);
    } catch (e) {
      return new Response('URL non valido.', { status: 400 });
    }

    if (!HOST_CONSENTITI.includes(destUrl.hostname)) {
      return new Response('Host non consentito da questo proxy.', { status: 403 });
    }

    let rispostaAifa;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      rispostaAifa = await fetch(destUrl.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IndiceTerapeutico/1.0)' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (e) {
      const messaggio = e.name === 'AbortError'
        ? 'Il sito AIFA non ha risposto entro 15 secondi.'
        : `Errore nel contattare AIFA: ${e.message}`;
      return new Response(messaggio, {
        status: 504,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    const nuoveIntestazioni = new Headers(rispostaAifa.headers);
    nuoveIntestazioni.set('Access-Control-Allow-Origin', '*');
    // AIFA a volte manda "Content-Disposition: attachment", che fa comparire
    // la richiesta di download di Safari invece di mostrare il PDF
    // direttamente nella pagina. Forziamo "inline" così viene sempre
    // visualizzato, mai proposto come download.
    if (nuoveIntestazioni.has('Content-Disposition')) {
      nuoveIntestazioni.set('Content-Disposition', 'inline');
    }

    return new Response(rispostaAifa.body, {
      status: rispostaAifa.status,
      headers: nuoveIntestazioni
    });
  }
};
