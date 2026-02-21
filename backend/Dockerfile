FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3030

CMD ["node", "dist/server.js"]
