FROM node:20-bookworm

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git gnupg \
    && install -d -m 0755 /etc/apt/keyrings \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /etc/apt/keyrings/microsoft.gpg \
    && chmod go+r /etc/apt/keyrings/microsoft.gpg \
    && . /etc/os-release \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/microsoft.gpg] https://packages.microsoft.com/debian/${VERSION_ID}/prod ${VERSION_CODENAME} main" > /etc/apt/sources.list.d/microsoft-prod.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends powershell \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

ENV NODE_ENV=development
ENV ORQUESTRADOR_CONTAINER=1
ENV CI=true
ENV HOME=/tmp/Public

RUN mkdir -p /tmp/Public /workspace/.omx /workspace/.local \
    && chown -R node:node /tmp/Public /workspace/.omx /workspace/.local

USER node

EXPOSE 8787

CMD ["node", "bin/orquestrador-maestro.js", "server", "start", "--host", "0.0.0.0", "--port", "8787"]
