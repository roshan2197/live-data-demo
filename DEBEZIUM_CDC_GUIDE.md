# Debezium CDC Architecture

## Why Debezium + Kafka is Superior

```
OLD APPROACH:                          DEBEZIUM CDC APPROACH:
┌──────────────┐                       ┌──────────────┐
│ Service A    │                       │ Service A    │
│ (uses        │                       │ (any code)   │
│ wrapper)     │                       └──────────────┘
└──────┬───────┘                               │
       │                                       │
       ↓ Manual broadcast                      ↓ Writes to MariaDB
┌───────────────────────────────┐
│ change_log table or           │       ┌──────────────┐
│ direct broadcast              │       │ MariaDB      │
│ (some changes missed)         │       │ (binlog)     │
└──────┬────────────────────────┘        └──────┬───────┘
       │                                       │
       ↓                                       ↓ Binary log
    WebSocket                           ┌──────────────────────────┐
                                        │ Debezium (watches logs)  │
                                        │ ✅ Captures ALL changes  │
                                        └──────┬───────────────────┘
                                               │
                                               ↓
                                        ┌──────────────────────────┐
                                        │ Kafka Topics by table    │
                                        │ - users                  │
                                        │ - products               │
                                        │ - orders                 │
                                        │ - ... 1000+ tables       │
                                        └──────┬───────────────────┘
                                               │
                                               ↓
                                        ┌──────────────────────────┐
                                        │ Node.js Consumer         │
                                        │ (Single service)         │
                                        └──────┬───────────────────┘
                                               │
                                               ↓
                                            WebSocket
                                            to Clients
```

## Key Advantages

### ✅ Captures ALL Changes
- Watches database transaction logs (binlog)
- No missed events (unlike change_log polling)
- Exactly-once delivery semantics
- Works even if services don't use wrapper

### ✅ Service-Agnostic
- Python writes to DB → Captured ✅
- Java writes to DB → Captured ✅
- Go writes to DB → Captured ✅
- Node.js writes to DB → Captured ✅
- Direct SQL → Captured ✅
- **No code changes needed!**

### ✅ 1000+ Tables Automatically
- One Kafka topic per table
- Debezium creates topics automatically
- No configuration per table

### ✅ Real-time & Reliable
- Kafka guarantees delivery
- Consumer groups handle failures
- Can replay from any point
- Fault-tolerant architecture

### ✅ Production-Grade
- Used by Netflix, Uber, LinkedIn
- Battle-tested at scale
- Mature ecosystem
- Active community

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                    MariaDB (Production DB)                        │
│                     ┌─────────────────┐                          │
│                     │  Binary Logs    │                          │
│                     │ (Write Ahead    │                          │
│                     │  Logs - WAL)    │                          │
│                     └────────┬────────┘                          │
└────────────────────────────────────────────────────────────────────┘
                               │
                               │ Monitor via replication
                               ↓
┌───────────────────────────────────────────────────────────────────┐
│                   Debezium Connect                                 │
│                                                                     │
│  ┌────────────────────────────────────────────────────────┐       │
│  │  MySQL Connector                                       │       │
│  │  - Connects to MariaDB                                 │       │
│  │  - Reads binlog                                        │       │
│  │  - Parses change events                                │       │
│  │  - Transforms to CDC format                            │       │
│  └────────────┬──────────────────────────────────────────┘       │
│               │                                                    │
│  ┌────────────▼──────────────────────────────────────────┐       │
│  │  Schema History                                       │       │
│  │  - Tracks DDL changes                                 │       │
│  │  - Stores in Kafka topics                             │       │
│  └─────────────────────────────────────────────────────┘       │
└───────────────────────────────────────────────────────────────────┘
                               │
                               │ Publish change events
                               ↓
┌───────────────────────────────────────────────────────────────────┐
│                    Kafka Cluster                                   │
│                                                                     │
│  Topics (one per table):                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  users       │  │  products    │  │  orders      │  ...       │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  Partitions ensure:                                               │
│  - Order per entity                                               │
│  - Parallel consumption                                           │
│  - Fault tolerance                                                │
└───────────────────────────────────────────────────────────────────┘
                               │
                               │ Consume changes
                               ↓
┌───────────────────────────────────────────────────────────────────┐
│               Node.js Application (Consumer)                       │
│                                                                     │
│  ┌───────────────────────────────────────────────────┐           │
│  │  DebeziumCDCConsumer                              │           │
│  │  - Subscribes to Kafka topics                     │           │
│  │  - Receives CDC events                            │           │
│  │  - Formats for WebSocket                          │           │
│  └────────────────┬────────────────────────────────┘           │
│                   │                                              │
│  ┌────────────────▼────────────────────────────────┐           │
│  │  Socket.io Server                               │           │
│  │  - Broadcasts to clients                        │           │
│  │  - Clients filter by table/subscription         │           │
│  └─────────────────────────────────────────────────┘           │
└───────────────────────────────────────────────────────────────────┘
                               │
                               │ Real-time updates
                               ↓
┌───────────────────────────────────────────────────────────────────┐
│                  Browser Clients                                   │
│                                                                     │
│  Client A: Subscribed to    Client B: Subscribed to              │
│  [users, products]          [orders]                             │
│  ✅ Receives updates        ✅ Receives updates                  │
│  ❌ Ignores others          ❌ Ignores users/products            │
└───────────────────────────────────────────────────────────────────┘
```

## Change Data Capture (CDC) Event Format

When a user is created in MariaDB:

### 1. Debezium Captures from Binlog

```
MariaDB Binary Log:
INSERT INTO users (name, email, status)
VALUES ('Alice', 'alice@example.com', 'active')
```

### 2. Debezium Transforms

```json
{
  "schema": {
    "type": "record",
    "name": "users",
    "fields": [
      { "name": "id", "type": "int" },
      { "name": "name", "type": "string" },
      { "name": "email", "type": "string" },
      { "name": "status", "type": "string" }
    ]
  },
  "payload": {
    "before": null,
    "after": {
      "id": 1,
      "name": "Alice",
      "email": "alice@example.com",
      "status": "active"
    },
    "source": {
      "version": "2.0",
      "connector": "mysql",
      "name": "dbserver",
      "ts_ms": 1704067200000,
      "db": "live_data",
      "table": "users",
      "server_id": 1,
      "file": "mysql-bin.000001",
      "pos": 154
    },
    "op": "c",
    "ts_ms": 1704067200001
  }
}
```

### 3. Node.js Consumes & Broadcasts

```typescript
{
  source: "debezium-cdc",
  table: "users",
  operation: "CREATE",
  recordId: 1,
  after: { id: 1, name: "Alice", email: "...", status: "active" },
  before: null,
  timestamp: "2024-01-01T12:00:00Z"
}
```

### 4. Clients Receive & Filter

```typescript
// Debezium event arrives
// Client filters based on subscription
if (subscribedTables.includes('users')) {
  // Update UI ✅
}
```

## Comparison: All Approaches

| Feature | Wrapper | With Logs | Debezium CDC |
|---------|---------|-----------|-------------|
| **Captures Changes** | Wrapper only | Wrapper only | ALL forever |
| **Missed Events** | Possible | Possible | Never |
| **Code Changes** | Required | Required | NONE |
| **Works with Other Services** | No | No | YES |
| **1000+ Tables** | Need wrapper per service | Need wrapper per service | Automatic |
| **Replay Events** | No | Limited | YES (full history) |
| **Exactly-once Delivery** | No | No | YES (Kafka) |
| **Schema Evolution** | Manual | Manual | Automatic |
| **Scalability** | Per-service | Per-service | Cluster-wide |
| **Setup Complexity** | Simple | Medium | Medium |
| **Production Ready** | Medium | Medium | HIGH |
| **Used By** | Internal tools | Internal tools | Netflix, Uber, LinkedIn |

## Setup (Docker Compose)

### Step 1: Start Services

```bash
# Everything in one command!
docker-compose up -d

# Wait for services to be healthy (~60 seconds)
docker-compose ps
```

### Step 2: Register MySQL Connector

```bash
# Register Debezium to watch MariaDB
bash register-debezium-connector.sh

# Verify
curl http://localhost:8083/connectors
```

### Step 3: Check Kafka Topics

```bash
# See topics Debezium created (one per table)
docker exec live-data-kafka \
  kafka-topics --bootstrap-server localhost:9092 --list

# Output:
# users
# products
# orders
# activity_log
# dbhistory.live_data
```

### Step 4: View CDC Stream

```bash
# See live changes to 'users' table
docker exec live-data-kafka \
  kafka-console-consumer \
    --bootstrap-server localhost:9092 \
    --topic users \
    --from-beginning
```

## Running Node.js with CDC

### Option A: Docker Compose (Recommended)

```bash
# Add to docker-compose.yml:
node:
  build: .
  depends_on:
    kafka:
      condition: service_healthy
    mariadb:
      condition: service_healthy
  ports:
    - "3000:3000"
  environment:
    KAFKA_BROKER: kafka:29092
    DB_HOST: mariadb
    DB_USER: live_user
    DB_PASSWORD: live_password
    DB_NAME: live_data
  command: node server-debezium.js
```

### Option B: Local Development

```bash
# Install dependencies
npm install kafkajs mysql2

# Update .env
KAFKA_BROKER=localhost:9092
DB_HOST=localhost
DB_USER=live_user
DB_PASSWORD=live_password
DB_NAME=live_data

# Start server
node server-debezium.js
```

## How Debezium Works Under the Hood

### 1. Initial Snapshot
```
Debezium:
  SELECT * FROM users;
  CREATE Kafka topic 'users'
  Publish all current records
```

### 2. Continuous Capture
```
Service A makes change:
  INSERT INTO users VALUES (...);

MariaDB:
  Writes to table
  Appends to binlog (transaction log)

Debezium:
  Reads from binlog
  Detects INSERT operation
  Publishes to Kafka 'users' topic
  Updates committed offset
```

### 3. Fault Tolerance
```
If Node.js crashes:
  Consumer reconnects
  Reads from last committed offset
  No messages lost
  No duplicates (exactly-once)

If Kafka broker fails:
  Replicated across cluster
  Other brokers take over
  Guarantees still hold
```

## 100+ Services Example

```
Service 1 (Python)
  INSERT INTO users → MariaDB

Service 2 (Java)  
  UPDATE products → MariaDB

Service 100 (Go)
  DELETE orders → MariaDB

            ↓ All write to same DB

         MariaDB (binlog)

            ↓ Single source of truth

        Debezium captures ALL

            ↓ No coordination needed

    Publishes to Kafka (guaranteed)

            ↓ Node.js consumes

       Broadcasts to clients

            ↓ Clients filter

    Each sees what they subscribed to
```

## Monitoring

### Kafka UI (http://localhost:8080)

Visual monitoring:
- Topics and partitions
- Message throughput
- Consumer groups
- Lag tracking

### Health Endpoints

```bash
curl http://localhost:3000/health
# Returns CDC status

curl http://localhost:3000/api/cdc/status
# CDC consumer status

curl http://localhost:3000/api/cdc/subscriptions
# Current client subscriptions
```

### Connector Status

```bash
curl http://localhost:8083/connectors/mariadb-connector/status

# Returns:
# {
#   "name": "mariadb-connector",
#   "connector": { "state": "RUNNING", ... },
#   "tasks": [{ "state": "RUNNING", ... }]
# }
```

## Best Practices

### 1. Right Database for CDC

| DB | CDC Support | Recommendation |
|---|---|---|
| PostgreSQL | Excellent (logical decoding) | ✅ Best |
| MySQL 5.7+ | Good (binlog) | ✅ Good (what we use) |
| MariaDB | Good (MySQL-compatible) | ✅ Good |
| Oracle | Excellent | ✅ Good |
| SQLite | Polling only | ❌ Not recommended |

### 2. Kafka Configuration

```yaml
# Topic settings
num_partitions: 3        # Parallelism
replication_factor: 3    # High availability
retention_ms: 604800000  # 7 days (adjust as needed)
compression_type: snappy # Default compression
```

### 3. Debezium Settings

```json
{
  "snapshot.mode": "when_needed",    // Only on startup
  "poll.interval.ms": 1000,          // Check for changes every 1s
  "max.batch.size": 2048,            // Batch CDC events
  "include.schema.changes": true,    // Track DDL
  "decimal.handling.mode": "double"  // Numeric precision
}
```

## Troubleshooting

### Connector Not Starting

```bash
curl http://localhost:8083/connectors/mariadb-connector/status
# Check "tasks" section for error messages
```

### No Messages in Kafka

```bash
# Verify connector is running
docker logs live-data-debezium | grep -i error

# Check MariaDB has binlog enabled
docker exec live-data-mariadb \
  mysql -uroot -proot_password -e "SHOW BINARY LOGS;"
```

### Consumer Lag

```bash
docker exec live-data-kafka \
  kafka-consumer-groups \
    --bootstrap-server localhost:9092 \
    --group live-data-group \
    --describe

# Check "LAG" column - should be near 0
```

## Summary

✅ **Debezium CDC** is the production-grade solution for:
- Capturing ALL database changes
- Multi-service architectures
- 1000+ table support
- Service-agnostic implementation
- Exactly-once delivery
- Fault-tolerant systems
- Large-scale deployments

**Choose this for a real production system!** 🚀
