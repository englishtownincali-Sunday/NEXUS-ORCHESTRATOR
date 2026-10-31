/* =====================================================================
   NEXUS ORCHESTRATOR · server.js (v4.1 - Production Ready)
   Backend principal: Fastify + PostgreSQL (Neon) + Google GenAI.
   ===================================================================== */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const VERSION = '4.1.0';

/* ----------------------------- Configuración ----------------------------- */
const DATABASE_URL = env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[Nexus OS] ERROR: La variable de entorno DATABASE_URL es obligatoria.');
  process.exit(1);
}

const GEMINI_MODEL = env.GEMINI_MODEL || 'gemini-2.5-flash';
const IS_LOCAL = /@(localhost|127\.0\.0\.1)(:|\/)/.test(DATABASE_URL);

const sql = postgres(DATABASE_URL, {
  ssl: IS_LOCAL ? false : 'require',
  max: 8,
  idle_timeout: 20,
  connect_timeout: 30
});

const ai = env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      ...(env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: env.GEMINI_BASE_URL } } : {})
    })
  : null;

const fastify = Fastify({
  logger: true,
  bodyLimit: 28 * 1024 * 1024,
  trustProxy: true
});

/* ------------------------------ Inicialización BD ------------------------------ */
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
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        environment VARCHAR(50),
        prompt TEXT,
        response TEXT,
        files TEXT,
        mode VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash CHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      )`;

    await sql`CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history (email, environment, created_at DESC)`;
    console.log('[Nexus OS] Base de datos sincronizada correctamente.');
  } catch (err) {
    console.error('[Nexus OS] Error al inicializar la base de datos:', err);
  }
}

/* ------------------------------ Utilidades de Seguridad ------------------------------ */
const scryptAsync = (pw, salt) => new Promise((res, rej) =>
  crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(pw, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

const publicProfile = u => { const { password, ...rest } = u; return rest; };

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function createSession(request, reply, email) {
  const token = crypto.randomBytes(32).toString('hex');
  await sql`INSERT INTO sessions (token_hash, email, expires_at) VALUES (${sha256(token)}, ${email}, now() + interval '30 days')`;
  const secure = request.protocol === 'https' ? '; Secure' : '';
  reply.header('Set-Cookie', `nx_sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`);
}

async function getUser(request) {
  const token = parseCookies(request.headers.cookie).nx_sid;
  if (!token || token.length !== 64) return null;
  const rows = await sql`
    SELECT u.* FROM sessions s JOIN users u ON u.email = s.email
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now()`;
  return rows[0] || null;
}

/* ------------------------------ Archivos Estáticos ------------------------------ */
fastify.register(fastifyStatic, { root: path.join(__dirname, 'public'), prefix: '/' });
fastify.get('/', async (request, reply) => reply.header('Cache-Control', 'no-cache').sendFile('index.html'));

/* ------------------------------ Endpoints API ------------------------------ */
fastify.get('/api/health', async () => {
  let db = false;
  try { await sql`SELECT 1`; db = true; } catch { /* offline */ }
  return { ok: db && !!ai, version: VERSION, db, gemini: !!ai, model: GEMINI_MODEL };
});

fastify.post('/api/auth/google-sim', async (request, reply) => {
  const { email, name, isAdmin } = request.body || {};
  if (!email) return reply.code(400).send({ error: 'El correo electrónico es obligatorio.' });

  let rows = await sql`SELECT * FROM users WHERE email = ${email}`;
  let user = rows[0];

  if (!user) {
    const [firstName, ...rest] = (name || 'Usuario Nexus').split(' ');
    const lastName = rest.join(' ') || '';
    const passHash = await hashPassword(crypto.randomBytes(16).toString('hex'));
    const inserted = await sql`
      INSERT INTO users (email, password, first_name, last_name, is_admin)
      VALUES (${email}, ${passHash}, ${firstName}, ${lastName}, ${!!isAdmin})
      RETURNING *`;
    user = inserted[0];
  } else if (user.is_admin !== !!isAdmin) {
    await sql`UPDATE users SET is_admin = ${!!isAdmin} WHERE id = ${user.id}`;
    user.is_admin = !!isAdmin;
  }

  await createSession(request, reply, user.email);
  return { success: true, profile: publicProfile(user) };
});

fastify.get('/api/auth/me', async (request) => {
  const user = await getUser(request);
  return user ? { success: true, profile: publicProfile(user) } : { success: false };
});

fastify.post('/api/auth/logout', async (request, reply) => {
  const token = parseCookies(request.headers.cookie).nx_sid;
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
  reply.header('Set-Cookie', 'nx_sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  return { success: true };
});

/* ------------------------------ Streaming & Gemini ------------------------------ */
fastify.post('/api/orchestrate/stream', async (request, reply) => {
  const user = await getUser(request);
  const { prompt, environment } = request.body || {};

  if (!prompt && !request.body?.files?.length) {
    return reply.code(400).send({ error: 'Se requiere una instrucción o archivo adjunto.' });
  }

  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no'
  });

  const send = o => raw.write(JSON.stringify(o) + '\n');

  try {
    send({ type: 'phase', id: 'recepcion', status: 'done', detail: 'Solicitud recibida' });
    send({ type: 'phase', id: 'redaccion', status: 'running' });

    let fullText = `### 💎 Nexus Orchestrator v4.1\n**Entorno activo:** ${(environment || 'general').toUpperCase()}\n\n`;

    if (ai) {
      const systemInstruction = `Eres Nexus Orchestrator v4.1, un sistema operativo de Inteligencia Artificial para tareas ejecutivas y analíticas. Tono impecable, riguroso y en Markdown. Entorno: ${environment || 'general'}.`;
      const streamResult = await ai.models.generateContentStream({
        model: GEMINI_MODEL,
        contents: `${systemInstruction}\n\nInstrucción: ${prompt}`
      });

      for await (const chunk of streamResult) {
        if (chunk.text) {
          fullText += chunk.text;
          send({ type: 'delta', text: chunk.text });
        }
      }
    } else {
      const fallbackText = `Orquestación completada en el entorno **${(environment || 'general').toUpperCase()}** para la instrucción:\n\n> "${prompt}"\n\n*(Nota: Configura GEMINI_API_KEY en Render)*`;
      fullText += fallbackText;
      send({ type: 'delta', text: fallbackText });
    }

    send({ type: 'phase', id: 'redaccion', status: 'done' });

    if (user) {
      await sql`
        INSERT INTO chat_history (email, environment, prompt, response)
        VALUES (${user.email}, ${environment || 'general'}, ${prompt}, ${fullText})`;
    }

    send({ type: 'done', model: GEMINI_MODEL });
  } catch (err) {
    request.log.error(err);
    send({ type: 'error', message: err.message || 'Error durante la orquestación.' });
  } finally {
    raw.end();
  }
});

/* ------------------------------ Arranque ------------------------------ */
const start = async () => {
  try {
    await initDB();
    const port = env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`[Nexus OS] Servidor v${VERSION} listo en el puerto ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
