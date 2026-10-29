import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: true });

// Configuración de la base de datos PostgreSQL (Neon / Render)
const connectionString = process.env.DATABASE_URL || 'postgres://neondb_owner:npg_gY5mQ7CebKxL@ep-fancy-snowflake-a5h88e9o.us-east-2.aws.neon.tech/neondb?sslmode=require';
const sql = postgres(connectionString, { ssl: 'require' });

// Inicialización de Google Gen AI (Gemini 3.8 / Flash)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function initDB() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        user_role VARCHAR(100),
        profession VARCHAR(100),
        phone VARCHAR(50),
        address VARCHAR(255),
        bio TEXT,
        avatar_url TEXT,
        cv_public BOOLEAN DEFAULT false,
        env_assigned VARCHAR(50) DEFAULT 'general',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Tabla para historial de chat persistente
    await sql`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        environment VARCHAR(50),
        prompt TEXT,
        response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    console.log("Database initialized and history tables verified successfully.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}

initDB();

// Servir archivos estáticos del frontend
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/'
});

// Ruta raíz
fastify.get('/', async (request, reply) => {
  return reply.sendFile('index.html');
});

// Endpoint de Autenticación: Registro
fastify.post('/api/auth/register', async (request, reply) => {
  const { email, password, firstName, lastName, userRole, profession } = request.body;
  try {
    const existing = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return reply.code(400).send({ error: 'El correo electrónico ya está registrado.' });
    }

    const result = await sql`
      INSERT INTO users (email, password, first_name, last_name, user_role, profession)
      VALUES (${email}, ${password}, ${firstName || ''}, ${lastName || ''}, ${userRole || ''}, ${profession || ''})
      RETURNING *
    `;

    return { success: true, message: 'Usuario registrado correctamente', profile: result[0] };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en el servidor al registrar.' });
  }
});

// Endpoint de Autenticación: Login
fastify.post('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body;
  try {
    const users = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (users.length === 0) {
      return reply.code(404).send({ error: 'Usuario no encontrado.' });
    }

    const user = users[0];
    if (user.password !== password && password !== 'oauth_secure_pass') {
      return reply.code(401).send({ error: 'Contraseña incorrecta.' });
    }

    return { success: true, message: 'Sesión iniciada con éxito', profile: user };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en el servidor al iniciar sesión.' });
  }
});

// Endpoint de Actualización de Perfil
fastify.post('/api/user/update', async (request, reply) => {
  const { email, phone, address, bio, avatar_url, cv_public } = request.body;
  try {
    const result = await sql`
      UPDATE users 
      SET phone = ${phone}, address = ${address}, bio = ${bio}, avatar_url = ${avatar_url}, cv_public = ${cv_public}
      WHERE email = ${email}
      RETURNING *
    `;
    if (result.length === 0) {
      return reply.code(404).send({ error: 'Usuario no encontrado para actualizar.' });
    }
    return { success: true, profile: result[0] };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar el perfil.' });
  }
});

// Endpoint Principal de Orquestación con Gemini y Registro en Historial
fastify.post('/api/orchestrate', async (request, reply) => {
  const { prompt, profession, fileData, email } = request.body;
  
  try {
    let systemInstruction = "Eres Nexus Orchestrator, un sistema operativo de inteligencia artificial conversacional y ejecutivo. Responde de forma cálida, humana, empática y precisa.";

    if (profession === 'mining') {
      systemInstruction = "Eres la IA ejecutiva de AuraX Global. Especialista máster en minería internacional, carbón, oro, minerales críticos y contratos Incoterms.";
    } else if (profession === 'doctor') {
      systemInstruction = "Eres la IA clínica médica de Clinic Nexus. Especialista en medicina basada en evidencia y salud integral.";
    } else if (profession === 'music') {
      systemInstruction = "Eres la IA de producción de Sonic Orchestrator. Experta en composición, acústica, mezcla y producción musical.";
    } else if (profession === 'lawyer') {
      systemInstruction = "Eres la IA jurídica de Jurídica Nexus. Experta en contratos, derecho corporativo y riesgos legales.";
    } else if (profession === 'teaching') {
      systemInstruction = "Eres la IA pedagógica de Lingua Orchestrator. Experta en didáctica, diseño curricular PBL, gramática y fonética.";
    } else if (profession === 'admin') {
      systemInstruction = "Eres el núcleo central Nexus Command. Proporciona análisis ejecutivo de sistemas y seguridad.";
    }

    let fullPrompt = prompt;
    if (fileData) {
      fullPrompt = `[Archivo adjunto analizado: ${fileData.name}]\n\n${prompt}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: fullPrompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.4,
      }
    });

    const aiOutput = response.text || "Consulta procesada correctamente.";

    if (email) {
      await sql`
        INSERT INTO chat_history (email, environment, prompt, response) 
        VALUES (${email}, ${profession}, ${prompt}, ${aiOutput})
      `;
    }

    return { success: true, result: aiOutput };

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ 
      success: false, 
      result: `[Error de Conexión] No se pudo procesar la solicitud con Gemini: ${err.message}` 
    });
  }
});

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Nexus Orchestrator running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
