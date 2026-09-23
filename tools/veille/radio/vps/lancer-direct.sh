#!/bin/sh
# Capture en direct des radios sahéliennes (live.mjs) sur le VPS.
#   crontab :
#     6 * * * *     /opt/veille-radio/lancer-direct.sh sonde      # mesure horaire : qui diffuse un journal, à quelle heure
#     */5 * * * *   /opt/veille-radio/lancer-direct.sh capturer   # enregistre les fenêtres de journal qui commencent
#   sur événement (appelé par une autre veille, ou à la main) :
#     /opt/veille-radio/lancer-direct.sh declencher Mali 20       # 20 min sur les stations d'information du pays
# Les journaux captés sont écrits dans app/radio/state/live-bulletins.json ;
# lancer.sh (studios, toutes les 30 min) les fusionne dans la synthèse et publie.
DIR=/opt/veille-radio
MODE=${1:-capturer}
LOG="$DIR/direct.log"
cd "$DIR" || exit 1

# Un verrou par mode : une sonde longue n'empêche pas une capture programmée.
exec 9>"/tmp/veille-radio-$MODE.lock"
flock -n 9 || exit 0

# Raccourci SUR PLACE (cat >, pas mv) : un mv remplace le fichier, et une capture
# longue encore en cours écrirait dans l'ancien, invisible (journal perdu le 23/09).
[ -f "$LOG" ] && tail -n 3000 "$LOG" > "$LOG.tmp" && cat "$LOG.tmp" > "$LOG" && rm -f "$LOG.tmp"

lire() { grep "^$1=" "$2" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"' \r'; }
MISTRAL_API_KEY=$(lire MISTRAL_API_KEY /docker/hermes-agent/data/veille/.env)
export MISTRAL_API_KEY

export WHISPER_BIN="$DIR/whisper.cpp/build/bin/whisper-cli"
export WHISPER_MODEL="$DIR/models/ggml-large-v3-turbo-q5_0.bin"
# small pour la sonde : langue juste et texte lisible pour classer le genre,
# 53 s pour 90 s d'audio sur 2 cœurs (base transcrivait un journal en « ♪ ♪ ♪ »).
export SONDE_WHISPER_MODEL="$DIR/models/ggml-small-q5_1.bin"
export WHISPER_THREADS=2
# Une seule transcription à la fois sur le VPS, tous scripts confondus.
export WHISPER_LOCK=/tmp/veille-whisper.lock

case "$MODE" in
  sonde)    ARGS="--sonde --secondes 45" ;;
  capturer) ARGS="--capturer" ;;
  declencher)
    [ -n "$2" ] || { echo "declencher : pays manquant" >> "$LOG"; exit 1; }
    ARGS="--declencher --pays $2 --minutes ${3:-20}"
    echo "=== $(date -u '+%Y-%m-%d %H:%M UTC') déclenchement $2" >> "$LOG" ;;
  *)        echo "mode inconnu : $MODE" >> "$LOG"; exit 1 ;;
esac

[ "$MODE" = sonde ] && echo "=== $(date -u '+%Y-%m-%d %H:%M UTC') sonde" >> "$LOG"
nice -n 15 node "$DIR/app/radio/live.mjs" $ARGS >> "$LOG" 2>&1 9>&-

# Segments orphelins (capture interrompue) : jamais plus d'un jour.
find "$DIR/app/radio/state/segments" -type f -name '*.wav' -mmin +1440 -delete 2>/dev/null
