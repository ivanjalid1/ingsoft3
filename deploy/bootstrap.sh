#!/bin/bash
# ---------------------------------------------------------------------------
# TP6 · Bootstrap del deploy en el VPS (punto de entrada del comando forzado).
#
# Instalado en: /opt/ingsoft3-tp6/deploy.sh  (root:root, modo 755)
# (conserva ese nombre para que los forced commands de authorized_keys no cambien:
#  "deploy.sh qa" con la key de QA, "deploy.sh prod" con la de PROD).
#
# Es FIJO y mínimo: no se actualiza solo desde el repo. Lo que garantiza, y que
# nadie puede cambiar empujando al repo:
#   1. key -> entorno: el entorno lo pone el forced command, no el cliente.
#   2. la única entrada es un sha de 40 hex (llega en $SSH_ORIGINAL_COMMAND).
# Después baja deploy/deploy.sh DE ESE MISMO SHA y le pasa el control. Eso no
# agrega confianza nueva: el repo en ese sha ya decide compose.yml (y quien
# controla el compose controla docker, que equivale a root). Ese sha además es
# el que pasó el pipeline y, para PROD, la aprobación. A cambio, la lógica del
# deploy queda versionada con el commit y un rollback también vuelve atrás el
# script.
#
# Commits anteriores a deploy/deploy.sh (p.ej. v6.0.0 = c231030) no lo tienen:
# si raw.githubusercontent responde 404, se usa la lógica embebida (legacy) que
# es la del deploy original, y queda anotado en deploy.log.
#
# Si cambiás ESTE archivo, reinstalalo a mano (ver deploy/README.md):
#   sudo install -o root -g root -m 755 bootstrap.sh /opt/ingsoft3-tp6/deploy.sh
# ---------------------------------------------------------------------------
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
RAW=https://raw.githubusercontent.com/ivanjalid1/ingsoft3-tp01/$SHA
cd "$DIR"
log_line(){ echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) env=$ENV sha=$SHA $*" >> "$LOG" || true; }

# Lógica original (pre deploy/deploy.sh), para commits viejos. No tocar: es lo
# que corre un rollback a v6.0.0.
legacy_deploy(){
  log_exit(){ rc=$?; echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) env=$ENV sha=$SHA exit=$rc" >> "$LOG" || true; }
  trap log_exit EXIT
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
}

# Sin -f: necesitamos el código HTTP para distinguir "no existe en este sha"
# (404 -> legacy) de un error real (red, 5xx -> se falla sin tocar nada).
if ! CODE="$(curl -sS -o deploy-run.sh.tmp -w '%{http_code}' "$RAW/deploy/deploy.sh")"; then
  rm -f deploy-run.sh.tmp
  log_line "exit=1 bootstrap=error-descarga"
  echo "ERROR: could not download deploy/deploy.sh for $SHA" >&2
  exit 1
fi
case "$CODE" in
  200)
    mv deploy-run.sh.tmp deploy-run.sh
    exec bash ./deploy-run.sh "$ENV" "$SHA"
    ;;
  404)
    rm -f deploy-run.sh.tmp
    log_line "bootstrap=legacy (deploy/deploy.sh no existe en este sha)"
    legacy_deploy
    ;;
  *)
    rm -f deploy-run.sh.tmp
    log_line "exit=1 bootstrap=error-http-$CODE"
    echo "ERROR: unexpected HTTP $CODE downloading deploy/deploy.sh for $SHA" >&2
    exit 1
    ;;
esac
