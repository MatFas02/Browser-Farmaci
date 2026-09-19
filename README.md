# Indice Terapeutico — versione web (PWA)

App web personale per la ricerca patologia <-> farmaco, collegata ai dati
aperti di AIFA (Agenzia Italiana del Farmaco). Pensata per essere
pubblicata gratuitamente su GitHub Pages e installata sulla schermata Home
di iPhone/iPad, senza App Store e senza costi.

## Cosa contiene questa cartella

index.html         pagina principale dell'app
manifest.webmanifest  descrive l'app per l'installazione su iOS
sw.js               service worker: fa funzionare l'app anche offline
js/app.js            logica dell'interfaccia
js/search.js          logica di ricerca patologia/farmaco
js/sync.js            scarica e salva i dati AIFA nel browser (IndexedDB)
js/papaparse.min.js    libreria per leggere i file CSV di AIFA
data/malattie-atc.json        le 60 patologie curate con i codici ATC
data/principi-attivi-info.json le schede dei principi attivi
icons/                icone dell'app per la schermata Home
cloudflare-worker.js    codice del proxy gratuito per bypassare il blocco AIFA (vedi sotto)

## Importante: la sincronizzazione dei dati AIFA

Al primo utilizzo l'app non ha ancora i farmaci veri e propri: bisogna
premere "Sincronizza database AIFA" (serve internet). Il sito di AIFA
rifiuta il download diretto dal browser per una politica di sicurezza
chiamata CORS: il pulsante mostra un messaggio chiaro invece di un
errore tecnico, e serve un piccolo "ponte" gratuito (proxy) tra AIFA e
l'app. La guida qui sotto spiega come attivarlo: sono circa 10 minuti,
tutto dal browser, senza installare nulla sul computer.

### Attivare il proxy gratuito (Cloudflare Worker)

1. Vai su workers.cloudflare.com e crea un account gratuito (basta
   un'email, non serve carta di credito).
2. Nella dashboard di Cloudflare, cerca la sezione "Workers e Pages" nel
   menu a sinistra, poi premi "Crea" (o "Create application" / "Create
   Worker" a seconda della lingua mostrata).
3. Scegli di creare un Worker da zero ("Create Worker" / "Hello World").
   Dagli un nome, per esempio "indice-terapeutico-proxy", e conferma.
4. Ti si aprirà un editor di codice online ("Quick edit" o simile).
   Cancella tutto il codice di esempio che trovi già scritto e incolla al
   suo posto tutto il contenuto del file "cloudflare-worker.js" incluso
   in questo pacchetto (aprilo con un editor di testo, seleziona tutto,
   copia).
5. Premi "Save and deploy" (o "Deploy").
6. Cloudflare ti mostrerà un indirizzo del tipo:
   https://indice-terapeutico-proxy.tuonomeutente.workers.dev
   Copialo per intero.
7. Apri il file "js/sync.js" di questo pacchetto con un editor di testo
   (anche il Blocco Note va bene) e trova la riga:
   const PROXY_URL = '';
   Incolla l'indirizzo copiato tra i due apici, così:
   const PROXY_URL = 'https://indice-terapeutico-proxy.tuonomeutente.workers.dev';
8. Salva il file, poi ricaricalo su GitHub (sul file "js/sync.js" del tuo
   repository, usa il pulsante a forma di matita "Edit" per sostituirne
   il contenuto, oppure ricaricalo da "Add file" -> "Upload files": in
   quel caso GitHub chiederà conferma di sovrascriverlo).
9. Aspetta un minuto, poi apri l'app e premi di nuovo "Sincronizza
   database AIFA": ora la richiesta passa dal tuo Worker invece che
   direttamente da AIFA.

Se qualcosa non funziona in questi passaggi, mandami uno screenshot e ti
aiuto a proseguire.

## Come pubblicarla gratis su GitHub Pages

1. Crea un account gratuito su github.com, se non lo hai già.
2. Crea un nuovo repository (pulsante verde "New"): dagli un nome a tua
   scelta, per esempio "indice-terapeutico". Impostalo come pubblico
   (i repository privati su GitHub Pages gratuito hanno limitazioni).
3. Carica dentro il repository TUTTO il contenuto di questa cartella
   (non la cartella stessa, il suo contenuto): puoi trascinare i file
   nella pagina del repository su github.com, sezione "Add file" ->
   "Upload files".
4. Vai su "Settings" del repository, poi sezione "Pages" nel menu a
   sinistra. Sotto "Build and deployment", scegli come sorgente il ramo
   "main" e la cartella "/ (root)". Salva.
5. Dopo un minuto o due, GitHub ti mostrerà l'indirizzo pubblico
   dell'app, di solito nella forma:
   https://tuonomeutente.github.io/indice-terapeutico/
6. Apri quell'indirizzo, verifica che l'app si carichi, poi premi
   "Sincronizza database AIFA".

## Come installarla su iPhone/iPad

1. Apri l'indirizzo dell'app con Safari (deve essere Safari, non Chrome
   o altri browser, perché solo Safari su iOS permette di installare le
   app web).
2. Tocca l'icona "Condividi" (il quadrato con la freccia verso l'alto).
3. Scorri e tocca "Aggiungi alla schermata Home".
4. Conferma: apparirà un'icona come una vera app, che apre l'app a
   schermo intero, senza barra di Safari.
5. Al primo avvio, se non l'hai già fatto da Safari, premi
   "Sincronizza database AIFA" per scaricare i dati.

Dopo il primo caricamento l'app funziona anche offline (i dati restano
salvati sul dispositivo), tranne ovviamente la sincronizzazione stessa,
che richiede connessione.

## Fonte e licenza dei dati

Dati farmaci: AIFA - Agenzia Italiana del Farmaco, Open Data, licenza
CC-BY 4.0 (https://www.aifa.gov.it/liste-dei-farmaci). Le schede delle
patologie e dei principi attivi sono una sintesi curata a scopo
didattico personale, non sostituiscono il parere di un medico o
farmacista e vanno verificate su fonti ufficiali.
