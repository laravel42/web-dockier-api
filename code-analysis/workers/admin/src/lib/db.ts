import { Pool } from 'pg';

// Initialize a shared connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://mock:mock@localhost:5432/mock",
  max: 10,
  idleTimeoutMillis: 30000,
});

export default pool;
