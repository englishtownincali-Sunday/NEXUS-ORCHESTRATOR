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
        profession VARCHAR(50) DEFAULT 'general',
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

fastify.post('/api/auth/register', async (request, reply) => {
  const { email, password, profession } = request.body;
  try {
    const existing = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return reply.code(400).send({ error: 'El usuario ya está registrado en el sistema.' });
    }
    await sql`INSERT INTO users (email, password, profession) VALUES (${email}, ${password}, ${profession || 'general'})`;
    return { success: true, message: 'Usuario registrado correctamente.', profession: profession || 'general' };
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
    
    let assignedProfession = user.profession || 'general';
    if (email.toLowerCase() === 'englishtownincali@gmail.com') {
      assignedProfession = 'admin';
    }

    return { success: true, message: `Bienvenido de nuevo, ${email}`, profession: assignedProfession };
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

fastify.post('/api/orchestrate', async (request, reply) => {
  const { prompt, profession } = request.body;
  
  try {
    let systemInstruction = "Eres Nexus Orchestrator, un sistema operativo de inteligencia artificial ejecutivo. Debes generar informes y análisis exhaustivos, detallados y técnicos en el Canvas.";

    if (profession === 'mining') {
      systemInstruction = "Eres la IA ejecutiva de AuraX Global. Especialista máster en minería internacional, activo de carbón, oro, minerales críticos, valuación de reservas, contratos Incoterms 2020 y cumplimiento ESG.";
    } else if (profession === 'doctor') {
      systemInstruction = "Eres la IA clínica médica de Clinic Nexus. Especialista en medicina basada en evidencia, triaje clínico avanzado y protocolos de salud integral.";
    } else if (profession === 'music') {
      systemInstruction = "Eres la IA de producción de Sonic Orchestrator. Experta en acústica, arreglos, mezcla y masterización.";
    } else if (profession === 'lawyer') {
      systemInstruction = "Eres la IA jurídica de Jurídica Nexus. Experta en revisión contractual, derecho corporativo preventivo y mitigación de riesgos legales.";
    } else if (profession === 'teaching') {
      systemInstruction = "Eres la IA pedagógica de Lingua Orchestrator. Experta en diseño curricular PBL, didáctica de lenguas extranjeras y fonética IPA.";
    } else if (profession === 'admin') {
      systemInstruction = "Eres el núcleo central Nexus Command. Proporciona análisis ejecutivo de arquitectura de sistemas y auditoría de seguridad.";
    }

    // Modelo exacto gemini-2.5-flash requerido por la SDK actual
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3,
      }
    });

    const aiOutput = response.text || "Consulta procesada con éxito por el clúster de IA.";
    return { success: true, result: aiOutput };

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ 
      success: false, 
      result: `[Error de Conexión con el Modelo]\nNo se pudo procesar la solicitud con Gemini API: ${err.message}` 
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
