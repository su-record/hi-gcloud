FROM node:18-alpine

WORKDIR /app

# gcloud CLI 설치
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    bash

# Google Cloud SDK 설치
RUN curl -sSL https://sdk.cloud.google.com | bash -s -- --disable-prompts --install-dir=/opt
ENV PATH="/opt/google-cloud-sdk/bin:${PATH}"

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build the application
RUN npm run build

CMD ["node", "dist/index.js"]
