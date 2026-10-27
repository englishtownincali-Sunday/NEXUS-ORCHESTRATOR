import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { Pool } from 'pg';

const server = Fastify({ logger: true });

// Configuración de la base de datos Neon (usando tu variable de entorno DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Servir archivos estáticos del frontend
server.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
});

// Ruta de prueba de conexión a Neon DB
server.get('/api/db-test', async (request, reply) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    return {
      status: 'success',
      message: 'Conexión exitosa a Neon PostgreSQL',
      timestamp: result.rows[0].now
    };
  } catch (err: any) {
    reply.code(500);
    return {
      status: 'error',
      message: 'Error al conectar con la base de datos',
      error: err.message
    };
  }
});

// Ruta de simulación u orquestación de IA
server.post('/api/orchestrate', async (request, reply) => {
  const { model, prompt } = request.body as any;
  return {
    status: 'success',
    orchestrator: 'Nexus Engine Enterprise',
    modelUsed: model,
    promptReceived: prompt,
    response: `Respuesta simulada generada exitosamente por ${model} bajo la orquestación de Nexus.`,
    timestamp: new Date().toISOString()
  };
});

// Iniciar servidor
const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor de Nexus Orchestrator iniciado con éxito.');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
