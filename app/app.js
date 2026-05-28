const express = require('express');
const { Pool } = require('pg');

const app = express();

// Health check state
let dbHealthy = false;

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
});

// Database connection events
pool.on('connect', () => {
  console.log('[DB] Connected to PostgreSQL');
  dbHealthy = true;
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error:', err.message);
  dbHealthy = false;
});

// Initialize database schema
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('[DB] Schema initialized');
  } catch (err) {
    console.error('[DB] Schema initialization failed:', err.message);
  }
}

// Middleware
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`
    );
  });

  next();
});

// Simple Frontend Dashboard
app.get('/', async (req, res) => {
  let users = [];

  try {
    const result = await pool.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );

    users = result.rows;
  } catch (err) {
    console.error(err.message);
  }

  const userRows = users.length
    ? users
        .map(
          (user) => `
        <tr>
          <td>${user.id}</td>
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td>${new Date(user.created_at).toLocaleString()}</td>
        </tr>
      `
        )
        .join('')
    : `
      <tr>
        <td colspan="4">No users found</td>
      </tr>
    `;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>DevOps Challenge App</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f4f4f4;
          padding: 40px;
        }

        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        h1 {
          color: #333;
        }

        .status {
          padding: 10px;
          background: #d4edda;
          color: #155724;
          border-radius: 5px;
          margin-bottom: 20px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }

        table, th, td {
          border: 1px solid #ccc;
        }

        th, td {
          padding: 12px;
          text-align: left;
        }

        th {
          background: #007bff;
          color: white;
        }

        form {
          margin-top: 20px;
        }

        input {
          padding: 10px;
          margin-right: 10px;
          width: 200px;
        }

        button {
          padding: 10px 20px;
          background: #007bff;
          color: white;
          border: none;
          cursor: pointer;
        }

        button:hover {
          background: #0056b3;
        }
      </style>
    </head>

    <body>
      <div class="container">
        <h1>DevOps Challenge Dashboard</h1>

        <div class="status">
          Application Running Successfully
        </div>

        <p><strong>Database Status:</strong> ${
          dbHealthy ? 'Connected' : 'Disconnected'
        }</p>

        <p><strong>Environment:</strong> Docker / Kubernetes Ready</p>

        <h2>Create User</h2>

        <form id="userForm">
          <input type="text" id="name" placeholder="Name" required />
          <input type="email" id="email" placeholder="Email" required />
          <button type="submit">Create User</button>
        </form>

        <h2>Users</h2>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            ${userRows}
          </tbody>
        </table>
      </div>

      <script>
        const form = document.getElementById('userForm');

        form.addEventListener('submit', async (e) => {
          e.preventDefault();

          const name = document.getElementById('name').value;
          const email = document.getElementById('email').value;

          const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email })
          });

          if (response.ok) {
            alert('User created successfully');
            window.location.reload();
          } else {
            alert('Failed to create user');
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Liveness probe
app.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe
app.get('/health/ready', (req, res) => {
  if (!dbHealthy) {
    return res.status(503).json({
      status: 'not ready',
      reason: 'database unavailable',
    });
  }

  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

// Detailed health endpoint
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');

    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      dbTime: result.rows[0].now,
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: err.message,
    });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[API] Error fetching users:', err.message);

    res.status(500).json({
      error: err.message,
    });
  }
});

// Create user
app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: 'name and email required',
    });
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[API] Error creating user:', err.message);

    res.status(500).json({
      error: err.message,
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[APP] SIGTERM received, shutting down gracefully');

  await pool.end();

  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;

(async () => {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`[APP] Server running on port ${PORT}`);
  });
})();

module.exports = app;
