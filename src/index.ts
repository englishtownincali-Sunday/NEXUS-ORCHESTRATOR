import Fastify from 'fastify';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';

const { Pool } = pkg;

// Configuración de rutas para ES Modules en Node.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  root: path.join(__dirname, '../public'),
  prefix: '/', // Sirve el contenido en la ruta raíz
});

// 2. Endpoint de prueba para verificar la conexión a la base de datos de Neon
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

// 3. Endpoint para la Consola de IA / Orquestación (Módulo 2)
fastify.post('/api/orchestrate', async (request, reply) => {
  const body = request.body as { model?: string; prompt?: string };
  const model = body?.model || 'gemini-1.5-pro';
  const prompt = body?.prompt || 'Sin prompt';

  try {
    // Aquí puedes integrar llamadas futuras a APIs de IA o guardar la tarea en Neon
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

start();
