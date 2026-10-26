import Fastify from 'fastify';
import pkg from 'pg';

const { Pool } = pkg;

// Inicializar Fastify con logs habilitados
const fastify = Fastify({ logger: true });

// Configurar el pool de conexión para Neon PostgreSQL con SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Necesario para conexiones seguras en Neon
  },
});

// 1. Ruta raíz (Resuelve el 404 y da la bienvenida al servicio)
fastify.get('/', async (request, reply) => {
  return {
    status: 'online',
    service: 'Nexus Orchestrator API',
    message: 'Backend operando correctamente en Render con Neon DB',
  };
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
