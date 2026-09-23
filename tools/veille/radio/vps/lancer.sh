#!/bin/sh
# Veille radio Sahel sur le VPS (appele par cron toutes les 30 min).
#   crontab : 20,50 * * * * /opt/veille-radio/lancer.sh
# Lit les flux des studios ; ne transcrit que les journaux nouveaux, donc un
# passage sans nouveaute ne coute que trois requetes RSS.
# Transcription whisper.cpp sur le CPU (2 coeurs, ~1,5 x la duree de l'audio),
# en priorite basse pour ne pas gener OpenCTI, Hermes et yente.
DIR=/opt/veille-radio
LOG="$DIR/radio.log"
cd "$DIR" || exit 1

# Un seul passage a la fois (un journal de 35 min prend ~50 min a transcrire).
# Verrou pris une seule fois sur le descripteur 9, avant de raccourcir le journal.
exec 9>/tmp/veille-radio.lock
flock -n 9 || exit 0

# Raccourci SUR PLACE (cat >, pas mv) : un mv remplace le fichier, et une capture
# longue encore en cours écrirait dans l'ancien, invisible (journal perdu le 23/09).
[ -f "$LOG" ] && tail -n 2000 "$LOG" > "$LOG.tmp" && cat "$LOG.tmp" > "$LOG" && rm -f "$LOG.tmp"

# Cle Mistral relue a chaque passage dans le fichier de la veille Hermes (mis a
# jour par rotate-mistral-key.sh), jamais copiee. Identifiants Supabase lus dans
# le .env de la veille cyber. Transmis par variables d'environnement : absents
# de la liste des processus.
lire() { grep "^$1=" "$2" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"' \r'; }
MISTRAL_API_KEY=$(lire MISTRAL_API_KEY /docker/hermes-agent/data/veille/.env)
SUPABASE_URL=$(lire SUPABASE_URL /opt/veille-cyber/.env)
SUPABASE_SERVICE_ROLE=$(lire SUPABASE_SERVICE_ROLE /opt/veille-cyber/.env)
export MISTRAL_API_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE

export WHISPER_BIN="$DIR/whisper.cpp/build/bin/whisper-cli"
export WHISPER_MODEL="$DIR/models/ggml-large-v3-turbo-q5_0.bin"
export WHISPER_THREADS=2
# Une seule transcription à la fois sur le VPS, tous scripts confondus.
export WHISPER_LOCK=/tmp/veille-whisper.lock

echo "=== $(date -u '+%Y-%m-%d %H:%M UTC')" >> "$LOG"
nice -n 15 node "$DIR/app/radio/radio.mjs" --since 2 --max 4 --publier >> "$LOG" 2>&1 9>&-

# Transcriptions en cache : 30 jours suffisent (la sortie garde 14 jours).
find "$DIR/app/radio/state/transcripts" -type f -mtime +30 -delete 2>/dev/null
