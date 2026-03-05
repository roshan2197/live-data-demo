# Live Data Demo (Debezium CDC)

This repo streams MariaDB changes through Debezium + Kafka into a Node.js WebSocket server, then renders live updates in an Angular UI.

## Routes

- `/data` — live grid
- `/form` — live edit form (multi-client updates)

## Run

1. `docker compose up -d`
2. `node server/server-debezium.js`
3. `npm start`
4. Open `http://localhost:4200/`
