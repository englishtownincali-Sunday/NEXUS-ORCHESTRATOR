import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { Pool } from 'pg';
import crypto from 'crypto';

const server = Fastify({ logger: true });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

server.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
});

// Inicializador automático de tablas en PostgreSQL (Neon)
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS nexus;
      
      CREATE TABLE IF NOT EXISTS nexus.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        password_hash text,
        status text DEFAULT 'active',
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS nexus.organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text UNIQUE NOT NULL,
        name text NOT NULL,
        plan_key text DEFAULT 'selfhost'
      );

      CREATE TABLE IF NOT EXISTS nexus.memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES nexus.users(id),
        org_id uuid REFERENCES nexus.organizations(id),
        status text DEFAULT 'active',
        role text DEFAULT 'owner'
      );

      CREATE TABLE IF NOT EXISTS nexus.kv_docs (
        path text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz DEFAULT now()
      );
    `);
    console.log('✅ Esquemas y tablas nexus.users verificados/creados correctamente en Neon.');
  } catch (err) {
    console.error('❌ Error al inicializar tablas en la base de datos:', err);
  } finally {
    client.release();
  }
}

// Utilidades de seguridad (hash scrypt)
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

// Endpoint de Registro (Asigna rol Propietario al primer usuario)
server.post('/api/auth/register', async (request, reply) => {
  const { email, password } = request.body as any;
  if (!email || !password) {
    reply.code(400);
    return { error: 'Faltan datos requeridos (email y contraseña)' };
  }

  try {
    const client = await pool.connect();
    try {
      const userCountRes = await client.query('SELECT COUNT(*) FROM nexus.users');
      const isFirstUser = parseInt(userCountRes.rows[0].count) === 0;

      const password_hash = await hashPassword(password);

      const userRes = await client.query(
        `INSERT INTO nexus.users (email, password_hash, status) VALUES ($1, $2, 'active') RETURNING id, email`,
        [email, password_hash]
      );
      const newUser = userRes.rows[0];

      let orgRes = await client.query('SELECT id FROM nexus.organizations WHERE slug = $1', ['nexus']);
      let orgId;
      if (orgRes.rows.length === 0) {
        const newOrg = await client.query(
          `INSERT INTO nexus.organizations (slug, name, plan_key) VALUES ('nexus', 'Nexus', 'selfhost') RETURNING id`
        );
        orgId = newOrg.rows[0].id;
      } else {
        orgId = orgRes.rows[0].id;
      }

      const roleName = isFirstUser ? 'owner' : 'member';
      await client.query(
        `INSERT INTO nexus.memberships (user_id, org_id, status, role) VALUES ($1, $2, 'active', $3)`,
        [newUser.id, orgId, roleName]
      );

      return {
        status: 'success',
        message: isFirstUser ? '¡Cuenta de Propietario creada con éxito!' : '¡Cuenta creada con éxito!',
        userId: newUser.id
      };
    } finally {
      client.release();
    }
  } catch (err: any) {
    reply.code(500);
    return { error: 'Error al registrar el usuario: ' + err.message };
  }
});

// Rutas de Persistencia KV y Diagnóstico
server.get('/api/kv/:path', async (request, reply) => {
  const { path } = request.params as { path: string };
  try {
    const result = await pool.query('SELECT data FROM nexus.kv_docs WHERE path = $1', [path]);
    if (result.rows.length === 0) return { data: null };
    return result.rows[0].data;
  } catch (err: any) {
    reply.code(500);
    return { error: err.message };
  }
});

server.post('/api/kv/:path', async (request, reply) => {
  const { path } = request.params as { path: string };
  const data = request.body;
  try {
    await pool.query(
      `INSERT INTO nexus.kv_docs (path, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [path, data]
    );
    return { status: 'success', path };
  } catch (err: any) {
    reply.code(500);
    return { error: err.message };
  }
});

server.get('/api/db-test', async (request, reply) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    return { status: 'success', timestamp: result.rows[0].now };
  } catch (err: any) {
    reply.code(500);
    return { status: 'error', error: err.message };
  }
});

// Arranque de servidor con autoinstalación de BD
const start = async () => {
  try {
    await initDB();
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 Servidor Nexus Orchestrator escuchando en puerto 3000');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
