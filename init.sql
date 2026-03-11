-- Initialize live_data database

USE live_data;

-- Legacy demo table (kept for compatibility)
CREATE TABLE IF NOT EXISTS live_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  value DOUBLE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customers (users)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50) DEFAULT '000-000-0000',
  company VARCHAR(255) DEFAULT 'Default Co',
  tier VARCHAR(50) DEFAULT 'silver',
  status VARCHAR(50) DEFAULT 'active',
  city VARCHAR(100) DEFAULT 'N/A',
  country VARCHAR(100) DEFAULT 'N/A',
  credit_limit DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  supplier VARCHAR(255) DEFAULT 'Default Supplier',
  rating DECIMAL(3, 1) DEFAULT 4.0,
  launch_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_stock (stock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sales Orders
CREATE TABLE IF NOT EXISTS sales_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(50) NOT NULL,
  customer_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  sales_rep VARCHAR(255) DEFAULT 'Unassigned',
  channel VARCHAR(50) DEFAULT 'web',
  priority VARCHAR(50) DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_customer (customer_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders (legacy)
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(50) NOT NULL,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  total_amount DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Materialized views
CREATE TABLE IF NOT EXISTS sales_orders_view (
  id INT PRIMARY KEY,
  order_no VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  sales_rep VARCHAR(255) NOT NULL,
  channel VARCHAR(50) NOT NULL,
  priority VARCHAR(50) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_order_no (order_no),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers_view (
  id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  company VARCHAR(255) NOT NULL,
  tier VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  credit_limit DECIMAL(12, 2) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products_view (
  id INT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  supplier VARCHAR(255) NOT NULL,
  rating DECIMAL(3, 1) NOT NULL,
  launch_date DATE NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit/Activity log table (optional)
CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id INT,
  user_id INT,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_event (event_type),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data
INSERT INTO users (name, email, phone, company, tier, status, city, country, credit_limit) VALUES
  ('Alice Johnson', 'alice@example.com', '555-1010', 'Aster Labs', 'gold', 'active', 'Austin', 'USA', 25000),
  ('Bob Smith', 'bob@example.com', '555-2020', 'Nimbus Co', 'silver', 'active', 'Denver', 'USA', 12000),
  ('Charlie Davis', 'charlie@example.com', '555-3030', 'Orion Ltd', 'platinum', 'active', 'Seattle', 'USA', 50000);

INSERT INTO products (sku, name, category, price, stock, status, supplier, rating, launch_date) VALUES
  ('SKU-1001', 'Laptop Pro', 'electronics', 1499.99, 12, 'active', 'Nova Supply', 4.7, '2024-11-10'),
  ('SKU-1002', 'Precision Mouse', 'electronics', 49.99, 120, 'active', 'Nova Supply', 4.4, '2024-06-01'),
  ('SKU-1003', 'Ergo Chair', 'furniture', 349.99, 20, 'active', 'Urban Furnish', 4.2, '2023-09-15');

INSERT INTO sales_orders (order_no, customer_id, product_id, quantity, total_amount, status, sales_rep, channel, priority) VALUES
  ('SO-2001', 1, 1, 1, 1499.99, 'completed', 'Mia Chen', 'web', 'high'),
  ('SO-2002', 2, 2, 2, 99.98, 'pending', 'Liam Patel', 'partner', 'normal'),
  ('SO-2003', 3, 3, 1, 349.99, 'approved', 'Noah Reyes', 'phone', 'high');

INSERT INTO sales_orders_view (id, order_no, customer_name, product_name, quantity, total_amount, status, sales_rep, channel, priority, updated_at)
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
JOIN products p ON p.id = so.product_id;

INSERT INTO customers_view (id, name, email, phone, company, tier, status, city, country, credit_limit, updated_at)
SELECT id, name, email, phone, company, tier, status, city, country, credit_limit, updated_at FROM users;

INSERT INTO products_view (id, sku, name, category, price, stock, status, supplier, rating, launch_date, updated_at)
SELECT id, sku, name, category, price, stock, status, supplier, rating, launch_date, updated_at FROM products;

INSERT INTO live_data (name, value, status) VALUES
  ('Legacy Node', 42.5, 'active'),
  ('Legacy Cache', 64.1, 'idle');

-- Grant permissions to live_user
GRANT ALL PRIVILEGES ON live_data.* TO 'live_user'@'%';
GRANT SELECT, RELOAD, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT, LOCK TABLES ON *.* TO 'live_user'@'%';
FLUSH PRIVILEGES;
