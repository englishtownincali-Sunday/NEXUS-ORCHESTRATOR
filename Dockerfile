FROM node:20-alpine

WORKDIR /app

# Copiar dependencias e instalarlas
COPY package*.json ./
RUN npm install

# Copiar configuración, código fuente y la carpeta pública del frontend
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# Compilar TypeScript a JavaScript
RUN npm run build

EXPOSE 3000

# Iniciar la aplicación
CMD ["node", "dist/index.js"]
