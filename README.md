# 💎 Nexus Orchestrator (V2.0 · Multi-OS Workspace)

**Nexus Orchestrator** es un sistema operativo de inteligencia artificial autónoma y conversacional, diseñado para centralizar entornos profesionales especializados (Pedagogía y Lenguas, Minería y Activos Globales, Derecho y Normativa, Música y Arte, Salud y Administración). 

La plataforma integra un chat inteligente dinámico asistido por **Gemini (Flash)**, un **Canvas Compilador interactivo y editable** con opciones de exportación y síntesis de voz, gestión de perfiles con persistencia en bases de datos, y un sistema de entornos institucionales adaptativos.

---

## 🏗️ Arquitectura Tecnológica Actual
* **Backend:** Node.js con Framework **Fastify** (`server.js`).
* **Frontend:** SPA nativa en un solo archivo optimizado (`public/index.html`) con diseño Glassmorphism avanzado.
* **Base de Datos:** PostgreSQL (con tablas para usuarios e historial de chat persistente).
* **Motor de IA:** Google Gen AI SDK (`@google/genai` utilizando `gemini-3.8-flash`).
* **Infraestructura y Despliegue:** Control de versiones en **GitHub** y despliegue continuo en **Render**.

---

## 📂 Estructura del Repositorio
Para mantener el proyecto limpio y funcional, **todo el desarrollo se concentra exclusivamente en dos archivos principales**:
1. `server.js` — Lógica del servidor, endpoints REST (Autenticación, Perfil, Orquestación con IA) y conexión a PostgreSQL.
2. `public/index.html` — Interfaz de usuario completa, estilos CSS institucionales y lógica JavaScript del cliente.

---

## 🚀 Guía para Desarrolladores y Colaboradores (Claude / Humanos)

Si estás colaborando en este proyecto (ya sea un desarrollador humano o un asistente como Claude), por favor ten en cuenta las siguientes **reglas estrictas**:

1. **No crear nuevos servidores ni servicios externos:** Todo debe integrarse directamente dentro del ecosistema actual de Node.js/Fastify en `server.js` y `public/index.html`.
2. **Despliegue automático:** Cualquier mejora debe ser compatible con el pipeline actual de despliegue continuo en **Render** conectado a **GitHub**.
3. **Potenciamiento permitido y sugerido:**
   * **Backend (`server.js`):** Puedes optimizar los system instructions de Gemini, añadir endpoints para analíticas, sub-orquestadores por fases o procesamiento avanzado de archivos adjuntos (PDFs, Word, Audio).
   * **Frontend (`public/index.html`):** Puedes incorporar librerías externas vía CDN (por ejemplo, Marked.js para renderizar Markdown avanzado en el Canvas, Tailwind CSS si se requiere modularizar, o mejoras en la síntesis de voz y UI/UX).

---

## 🛠️ Configuración Local y Ejecución

1. Clona el repositorio:
   ```bash
   git clone [https://github.com/tu-usuario/nexus-orchestrator.git](https://github.com/tu-usuario/nexus-orchestrator.git)
   cd nexus-orchestrator
