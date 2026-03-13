const assert = require('node:assert/strict');
const DebeziumCDCConsumer = require('../debezium-cdc-consumer');

function createConsumer(options = {}) {
  const emitted = [];
  const io = {
    emit(event, payload) {
      emitted.push({ event, payload });
    }
  };

  const consumer = new DebeziumCDCConsumer(
    {
      clientId: 'test-client',
      brokers: ['localhost:9092']
    },
    io,
    options
  );

  return { consumer, emitted };
}

function pickEvent(emitted, eventName) {
  return emitted.find((item) => item.event === eventName);
}

const tests = [
  {
    name: 'getChangedFields returns only changed keys',
    run() {
      const { consumer } = createConsumer();
      const changed = consumer.getChangedFields(
        { id: 7, status: 'pending', amount: 10 },
        { id: 7, status: 'approved', amount: 10 }
      );

      assert.deepEqual(changed, {
        status: {
          before: 'pending',
          after: 'approved'
        }
      });
    }
  },
  {
    name: 'broadcast emits raw CDC and module update for mapped table updates',
    run() {
      const { consumer, emitted } = createConsumer({
        moduleByTable: {
          sales_orders_view: 'sales_orders'
        }
      });

      consumer._broadcastToClients({
        table: 'sales_orders_view',
        operation: 'u',
        operationName: 'UPDATE',
        recordId: 101,
        before: {
          id: 101,
          status: 'pending'
        },
        after: {
          id: 101,
          status: 'approved'
        },
        timestamp: Date.now()
      });

      const rawGlobal = pickEvent(emitted, 'cdc:change');
      const rawTable = pickEvent(emitted, 'cdc:sales_orders_view');
      const moduleUpdated = pickEvent(emitted, 'module:data_updated');

      assert.ok(rawGlobal);
      assert.ok(rawTable);
      assert.ok(moduleUpdated);
      assert.equal(moduleUpdated.payload.module, 'sales_orders');
      assert.deepEqual(moduleUpdated.payload.record, {
        id: 101,
        status: {
          before: 'pending',
          after: 'approved'
        }
      });
    }
  },
  {
    name: 'broadcast does not emit module event for unmapped tables',
    run() {
      const { consumer, emitted } = createConsumer({
        moduleByTable: {}
      });

      consumer._broadcastToClients({
        table: 'customers_view',
        operation: 'u',
        operationName: 'UPDATE',
        recordId: 55,
        before: {
          id: 55,
          name: 'Acme'
        },
        after: {
          id: 55,
          name: 'Acme Inc'
        },
        timestamp: Date.now()
      });

      const moduleUpdated = pickEvent(emitted, 'module:data_updated');
      assert.equal(moduleUpdated, undefined);
      assert.ok(pickEvent(emitted, 'cdc:change'));
    }
  },
  {
    name: 'broadcast skips emit when there are no actual field changes',
    run() {
      const { consumer, emitted } = createConsumer({
        moduleByTable: {
          products_view: 'products'
        }
      });

      consumer._broadcastToClients({
        table: 'products_view',
        operation: 'u',
        operationName: 'UPDATE',
        recordId: 9,
        before: {
          id: 9,
          name: 'Widget'
        },
        after: {
          id: 9,
          name: 'Widget'
        },
        timestamp: Date.now()
      });

      assert.equal(emitted.length, 0);
    }
  }
];

let passed = 0;
let failed = 0;

for (const testCase of tests) {
  try {
    testCase.run();
    passed += 1;
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
  }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
