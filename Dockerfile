# Use the official Playwright image that has all dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy local code to the container image.
COPY . .

# Run the web service on container startup.
CMD [ "node", "index.js" ]
