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

// Utilidad para hash de contraseñas usando scrypt (nativo de Node.js)
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey));
    });
  });
}

// 1. Endpoint de Registro (La primera cuenta se convierte en propietaria)
server.post('/api/auth/register', async (request, reply) => {
  const { email, password } = request.body as any;
  if (!email || !password) {
    reply.code(400);
    return { error: 'Faltan datos requeridos (email y contraseña)' };
  }

  try {
    const client = await pool.connect();
    try {
      // Verificar si ya existen usuarios para definir rol
      const userCountRes = await client.query('SELECT COUNT(*) FROM nexus.users');
      const isFirstUser = parseInt(userCountRes.rows[0].count) === 0;

      const password_hash = await hashPassword(password);

      // Insertar usuario
      const userRes = await client.query(
        `INSERT INTO nexus.users (email, password_hash, status) VALUES ($1, $2, 'active') RETURNING id, email`,
        [email, password_hash]
      );
      const newUser = userRes.rows[0];

      // Obtener o crear organización por defecto 'nexus'
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

      // Asignar membresía (Propietario si es el primero, miembro estándar si no)
      const roleName = isFirstUser ? 'owner' : 'member';
      await client.query(
        `INSERT INTO nexus.memberships (user_id, org_id, status, role) VALUES ($1, $2, 'active', $3)`,
        [newUser.id, orgId, roleName]
      );

      return {
        status: 'success',
        message: isFirstUser ? 'Cuenta de propietario creada con éxito.' : 'Cuenta creada con éxito.',
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

// 2. Endpoints de Almacenamiento KV (kv_docs)
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

// 3. Prueba de Base de Datos
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

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor Nexus Orchestrator con autenticación activo.');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
