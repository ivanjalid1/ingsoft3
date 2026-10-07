# deploy/ — cómo se despliega el TP6 en el VPS

QA (`https://qa.testingwebapp.site`) y PROD (`https://prod.testingwebapp.site`)
corren en un VPS compartido (Ubuntu 24, nginx + certbot en el host), cada uno
como un proyecto de docker compose (`tp6-qa`, `tp6-prod`). Esta carpeta versiona
todo lo que hace falta para entender y reconstruir ese deploy. El porqué de cada
decisión está en [`decisiones.md`](../decisiones.md) (sección TP6).

| Archivo | Qué es |
|---|---|
| `compose.yml` | El stack (mysql + backend + frontend) por imagen `sha-<sha>`. `deploy.sh` lo baja **del mismo sha** que despliega. |
| `bootstrap.sh` | El punto de entrada fijo del comando forzado. Instalado (a mano) como `/opt/ingsoft3-tp6/deploy.sh`. |
| `deploy.sh` | La lógica del deploy. **No se instala**: el bootstrap la baja del mismo sha que despliega y la ejecuta. |
| `.env.example` | Nombres de las variables del `.env` de cada entorno, con placeholders. |
| `authorized_keys.example` | Las dos líneas con forced command (keys reemplazadas por placeholders). |
| `nginx/*.conf` | Copias de los vhosts del host (las líneas SSL las maneja certbot). |

## Qué vive dónde

**a) Variables del repo (GitHub → Settings → Secrets and variables → Actions → Variables)**

- `VPS_HOST`: IP/host del VPS.
- `VPS_KNOWN_HOSTS`: la(s) línea(s) `known_hosts` del VPS (`ssh-keyscan -t ed25519 <host>`).

Son **variables y no secrets** porque no son información secreta: la IP es
pública y la host key la entrega el servidor a cualquiera que se conecte. Lo que
importa de `VPS_KNOWN_HOSTS` no es ocultarla sino **fijarla**: con
`StrictHostKeyChecking=yes` el job sólo se conecta si el servidor presenta esa
identidad, lo que evita un MITM (nada de "aceptar cualquier host").

**b) Secrets de environment: `DEPLOY_SSH_KEY` en `qa` y en `production`**

Mismo nombre, **keys distintas**. El job toma el secret del environment en el
que corre, así que el YAML es idéntico para QA y PROD, pero la key de QA sólo
existe para jobs del environment `qa`, y la de PROD sólo para `production` (que
además pide aprobación). Y en el VPS cada key sólo puede ejecutar su entorno.

**c) Archivos en el VPS**

| Ruta | Dueño / modo | En el repo |
|---|---|---|
| `/opt/ingsoft3-tp6/deploy.sh` | `root:root 755` | `deploy/bootstrap.sh` (ojo: nombre distinto) |
| `/opt/ingsoft3-tp6/{qa,prod}/` | `tp6deploy 750` | — (ahí quedan `compose.yml`, `init.sql`, `deploy-run.sh` del último deploy y `deploy.log`) |
| `/opt/ingsoft3-tp6/{qa,prod}/.env` | `tp6deploy 600` | sólo `deploy/.env.example` (**los valores nunca se versionan**) |
| `/home/tp6deploy/.ssh/authorized_keys` | `tp6deploy 600` | `deploy/authorized_keys.example` |
| `/etc/nginx/sites-available/{qa,prod}.testingwebapp.site.conf` | root | `deploy/nginx/` |

**d) Imágenes en ghcr.io (públicas)**

`ghcr.io/ivanjalid1/ingsoft3-tp01-{backend,frontend}:sha-<sha>` son paquetes
públicos y el VPS las baja **de forma anónima**: no hay `docker login` ni token
en el VPS. Si los paquetes pasaran a privados, el `compose pull` fallaría y
habría que agregar un token de sólo lectura (`read:packages`) en el VPS.

## El flujo

```
merge a main
  └─ CI: tests → build → push ghcr.io/...:sha-<sha>   (backend y frontend)
      └─ deploy-qa (environment qa, key de QA)
          └─ ssh tp6deploy@VPS_HOST "<sha>"
              └─ forced command: /opt/ingsoft3-tp6/deploy.sh qa      (= bootstrap.sh, fijo)
                  ├─ valida entorno (qa|prod) y sha (40 hex)
                  ├─ baja deploy/deploy.sh de raw.githubusercontent.com/.../<sha>
                  │    (404 en commits viejos → lógica legacy embebida)
                  └─ exec deploy.sh qa <sha>                       (versionado con el commit)
                      ├─ baja compose.yml e init.sql del mismo <sha>
                      ├─ IMAGE_TAG=<sha> docker compose -p tp6-qa pull
                      ├─ docker compose up -d --wait
                      └─ deploy.log: env=qa sha=<sha> exit=<rc>
          └─ smoke: /api/health (version == sha), /api/health/db, /
      └─ deploy-prod (environment production: aprobación) → igual con deploy.sh prod
```

**Rollback:** `.github/workflows/rollback.yml` (workflow_dispatch con el `sha`
de un deploy bueno). Es el mismo despliegue apuntando a una imagen anterior; no
revierte datos ni esquema.

## Bootstrap fijo + script versionado (y por qué es seguro)

El forced command apunta a un **bootstrap fijo** (`bootstrap.sh`) que no se
actualiza desde el repo. Lo que garantiza, y que nadie puede cambiar empujando
a `main`:

1. **key → entorno**: el entorno lo pone el forced command de `authorized_keys`,
   no el cliente. Con la key de QA no se puede desplegar PROD.
2. **la única entrada es un sha** de 40 hex; cualquier otra cosa sale con código 2.

Todo lo demás (`deploy.sh`) lo baja **del mismo sha** que despliega. Esto no
agrega confianza nueva: el repo en ese sha **ya** decide `compose.yml`, y quien
controla el compose controla docker (que en la práctica es root en el host).
Ese sha además es el que pasó los tests, la publicación de imágenes y, para
PROD, la aprobación. A cambio, la lógica del deploy viaja con el commit: se
cambia con un PR, y un **rollback también vuelve atrás el script**.

Commits anteriores a este cambio (p.ej. `v6.0.0` = `c231030`) no tienen
`deploy/deploy.sh`: raw.githubusercontent responde 404 y el bootstrap usa la
lógica original embebida (queda `bootstrap=legacy` en `deploy.log`). Cualquier
otro error de descarga (red, 5xx) falla sin tocar nada.

**Lo que sigue teniendo drift:** el bootstrap. Si cambia `deploy/bootstrap.sh`
(debería ser raro), hay que reinstalarlo a mano:

```bash
scp deploy/bootstrap.sh <admin>@<vps>:/tmp/bootstrap.sh
ssh <admin>@<vps> 'sudo install -o root -g root -m 755 /tmp/bootstrap.sh /opt/ingsoft3-tp6/deploy.sh'
```

## Setup desde cero en un VPS nuevo

Requisitos: Docker con el plugin compose, nginx, certbot (`python3-certbot-nginx`).

```bash
# 1. Usuario de deploy, sin contraseña, en el grupo docker
sudo adduser --disabled-password --gecos "" tp6deploy
sudo usermod -aG docker tp6deploy

# 2. Directorios
sudo install -d -o root -g root -m 755 /opt/ingsoft3-tp6
sudo install -d -o tp6deploy -g tp6deploy -m 750 /opt/ingsoft3-tp6/qa /opt/ingsoft3-tp6/prod

# 3. Un .env por entorno (partir de deploy/.env.example; FRONT_PORT 3610 qa / 3620 prod;
#    cada secreto con: openssl rand -hex 24, distintos entre QA y PROD)
sudo -u tp6deploy sh -c 'umask 077; cat > /opt/ingsoft3-tp6/qa/.env'     # pegar y Ctrl-D
sudo -u tp6deploy sh -c 'umask 077; cat > /opt/ingsoft3-tp6/prod/.env'

# 4. El bootstrap del comando forzado (deploy.sh NO se instala: se baja por sha)
sudo install -o root -g root -m 755 deploy/bootstrap.sh /opt/ingsoft3-tp6/deploy.sh

# 5. Dos keys (en una máquina local) y authorized_keys con forced command
ssh-keygen -t ed25519 -N "" -C tp6-deploy-qa   -f tp6_qa
ssh-keygen -t ed25519 -N "" -C tp6-deploy-prod -f tp6_prod
sudo install -d -o tp6deploy -g tp6deploy -m 700 /home/tp6deploy/.ssh
#   escribir /home/tp6deploy/.ssh/authorized_keys según deploy/authorized_keys.example
#   (tp6deploy:tp6deploy, chmod 600)

# 6. DNS: registros A  qa.testingwebapp.site y prod.testingwebapp.site → IP del VPS

# 7. vhosts + TLS (copiar deploy/nginx/*.conf SIN las líneas "managed by Certbot",
#    o sea sólo el server{} de :80 con el location /; certbot agrega el resto)
sudo cp qa.testingwebapp.site.conf prod.testingwebapp.site.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/qa.testingwebapp.site.conf   /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/prod.testingwebapp.site.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d qa.testingwebapp.site     # un certificado por dominio
sudo certbot --nginx -d prod.testingwebapp.site

# 8. GitHub (desde el repo, con gh)
gh variable set VPS_HOST --body "<ip-del-vps>"
ssh-keyscan -t ed25519 <ip-del-vps> | gh variable set VPS_KNOWN_HOSTS   # verificar el fingerprint por otro canal
gh secret set DEPLOY_SSH_KEY --env qa         < tp6_qa
gh secret set DEPLOY_SSH_KEY --env production < tp6_prod

# 9. Probar: ssh -i tp6_qa tp6deploy@<vps> ls   → debe salir con código 2 (no es un sha)
#    después, borrar las privadas locales tp6_qa / tp6_prod (ya están en GitHub)
```
