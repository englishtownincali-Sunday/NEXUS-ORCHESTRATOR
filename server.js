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

// Inicialización y corrección automática de la base de datos
async function initDB() {
  try {
    // Eliminar la tabla antigua para asegurar la estructura exacta y limpia
    await sql`DROP TABLE IF EXISTS users`;
    
    // Crear la tabla completa con persistencia real en Neon PostgreSQL
    await sql`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        profession VARCHAR(50) DEFAULT 'general',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log("✅ Base de datos Neon conectada y tabla 'users' creada correctamente con persistencia.");
  } catch (err) {
    console.error("❌ Error inicializando la base de datos:", err);
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
    return { success: true, message: 'Usuario registrado correctamente en Neon DB.', profession: profession || 'general' };
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
    return { success: true, message: `Bienvenido de nuevo, ${email}`, profession: user.profession || 'general' };
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

fastify.post('/api/orchestrate', async (request, reply) => {
  const { prompt, profession } = request.body;
  
  try {
    let systemInstruction = "Eres Nexus Orchestrator, un asistente ejecutivo de nivel experto, riguroso, analítico y profundo.";
    if (profession === 'mining') {
      systemInstruction = "Eres el núcleo de inteligencia experto en minería global, activos de carbón, oro, metales, normativas ESG, estándares SGS/Bureau Veritas e Incoterms 2020. Proporciona respuestas técnicas y detalladas.";
    } else if (profession === 'doctor') {
      systemInstruction = "Eres un consultor médico y clínico experto en protocolos de triaje, farmacología y guías de salud con rigor científico.";
    } else if (profession === 'music') {
      systemInstruction = "Eres un productor musical y arreglista experto en acústica, mezcla, frecuencias, licencias y distribución editorial.";
    } else if (profession === 'lawyer') {
      systemInstruction = "Eres un asesor jurídico experto en revisión contractual, análisis jurisprudencial y derecho corporativo preventivo.";
    } else if (profession === 'teaching') {
      systemInstruction = "Eres un experto en pedagogía, diseño curricular basado en Aprendizaje Basado en Proyectos (PBL), fonética IPA y enseñanza de lenguas extranjeras.";
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.4,
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
