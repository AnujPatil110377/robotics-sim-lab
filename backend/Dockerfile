# Use the official Node.js 18 image as the base
FROM node:18

# Application code lives in /app/backend
WORKDIR /app/backend

# Copy only dependency manifests first; improves layer caching!
COPY backend/package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy the rest of your app code
COPY backend/ .

# Copy static files for your portal UI (if not already included in previous copy)
COPY backend/public ./public

# Expose the backend API port
EXPOSE 3001

# Start the backend service
CMD ["node", "index.js"]
