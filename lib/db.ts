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
  user: "viacotur",               
  host: "34.174.97.159",         
  database: "viacotur",
  password: "viacotur_pass",       
  port: 5432,
});