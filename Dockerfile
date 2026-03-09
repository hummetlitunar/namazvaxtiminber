# Use the official Playwright image
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
COPY package*.json ./

# Install dependencies
RUN npm install

# Install ONLY chromium to keep image size small
RUN npx playwright install chromium

# Copy local code to the container image.
COPY . .

# Run the web service on container startup.
CMD [ "node", "index.js" ]
