import Fastify from 'fastify';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: true });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const connectionString = process.env.DATABASE_URL || '';
const sql = postgres(connectionString, { ssl: 'require' });

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
        env_assigned VARCHAR(50) DEFAULT 'general',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}
initDB();

import fastifyStatic from '@fastify/static';
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

function determineEnvironment(profession = '', role = '', email = '') {
  if (email.toLowerCase() === 'englishtownincali@gmail.com') return 'admin';
  const text = `${profession} ${role}`.toLowerCase();
  
  if (text.includes('min') || text.includes('carbón') || text.includes('oro') || text.includes('mining')) return 'mining';
  if (text.includes('medic') || text.includes('doctor') || text.includes('salud') || text.includes('saludable')) return 'doctor';
  if (text.includes('músic') || text.includes('audio') || text.includes('productor') || text.includes('canción')) return 'music';
  if (text.includes('abogad') || text.includes('jurídic') || text.includes('derecho') || text.includes('legal')) return 'lawyer';
  if (text.includes('profesor') || text.includes('docente') || text.includes('lenguas') || text.includes('estudiante') || text.includes('enseñan')) return 'teaching';
  
  return 'general';
}

fastify.post('/api/auth/register', async (request, reply) => {
  const { email, password, firstName, lastName, userRole, profession } = request.body;
  try {
    const existing = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return reply.code(400).send({ error: 'El correo ya está registrado.' });
    }

    const assignedEnv = determineEnvironment(profession, userRole, email);

    await sql`
      INSERT INTO users (email, password, first_name, last_name, user_role, profession, env_assigned) 
      VALUES (${email}, ${password}, ${firstName || ''}, ${lastName || ''}, ${userRole || 'Independiente'}, ${profession || 'General'}, ${assignedEnv})
    `;

    return { 
      success: true, 
      message: 'Cuenta creada e identificada con éxito.', 
      firstName: firstName || 'Usuario',
      profession: profession, 
      env: assignedEnv 
    };
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

fastify.post('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body;
  try {
    const users = await sql`SELECT * FROM users WHERE email = ${email} AND password = ${password}`;
    if (users.length === 0) {
      return reply.code(401).send({ error: 'Credenciales inválidas o usuario no registrado.' });
    }
    const user = users[0];
    
    let assignedEnv = user.env_assigned || determineEnvironment(user.profession, user.user_role, email);
    if (email.toLowerCase() === 'englishtownincali@gmail.com') {
      assignedEnv = 'admin';
    }

    return { 
      success: true, 
      message: `Bienvenido de nuevo, ${user.first_name || email}`, 
      firstName: user.first_name || 'Usuario',
      profession: user.profession,
      env: assignedEnv 
    };
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

fastify.post('/api/orchestrate', async (request, reply) => {
  const { prompt, profession } = request.body;
  
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

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.4,
      }
    });

    const aiOutput = response.text || "Consulta procesada correctamente.";
    return { success: true, result: aiOutput };

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ 
      success: false, 
      result: `[Error de Conexión] No se pudo procesar la solicitud: ${err.message}` 
    });
  }
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Nexus Server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
