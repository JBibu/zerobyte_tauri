# Bind-mount a local directory

This example shows how to back up a host directory by bind-mounting it into the C3i Backup ONE container.

It uses the simplified setup (no remote mounts).

## Prerequisites

- Docker + Docker Compose

## Setup

1. Copy the env file:

```bash
cp .env.example .env
```

2. Edit `.env` and set `HOST_DATA_DIR` to the directory you want to back up.

3. Start the stack:

```bash
docker compose up -d
```

## Use in C3i Backup ONE

- Create a new volume of type **Directory**
- Select the mounted path shown in the compose file: `/mydata`

## Access

- UI/API: `http://<host>:4096`
