import Fastify from 'fastify';
import pkg from 'pg';
import path from 'path';
import fastifyStatic from '@fastify/static';

const { Pool } = pkg;

// Inicializar Fastify
const fastify = Fastify({ logger: true });

// Configurar el pool de conexión para Neon PostgreSQL con SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// 1. Registrar @fastify/static para servir el Dashboard HTML desde la carpeta 'public'
fastify.register(fastifyStatic, {
  root: path.join(process.cwd(), 'public'),
  prefix: '/', 
});

// 2. Ruta raíz principal: Renderiza y sirve tu Dashboard HTML
fastify.get('/', async (request, reply) => {
  return reply.sendFile('index.html');
});

// 3. Endpoint de prueba para verificar la conexión a la base de datos de Neon
fastify.get('/api/db-test', async (request, reply) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();
    
    return {
      success: true,
      message: '¡Conexión exitosa con Neon PostgreSQL!',
      databaseTime: result.rows[0].current_time,
    };
  } catch (error: any) {
    reply.code(500);
    return {
      success: false,
      error: 'Error al conectar con la base de datos',
      details: error.message,
    };
  }
});

// 4. Endpoint para la Consola de IA / Orquestación
fastify.post('/api/orchestrate', async (request, reply) => {
  const body = request.body as { model?: string; prompt?: string };
  const model = body?.model || 'gemini-1.5-pro';
  const prompt = body?.prompt || 'Sin prompt';

  try {
    return {
      status: 'success',
      orchestrationId: `nexus-${Date.now()}`,
      modelUsed: model,
      promptReceived: prompt,
      message: 'Orquestación procesada correctamente en el backend',
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    reply.code(500);
    return {
      status: 'error',
      message: error.message
    };
  }
});

// Iniciar el servidor escuchando en el puerto 3000 para Render (0.0.0.0)
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor de Nexus Orchestrator iniciado con éxito.');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
