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

## Importante: la sincronizzazione dei dati AIFA

Al primo utilizzo l'app non ha ancora i farmaci veri e propri: bisogna
premere "Sincronizza database AIFA" (serve internet). Il sito di AIFA
potrebbe rifiutare il download diretto dal browser per una politica di
sicurezza chiamata CORS: se succede, il pulsante mostra un messaggio
chiaro invece di un errore tecnico. In quel caso fammelo sapere: si
risolve aggiungendo un piccolo "ponte" gratuito (proxy) tra AIFA e l'app.

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
