// // lib/db.ts
// import { Pool } from 'pg';

// export const pool = new Pool({
//   user: 'viacotur',
//   host: 'localhost', // o IP del contenedor, como 10.206.0.3
//   database: 'viacotur',
//   password: 'viacotur_pass',
//   port: 5432,
// });

// lib/db.ts
import { Pool } from 'pg';

export const pool = new Pool({
  user: "viacotur",                // o "admin"
  host: "34.174.97.159",           // no 'localhost' si está en otro host
  database: "viacotur",
  password: "viacotur_pass",       // o "P@ssw0rd"
  port: 5432,
});