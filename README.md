# Live Data Demo

Angular + Node + MariaDB demo for module-based live data grids/forms.

Primary mode is now **service-events only** (no Debezium, no Redis).
Debezium modes are still available as optional backends.

## Modules and Routes

- `sales-orders`
  - Grid: `/sales-orders`
  - Form: `/sales-orders/form`
- `customers`
  - Grid: `/customers`
  - Form: `/customers/form`
- `products`
  - Grid: `/products`
  - Form: `/products/form`

## Run (Events-Only, Recommended)

### 1) Start database

```bash
docker compose up -d mariadb
```

### 2) Start backend

```bash
cd server
npm install
npm run dev:events-only
```

### 3) Start frontend

```bash
# from project root
npm install
npm start
```

### 4) Open app

`http://localhost:4200`

## Optional Backend Modes

From `server/`:

- Debezium + Kafka + Redis-capable transport:
  - `npm run dev:debezium`
- Debezium + Kafka without Redis transport:
  - `npm run dev:debezium:no-redis`
- Service-events only (no Debezium, no Redis):
  - `npm run dev:events-only`

## Backend Tests

From `server/`:

```bash
npm test
```

Current tests cover CDC consumer event mapping/emit behavior.

## Notes

- Backend defaults:
  - `DB_HOST=localhost`
  - `DB_USER=live_user`
  - `DB_PASSWORD=live_password`
  - `DB_NAME=live_data`
- For Debezium modes, start full infra:

```bash
docker compose up -d
```

## Additional Docs

- `ARCHITECTURE.md`
- `LIVE_DATA_OPTIONS.md`
- `DEBEZIUM_CDC_GUIDE.md`
