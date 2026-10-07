#!/bin/bash
# ---------------------------------------------------------------------------
# TP6 · Lógica del deploy de un entorno en el VPS. Uso: deploy.sh <qa|prod> <sha>
#
# NO se instala en el VPS: lo baja el bootstrap (deploy/bootstrap.sh, instalado
# como /opt/ingsoft3-tp6/deploy.sh y disparado por el forced command de SSH)
# desde raw.githubusercontent.com/<repo>/<sha>/deploy/deploy.sh, o sea DE ESE
# MISMO SHA que se despliega, y lo ejecuta como tp6deploy con "$ENV" "$SHA".
# Por eso este script viaja con el commit: cambiarlo no requiere tocar el VPS,
# y un rollback a un sha anterior corre también el script de ese sha.
#
# El bootstrap ya validó entorno y sha; acá se revalidan igual (defensa en
# profundidad: el script no debe confiar en quién lo llama).
# Más contexto: deploy/README.md
# ---------------------------------------------------------------------------
set -euo pipefail
ENV="${1:-}"
SHA="${2:-}"
case "$ENV" in qa|prod) ;; *) echo "ERROR: invalid env '$ENV' (expected qa|prod)" >&2; exit 2;; esac
if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: expected a 40-char lowercase hex commit sha, got '$SHA'" >&2
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
