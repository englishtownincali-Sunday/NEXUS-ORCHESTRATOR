# Usar imagen ligera de Node.js
FROM node:20-alpine

# Definir el directorio de trabajo
WORKDIR /app

# Copiar manifiestos e instalar dependencias de producción
COPY package*.json ./
RUN npm install --only=production

# Copiar el servidor y la carpeta pública del frontend
COPY server.js ./
COPY public ./public

# Exponer el puerto
EXPOSE 3000

# Comando de inicio del servidor
CMD ["node", "server.js"]
