/**
 * Live Data Server (service events only, no Debezium, no Redis)
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

app.use(cors());
app.use(bodyParser.json());

const MODULES = {
  sales_orders: { viewTable: 'sales_orders_view' },
  customers: { viewTable: 'customers_view' },
  products: { viewTable: 'products_view' }
};


let pool;


function emitRealtime(eventName, payload) {
  io.emit(eventName, payload);
}

async function initializePool() {
  pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'live_user',
    password: process.env.DB_PASSWORD || 'live_password',
    database: process.env.DB_NAME || 'live_data',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelayMs: 0
  });

  console.log('? Database pool initialized');
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit('modules:available', { modules: Object.keys(MODULES) });

  socket.on('disconnect', () => {
    console.log(`? Client disconnected: ${socket.id}`);
  });
});

app.get('/api/modules/:module', async (req, res) => {
  const moduleKey = req.params.module;
  if (!MODULES[moduleKey]) return res.status(404).json({ error: 'Module not found' });

  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT * FROM ${MODULES[moduleKey].viewTable} ORDER BY updated_at DESC, id DESC`
    );
    conn.release();
    res.json(rows);
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/modules/:module', async (req, res) => {
  const moduleKey = req.params.module;
  if (!MODULES[moduleKey]) return res.status(404).json({ error: 'Module not found' });

  try {
    const conn = await pool.getConnection();
    let record = null;

    if (moduleKey === 'sales_orders') {
      record = await createSalesOrder(req.body, conn);
      emitRealtime('module:data_inserted', { module: moduleKey, record });
    } else if (moduleKey === 'customers') {
      record = await createCustomer(req.body, conn);
      emitRealtime('module:data_inserted', { module: moduleKey, record });
    } else if (moduleKey === 'products') {
      record = await createProduct(req.body, conn);
      emitRealtime('module:data_inserted', { module: moduleKey, record });
    }

    conn.release();
    res.json(record || { success: true });
  } catch (error) {
    console.error('Insert error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/modules/:module/:id', async (req, res) => {
  const moduleKey = req.params.module;
  const id = Number(req.params.id);
  if (!MODULES[moduleKey]) return res.status(404).json({ error: 'Module not found' });

  try {
    const conn = await pool.getConnection();
    let record = null;

    if (moduleKey === 'sales_orders') {
      record = await updateSalesOrder(id, req.body, conn);
      emitRealtime('module:data_updated', { module: moduleKey, record });
    } else if (moduleKey === 'customers') {
      record = await updateCustomer(id, req.body, conn);
      emitRealtime('module:data_updated', { module: moduleKey, record });
    } else if (moduleKey === 'products') {
      record = await updateProduct(id, req.body, conn);
      emitRealtime('module:data_updated', { module: moduleKey, record });
    }

    conn.release();
    res.json({ success: true });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'live-data-node',
    mode: 'service-events-only',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initializePool();

    server.listen(PORT, () => {
      console.log(`Live Data Server (modules) running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('? Failed to start server:', error);
    process.exit(1);
  }
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function findOrCreateCustomerByName(name, conn) {
  const [rows] = await conn.execute('SELECT id FROM users WHERE name = ? LIMIT 1', [name]);
  if (rows.length) return rows[0].id;

  const email = `${String(name).toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@example.com`;
  const result = await conn.execute(
    'INSERT INTO users (name, email, phone, company, tier, status, city, country, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name, email, '000-000-0000', 'Default Co', 'silver', 'active', 'N/A', 'N/A', 0]
  );
  return result[0].insertId;
}

async function findOrCreateProductByName(name, conn) {
  const [rows] = await conn.execute('SELECT id FROM products WHERE name = ? LIMIT 1', [name]);
  if (rows.length) return rows[0].id;

  const result = await conn.execute(
    'INSERT INTO products (sku, name, category, price, stock, status, supplier, rating, launch_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [`SKU-${Date.now()}`, name, 'general', 0, 0, 'active', 'Default Supplier', 4, new Date().toISOString().slice(0, 10)]
  );
  return result[0].insertId;
}

async function createSalesOrder(payload, conn) {
  const customerId = await findOrCreateCustomerByName(payload.customer_name, conn);
  const productId = await findOrCreateProductByName(payload.product_name, conn);

  const result = await conn.execute(
    'INSERT INTO sales_orders (order_no, customer_id, product_id, quantity, total_amount, status, sales_rep, channel, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      payload.order_no,
      customerId,
      productId,
      normalizeNumber(payload.quantity, 1),
      normalizeNumber(payload.total_amount, 0),
      payload.status || 'pending',
      payload.sales_rep || 'Unassigned',
      payload.channel || 'web',
      payload.priority || 'normal'
    ]
  );

  await refreshSalesOrderView(result[0].insertId, conn);
  return await getViewRowById('sales_orders', result[0].insertId, conn);
}

async function updateSalesOrder(id, payload, conn) {
  const [rows] = await conn.execute('SELECT * FROM sales_orders WHERE id = ?', [id]);
  if (!rows.length) throw new Error('Sales order not found');

  const order = rows[0];

  if (payload.customer_name) {
    await conn.execute('UPDATE users SET name = ? WHERE id = ?', [payload.customer_name, order.customer_id]);
  }
  if (payload.product_name) {
    await conn.execute('UPDATE products SET name = ? WHERE id = ?', [payload.product_name, order.product_id]);
  }

  await conn.execute(
    'UPDATE sales_orders SET order_no = ?, quantity = ?, total_amount = ?, status = ?, sales_rep = ?, channel = ?, priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [
      payload.order_no || order.order_no,
      payload.quantity ?? order.quantity,
      payload.total_amount ?? order.total_amount,
      payload.status || order.status,
      payload.sales_rep || order.sales_rep,
      payload.channel || order.channel,
      payload.priority || order.priority,
      id
    ]
  );

  await refreshSalesOrderView(id, conn);
  return await getViewRowById('sales_orders', id, conn);
}

async function createCustomer(payload, conn) {
  const result = await conn.execute(
    'INSERT INTO users (name, email, phone, company, tier, status, city, country, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      payload.name,
      payload.email,
      payload.phone,
      payload.company,
      payload.tier,
      payload.status || 'active',
      payload.city,
      payload.country,
      normalizeNumber(payload.credit_limit, 0)
    ]
  );

  await refreshCustomerView(result[0].insertId, conn);
  await emitDependentModules('customers', result[0].insertId, conn);
  return await getViewRowById('customers', result[0].insertId, conn);
}

async function updateCustomer(id, payload, conn) {
  await conn.execute(
    'UPDATE users SET name = ?, email = ?, phone = ?, company = ?, tier = ?, status = ?, city = ?, country = ?, credit_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [
      payload.name,
      payload.email,
      payload.phone,
      payload.company,
      payload.tier,
      payload.status || 'active',
      payload.city,
      payload.country,
      normalizeNumber(payload.credit_limit, 0),
      id
    ]
  );

  await refreshCustomerView(id, conn);
  await emitDependentModules('customers', id, conn);
  return await getViewRowById('customers', id, conn);
}

async function createProduct(payload, conn) {
  const result = await conn.execute(
    'INSERT INTO products (sku, name, category, price, stock, status, supplier, rating, launch_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      payload.sku,
      payload.name,
      payload.category,
      normalizeNumber(payload.price, 0),
      normalizeNumber(payload.stock, 0),
      payload.status || 'active',
      payload.supplier,
      normalizeNumber(payload.rating, 0),
      payload.launch_date
    ]
  );

  await refreshProductView(result[0].insertId, conn);
  await emitDependentModules('products', result[0].insertId, conn);
  return await getViewRowById('products', result[0].insertId, conn);
}

async function updateProduct(id, payload, conn) {
  await conn.execute(
    'UPDATE products SET sku = ?, name = ?, category = ?, price = ?, stock = ?, status = ?, supplier = ?, rating = ?, launch_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [
      payload.sku,
      payload.name,
      payload.category,
      normalizeNumber(payload.price, 0),
      normalizeNumber(payload.stock, 0),
      payload.status || 'active',
      payload.supplier,
      normalizeNumber(payload.rating, 0),
      payload.launch_date,
      id
    ]
  );

  await refreshProductView(id, conn);
  await emitDependentModules('products', id, conn);
  return await getViewRowById('products', id, conn);
}

async function getViewRowById(moduleKey, id, conn) {
  const [rows] = await conn.execute(
    `SELECT * FROM ${MODULES[moduleKey].viewTable} WHERE id = ?`,
    [id]
  );
  return rows.length ? rows[0] : null;
}

async function refreshSalesOrderView(orderId, conn) {
  await conn.execute(
    `INSERT INTO sales_orders_view
      (id, order_no, customer_name, product_name, quantity, total_amount, status, sales_rep, channel, priority, updated_at)
     SELECT
      so.id,
      so.order_no,
      u.name,
      p.name,
      so.quantity,
      so.total_amount,
      so.status,
      so.sales_rep,
      so.channel,
      so.priority,
      so.updated_at
     FROM sales_orders so
     JOIN users u ON u.id = so.customer_id
     JOIN products p ON p.id = so.product_id
     WHERE so.id = ?
     ON DUPLICATE KEY UPDATE
      order_no = VALUES(order_no),
      customer_name = VALUES(customer_name),
      product_name = VALUES(product_name),
      quantity = VALUES(quantity),
      total_amount = VALUES(total_amount),
      status = VALUES(status),
      sales_rep = VALUES(sales_rep),
      channel = VALUES(channel),
      priority = VALUES(priority),
      updated_at = VALUES(updated_at)`,
    [orderId]
  );
}

async function refreshCustomerView(customerId, conn) {
  await conn.execute(
    `INSERT INTO customers_view
      (id, name, email, phone, company, tier, status, city, country, credit_limit, updated_at)
     SELECT
      id, name, email, phone, company, tier, status, city, country, credit_limit, updated_at
     FROM users
     WHERE id = ?
     ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      email = VALUES(email),
      phone = VALUES(phone),
      company = VALUES(company),
      tier = VALUES(tier),
      status = VALUES(status),
      city = VALUES(city),
      country = VALUES(country),
      credit_limit = VALUES(credit_limit),
      updated_at = VALUES(updated_at)`,
    [customerId]
  );
}

async function refreshProductView(productId, conn) {
  await conn.execute(
    `INSERT INTO products_view
      (id, sku, name, category, price, stock, status, supplier, rating, launch_date, updated_at)
     SELECT
      id, sku, name, category, price, stock, status, supplier, rating, launch_date, updated_at
     FROM products
     WHERE id = ?
     ON DUPLICATE KEY UPDATE
      sku = VALUES(sku),
      name = VALUES(name),
      category = VALUES(category),
      price = VALUES(price),
      stock = VALUES(stock),
      status = VALUES(status),
      supplier = VALUES(supplier),
      rating = VALUES(rating),
      launch_date = VALUES(launch_date),
      updated_at = VALUES(updated_at)`,
    [productId]
  );
}

async function refreshSalesOrdersForCustomer(customerId, conn) {
  await conn.execute(
    `UPDATE sales_orders_view v
     JOIN sales_orders so ON so.id = v.id
     JOIN users u ON u.id = so.customer_id
     SET v.customer_name = u.name, v.updated_at = so.updated_at
     WHERE so.customer_id = ?`,
    [customerId]
  );
}

async function getSalesOrderIdsForCustomer(customerId, conn) {
  const [rows] = await conn.execute(
    'SELECT id FROM sales_orders WHERE customer_id = ?',
    [customerId]
  );
  return rows.map((row) => row.id);
}

async function refreshSalesOrdersForProduct(productId, conn) {
  await conn.execute(
    `UPDATE sales_orders_view v
     JOIN sales_orders so ON so.id = v.id
     JOIN products p ON p.id = so.product_id
     SET v.product_name = p.name, v.updated_at = so.updated_at
     WHERE so.product_id = ?`,
    [productId]
  );
}

async function getSalesOrderIdsForProduct(productId, conn) {
  const [rows] = await conn.execute(
    'SELECT id FROM sales_orders WHERE product_id = ?',
    [productId]
  );
  return rows.map((row) => row.id);
}

const DEPENDENT_MODULES = {
  customers: [
    {
      moduleKey: 'sales_orders',
      refresh: refreshSalesOrdersForCustomer,
      getIds: getSalesOrderIdsForCustomer
    }
  ],
  products: [
    {
      moduleKey: 'sales_orders',
      refresh: refreshSalesOrdersForProduct,
      getIds: getSalesOrderIdsForProduct
    }
  ]
};

async function emitDependentModules(sourceModule, sourceId, conn) {
  const dependencies = DEPENDENT_MODULES[sourceModule] || [];
  for (const dependency of dependencies) {
    // Refresh dependent read-model rows first, then emit each affected row.
    await dependency.refresh(sourceId, conn);
    const ids = await dependency.getIds(sourceId, conn);
    for (const id of ids) {
      const row = await getViewRowById(dependency.moduleKey, id, conn);
      if (row) {
        emitRealtime(
          'module:data_updated',
          { module: dependency.moduleKey, record: row }
        );
      }
    }
  }
}

process.on('SIGINT', async () => {
  console.log('\n??  Shutting down...');

  try {
    if (pool) await pool.end();
    server.close();
    console.log('? Server closed gracefully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

start();


