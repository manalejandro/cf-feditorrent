# FediTorrent

**Intercambio de Torrents Federado impulsado por ActivityPub**

Comparte torrents, enlaces magnet y archivos WebTorrent a través del fediverso. Construido con Next.js 16, Cloudflare D1, Workers Queues y Durable Objects.

## Características

- **Federación ActivityPub** — Cada torrent es un objeto ActivityPub que se federa a tus seguidores
- **Enlaces Magnet** — Comparte URIs magnet de cualquier torrent
- **WebTorrent** — Sube archivos para compartir P2P de navegador a navegador
- **Tracker Integrado** — Tracker BitTorrent vía WebSocket con Durable Objects de Cloudflare
- **Interfaz Bilingüe** — Inglés y Español
- **Seguro** — Hash de contraseñas PBKDF2, verificación de firma HTTP, verificación de correo electrónico
- **Compatible con Mastodon** — WebFinger, NodeInfo, API de Mastodon

## Tecnologías

- **Framework:** Next.js 16 (React 19)
- **Despliegue:** Cloudflare Workers vía OpenNext
- **Base de datos:** Cloudflare D1 (SQLite)
- **Cola:** Cloudflare Workers Queues (entrega ActivityPub)
- **Almacenamiento:** Cloudflare KV (tokens de autenticación de torrents)
- **Tracker:** Durable Objects (tracker BitTorrent vía WebSocket)
- **Estilos:** Tailwind CSS v4
- **Auth:** PBKDF2 + sesiones

## Primeros Pasos

### Requisitos

- Node.js 20+
- Cuenta de Cloudflare con D1, KV, Queues y Durable Objects habilitados

### Configuración

```bash
# Instalar dependencias
npm install

# Crear base de datos D1
npx wrangler d1 create cf-feditorrent

# Crear namespace KV
npx wrangler kv namespace create TORRENTS_KV

# Crear Cola
npx wrangler queues create cf-feditorrent-delivery

# Actualizar wrangler.toml con tus IDs

# Ejecutar migraciones
npm run db:migrate

# Configurar secretos
npx wrangler secret put SECRET_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

### Desarrollo

```bash
npm run dev
```

### Despliegue

```bash
npm run deploy
```

## Estructura del Proyecto

```
├── app/
│   ├── api/
│   │   ├── auth/          # Registro, inicio de sesión, restablecer contraseña
│   │   ├── follow/        # Seguir/dejar de seguir actores
│   │   ├── inbox/         # Bandeja de entrada ActivityPub compartida
│   │   ├── torrents/      # CRUD de torrents
│   │   ├── tracker/       # Autenticación de tracker WebTorrent
│   │   ├── users/         # Perfiles de actor, inbox, outbox, seguidores
│   │   └── v1/ v2/        # API compatible con Mastodon
│   ├── .well-known/       # WebFinger, NodeInfo
│   ├── objects/           # Endpoints de objetos ActivityPub
│   ├── torrents/          # Páginas de redirección de torrents
│   ├── users/             # Páginas de perfil de usuario
│   └── page.tsx           # SPA principal
├── components/
│   └── FollowButton.tsx
├── lib/
│   ├── activitypub/       # Federación, procesamiento de inbox, seguridad, utils
│   ├── db/                # Esquema de base de datos y capa de acceso
│   ├── i18n/              # Diccionario Inglés/Español
│   └── types/             # Interfaces TypeScript
├── src/
│   ├── tracker-do.ts      # Durable Object tracker BitTorrent
│   └── worker.ts          # Cloudflare Worker + consumidor de cola
├── wrangler.toml          # Configuración de Cloudflare
└── middleware.ts          # CORS, cabeceras de seguridad, reescrituras de URL
```

## Endpoints de API

### ActivityPub
- `GET /.well-known/webfinger?resource=acct:user@domain` — Descubrimiento WebFinger
- `GET /.well-known/nodeinfo` — Descubrimiento NodeInfo
- `GET /nodeinfo/2.0` — Payload NodeInfo
- `GET /users/:username` — Actor JSON-LD
- `GET /users/:username/outbox` — Bandeja de salida del actor
- `GET /users/:username/followers` — Colección de seguidores
- `GET /users/:username/following` — Colección de seguidos
- `POST /users/:username/inbox` — Bandeja de entrada por actor
- `POST /inbox` — Bandeja de entrada compartida
- `GET /objects/:id` — Objeto torrent

### Autenticación
- `POST /api/auth/register` — Crear cuenta
- `POST /api/auth/login` — Iniciar sesión
- `POST /api/auth/forgot-password` — Solicitar restablecimiento de contraseña
- `POST /api/auth/reset-password` — Restablecer contraseña
- `GET /api/auth/verify-email` — Verificar correo electrónico
- `POST /api/auth/resend-verification` — Reenviar verificación

### Torrents
- `GET /api/torrents` — Listar torrents del usuario
- `POST /api/torrents` — Crear torrent
- `DELETE /api/torrents/:id` — Eliminar torrent
- `GET /torrents/:slug` — Ver torrent

### Tracker
- `POST /api/tracker/authenticate` — Autenticar torrent para compartir
- `GET /api/tracker/validate` — Validar token de torrent
- `WS /ws` — Tracker WebSocket (Durable Object)

### API Mastodon
- `GET /api/v1/instance` — Información de la instancia
- `GET /api/v2/instance` — Información extendida de la instancia
- `GET /api/v1/accounts/search?q=consulta` — Búsqueda de cuentas

### Social
- `POST /api/follow` — Seguir un actor
- `POST /api/unfollow` — Dejar de seguir un actor
- `GET /api/notifications` — Listar notificaciones
- `GET /api/notifications/count` — Conteo de no leídas
- `POST /api/notifications/:id/read` — Marcar como leída

## Comandos de Descarga

Cada página de torrent proporciona una URL de descarga directa, un archivo `.torrent` y un enlace magnet. Así se usan con los clientes más populares:

### aria2 (recomendado)

```bash
# Descargar el .torrent y dejar que aria2 maneje todo
aria2c "https://feditorrent.com/api/files/{infoHash}/{filename}.torrent"

# O descargar el archivo directamente por HTTP
aria2c -x4 -s4 "https://feditorrent.com/api/files/{infoHash}/{filename}"

# Usando un enlace magnet (requiere que otros peers estén seedeando)
aria2c "magnet:?xt=urn:btih:{infoHash}&..."
```

### WebTorrent (navegador)

Abre el enlace magnet directamente — WebTorrent soporta web seeds y descargará desde la instancia automáticamente.

### qBittorrent / Transmission / Otros clientes BitTorrent

1. Descarga el archivo `.torrent` desde la página del torrent
2. Ábrelo en tu cliente
3. El cliente se conectará al tracker y descargará desde las fuentes disponibles

### Descarga Directa

```bash
# curl
curl -L -o archivo "https://feditorrent.com/api/files/{infoHash}/{filename}"

# wget
wget "https://feditorrent.com/api/files/{infoHash}/{filename}"
```

## Licencia

MIT
