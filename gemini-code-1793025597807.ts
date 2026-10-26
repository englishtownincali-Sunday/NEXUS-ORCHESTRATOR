import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({ logger: true });
fastify.register(cors, { origin: true });

// Conexión a la base de datos de Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Ruta de comprobación de estado (Health Check)
fastify.get('/health', async (request, reply) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    return { status: 'healthy', database: 'connected', time: result.rows[0].now };
  } catch (err: any) {
    reply.code(500);
    return { status: 'unhealthy', error: err.message };
  }
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Nexus Orchestrator running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();