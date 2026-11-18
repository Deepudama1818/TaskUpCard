import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('[DB] Schema migration completed successfully.');
}

if (process.argv[1] === __filename) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[DB] Migration failed:', err);
      process.exit(1);
    });
}
