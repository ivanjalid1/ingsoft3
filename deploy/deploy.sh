#!/bin/bash
# ---------------------------------------------------------------------------
# TP6 · Punto de entrada del deploy en el VPS (comando forzado de SSH).
#
# Instalado en: /opt/ingsoft3-tp6/deploy.sh  (root:root, modo 755)
# Lo invoca SOLO el forced command de /home/tp6deploy/.ssh/authorized_keys
# ("deploy.sh qa" con la key de QA, "deploy.sh prod" con la de PROD). El
# cliente (el job de GitHub Actions) no elige el comando: lo único que manda es
# el sha, que llega en $SSH_ORIGINAL_COMMAND y se valida acá (40 hex).
#
# Esta copia del repo es la FUENTE DE VERDAD documentada. El VPS NO se
# actualiza solo: para cambiarlo, editar acá, mergear, y reinstalarlo a mano:
#
#   scp deploy/deploy.sh root@VPS:/tmp/ && #     ssh root@VPS 'install -o root -g root -m 755 /tmp/deploy.sh /opt/ingsoft3-tp6/deploy.sh'
#
# Más contexto (qué vive dónde, setup desde cero): deploy/README.md
# Fuera de estos comentarios, la lógica es idéntica byte a byte a la del VPS.
# ---------------------------------------------------------------------------
# Restricted deploy entrypoint (forced command). Usage: deploy.sh <qa|prod>, sha in $SSH_ORIGINAL_COMMAND
set -euo pipefail
ENV="${1:-}"
case "$ENV" in qa|prod) ;; *) echo "ERROR: invalid env '$ENV' (expected qa|prod)" >&2; exit 2;; esac
SHA="$(printf '%s' "${SSH_ORIGINAL_COMMAND:-}" | tr -d '[:space:]')"
if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: expected a 40-char lowercase hex commit sha, got '${SSH_ORIGINAL_COMMAND:-}'" >&2
  exit 2
fi
DIR=/opt/ingsoft3-tp6/$ENV
LOG=$DIR/deploy.log
cd "$DIR"
log_exit(){ rc=$?; echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) env=$ENV sha=$SHA exit=$rc" >> "$LOG" || true; }
trap log_exit EXIT
RAW=https://raw.githubusercontent.com/ivanjalid1/ingsoft3-tp01/$SHA
curl -fsS "$RAW/deploy/compose.yml" -o compose.yml.tmp && mv compose.yml.tmp compose.yml
curl -fsS "$RAW/tp2/backend/db/init.sql" -o init.sql.tmp && mv init.sql.tmp init.sql
export IMAGE_TAG=$SHA
DC=(docker compose -p "tp6-$ENV" --env-file .env -f compose.yml)
"${DC[@]}" pull
if docker compose up --help 2>/dev/null | grep -q -- '--wait-timeout'; then
  "${DC[@]}" up -d --remove-orphans --wait --wait-timeout 180
else
  "${DC[@]}" up -d --remove-orphans
fi
echo "DEPLOYED $ENV $SHA"
