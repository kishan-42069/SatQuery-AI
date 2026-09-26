# 🚀 SatQuery AI — Complete Deployment Guide

This guide covers everything required to run SatQuery AI — whether on a teammate's **local machine** (Section 12) or deployed to the **Oracle Cloud Free VM** (Sections 4–11).

---

## Table of Contents
1. [Architecture & Topology Overview](#1-architecture--topology-overview)
2. [Recommended Cloud Platform: Oracle Cloud Free Tier](#2-recommended-cloud-platform-oracle-cloud-free-tier)
3. [Pre-deployment Preparation (Local Machine)](#3-pre-deployment-preparation-local-machine)
4. [Step-by-Step Server Setup](#4-step-by-step-server-setup)
5. [Firewall & Network Configuration](#5-firewall--network-configuration)
6. [Docker Installation & Setup](#6-docker-installation--setup)
7. [Deploying SatQuery AI on the Server](#7-deploying-satquery-ai-on-the-server)
8. [Database Seeding & Verification](#8-database-seeding--verification)
9. [Setting Up a Custom Domain & Free SSL (Certbot)](#9-setting-up-a-custom-domain--free-ssl-certbot)
10. [Maintenance, Zero-Downtime Updates & Troubleshooting](#10-maintenance-zero-downtime-updates--troubleshooting)
11. [GitHub Actions CI/CD — Automatic Deployments](#11-github-actions-cicd--automatic-deployments)
12. [Running Locally on a Teammate's Machine](#12-running-locally-on-a-teammates-machine)

---

## 1. Architecture & Topology Overview

SatQuery AI uses containerized microservices managed via **Docker Compose**:

```
                       Internet (Browser Clients)
                                  │
                                  ▼
                         [Nginx Reverse Proxy]
                             (:80 / :443)
                            ┌─────┴─────┐
             /api/* & /ws/* │           │ /* (Web UI)
                            ▼           ▼
                   [FastAPI API]   [Next.js Frontend]
                      (:8000)           (:3000)
                         │                 │
                ┌────────┴────────┐        │
                ▼                 ▼        │
         [PostgreSQL + PostGIS] [Redis]    │
               (Storage)      (Task Queue) │
                                  │        │
                                  ▼        ▼
                          [Background Worker]
```

### Services Deployed in Production (`docker-compose.prod.yml`):
| Service | Image/Context | Description |
|:---|:---|:---|
| **nginx** | `nginx:alpine` | Gateway reverse proxy, handles HTTP, WebSocket upgrades, gzip & timeouts |
| **migrate** | `./Dockerfile` | Runs `alembic upgrade head` before API starts, then exits |
| **api** | `./Dockerfile` | FastAPI backend with Gunicorn workers |
| **worker** | `./Dockerfile` | Async background analysis worker (`python -m app.workers.query_worker`) |
| **frontend** | `./frontend/Dockerfile` | Production Next.js web application |
| **db** | `postgis/postgis:16-3.4` | PostgreSQL with PostGIS spatial extensions (loopback only) |
| **redis** | `redis:7.4-alpine` | Redis task queue and pub/sub broker (loopback only) |

---

## 2. Recommended Cloud Platform: Oracle Cloud Free Tier

### Why Oracle Cloud?
- **Cost**: **₹0 / $0 Forever** (Always Free Tier)
- **Compute**: Ampere A1 ARM Compute: **4 OCPUs (vCPUs), 24 GB RAM**
- **Disk Storage**: **200 GB NVMe Boot Volume** (free)
- **Bandwidth**: **10 TB/month outbound**
- **No Cold Starts**: Your API and database run 24/7 without sleeping.

*(Alternative: Any Ubuntu 22.04/24.04 x86 or ARM VPS with ≥4GB RAM on AWS EC2, DigitalOcean, Hetzner, or GCP will work identically).*

---

## 3. Pre-deployment Preparation (Local Machine)

Before deploying, ensure your Git repository is updated and pushed to your remote repository (e.g., GitHub):

```bash
# In your local SatQuery_AI directory:
git add .
git commit -m "feat: ready for cloud deployment"
git push origin master
```

### 3.1. Fine-Tuned Model Weights Ready (PaliGemma 3B + LoRA)
> [!IMPORTANT]
> **The Vision-Language Model is already fully trained!**
> - **Model**: Google PaliGemma 3B (`google/paligemma-3b-pt-224`) + 4-bit QLoRA
> - **Dataset**: `bigearthnet-medium` (25,000 train / 10,000 validation samples)
> - **Training Duration & Epochs**: 3 full epochs (4,689 steps)
> - **Loss Metrics**: Final train loss **0.1576**, best validation loss **0.1583**
> - **Artifacts Location**: `data/weights/satquery-paligemma-lora/` (~48 MB total)
> 
> **Automatic Download via Git**: The `data/weights/satquery-paligemma-lora/` folder is tracked in Git, meaning when your teammate runs `git clone` or `git pull` on the Oracle server, the model weights are **automatically included**.

Make sure you have your API keys ready:
- **Google Gemini API Key**: [Google AI Studio](https://aistudio.google.com/)
- **Hugging Face Token (HF_TOKEN)**: Required on first boot to download base PaliGemma 3B weights.

---

## 4. Step-by-Step Server Setup

### 4.1. Provision Oracle Cloud VM
1. Go to [cloud.oracle.com](https://cloud.oracle.com) and sign in.
2. In the dashboard, navigate to: **Compute → Instances → Create Instance**.
3. Fill in the parameters:
   - **Name**: `satquery-prod`
   - **Image**: `Ubuntu 22.04` (or `Ubuntu 24.04`)
   - **Shape**: Click *Change Shape* → select **Ampere (ARM)** → **VM.Standard.A1.Flex**
   - **OCPUs**: `4`
   - **Memory**: `24 GB`
   - **Networking**: Select or create default VCN with a Public Subnet. Ensure **Assign a public IPv4 address** is selected.
   - **SSH Keys**: Download the generated private key or paste your local public key (`~/.ssh/id_rsa.pub`).
4. Click **Create**. Note the assigned **Public IP Address** (e.g., `141.148.x.x`).

---

## 5. Firewall & Network Configuration

Oracle Cloud requires two firewall layers to be opened:

### 5.1. Oracle Cloud Security List (VCN Web Console)
1. In Oracle Cloud Console, go to **Networking → Virtual Cloud Networks (VCN)**.
2. Click your VCN → click **Security Lists** → click **Default Security List for...**.
3. Under **Ingress Rules**, click **Add Ingress Rules**:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `80,443`
   - **Description**: `HTTP and HTTPS for SatQuery AI`
4. Click **Add Ingress Rules**.

### 5.2. Server OS Firewall (iptables)
SSH into your server:
```bash
ssh -i /path/to/your/ssh_key ubuntu@<YOUR_VM_PUBLIC_IP>
```

Open ports 80 and 443 in the host firewall:
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save || sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
```

---

## 6. Docker Installation & Setup

Run these commands inside your VM to install Docker Engine and Docker Compose:

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker via official convenience script
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group (avoid sudo for docker commands)
sudo usermod -aG docker ubuntu
newgrp docker

# Verify installation
docker --version
docker compose version
```

---

## 7. Deploying SatQuery AI on the Server

### 7.1. Clone the Codebase
```bash
cd /home/ubuntu
git clone https://github.com/<YOUR_USERNAME>/SatQuery_AI.git
cd SatQuery_AI
```

### 7.2. Verify Fine-Tuned Model Weights
Because the trained PaliGemma 3B LoRA adapter (~48 MB) is tracked in Git, it is **automatically downloaded** when you run `git clone`!

Verify the weights exist on your server:
```bash
ls -la /home/ubuntu/SatQuery_AI/data/weights/satquery-paligemma-lora
```
You should see:
- `adapter_model.safetensors` (~15.4 MB)
- `adapter_config.json`
- `processor_config.json`
- `tokenizer.json` (33 MB) & `tokenizer_config.json`
- `training_summary.json` (shows 3 epochs, 4,689 steps, train loss 0.1576)

> [!TIP]
> `docker-compose.prod.yml` is already configured with `./data/weights:/app/data/weights:ro` so both `api` and `worker` containers can automatically access these weights at `/app/data/weights/satquery-paligemma-lora`.

*(Optional fallback: If you ever need to manually re-transfer weights from your local training machine: `rsync -avz -e "ssh -i key" data/weights/satquery-paligemma-lora ubuntu@<IP>:/home/ubuntu/SatQuery_AI/data/weights/`)*

### 7.3. Configure Dependencies (Optional: Local VLM inside Docker)
If you wish to run the fine-tuned PaliGemma model directly inside the Docker container on Oracle ARM CPU, enable the PyTorch and transformers dependencies before building:
```bash
cp requirements-gpu.txt requirements.txt
```
*(If you only plan to use the Gemini VLM API, you can skip this step and keep the default lightweight `requirements.txt`).*

### 7.4. Configure Environment Variables
Create `.env.prod.real` from the template:
```bash
cp .env.prod .env.prod.real
nano .env.prod.real
```

Generate a secure 64-character secret key:
```bash
python3 -c "import secrets; print(secrets.token_hex(64))"
```

Fill out the fields in `.env.prod.real`:
```env
# ── DATABASE ──────────────────────────────────────────────────────────────────
POSTGRES_USER=satquery
POSTGRES_PASSWORD=YourStrongDatabasePassword123!
POSTGRES_DB=satquery_db
POSTGRES_HOST=db
POSTGRES_PORT=5432
DATABASE_URL=postgresql+asyncpg://satquery:YourStrongDatabasePassword123!@db:5432/satquery_db

# ── REDIS ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── STORAGE ───────────────────────────────────────────────────────────────────
STORAGE_BACKEND=local
STORAGE_LOCAL_ROOT=./data

# ── SECURITY ──────────────────────────────────────────────────────────────────
SECRET_KEY=<PASTE_THE_GENERATED_64_CHAR_HEX_HERE>
ALLOWED_ORIGINS=http://<YOUR_VM_PUBLIC_IP>

# ── APP CONFIG ────────────────────────────────────────────────────────────────
APP_ENV=development

# ── VLM (VISION-LANGUAGE MODEL) ────────────────────────────────────────────────
# Uses the fine-tuned PaliGemma LoRA weights mounted into /app/data/weights:
VLM_MODEL_NAME=/app/data/weights/satquery-paligemma-lora
VLM_DEVICE=cpu    # Use 'cpu' for Oracle Free Tier ARM, or 'cuda' if GPU instance

# ── GEMINI LLM ORCHESTRATOR & REPORT AGENT ────────────────────────────────────
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash
GOOGLE_API_KEY=<YOUR_GOOGLE_GEMINI_API_KEY>
GEMINI_API_KEY=<YOUR_GOOGLE_GEMINI_API_KEY>
GEMINI_MODEL=gemini-2.0-flash

# ── FRONTEND NETWORKING ───────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://<YOUR_VM_PUBLIC_IP>/api/v1
NEXT_PUBLIC_WS_URL=ws://<YOUR_VM_PUBLIC_IP>/api/v1
```

Save and exit (`Ctrl + O`, `Enter`, then `Ctrl + X`).

### 7.5. Build & Launch Containers
SatQuery AI includes optimized multi-stage Docker build caching:

```bash
export DOCKER_BUILDKIT=1
docker compose -f docker-compose.prod.yml --env-file .env.prod.real up -d --build
```
> ⏱️ *Note:* The initial build installs GDAL, spatial packages, and compiles Next.js. It takes ~8-12 minutes. Subsequent builds will take ~60-90 seconds.

### 7.6. Inspect Running Services
Check container status:
```bash
docker compose -f docker-compose.prod.yml ps
```
You should see all 6 services (`satquery_nginx`, `satquery_api`, `satquery_worker`, `satquery_frontend`, `satquery_db`, `satquery_redis`) up and healthy, while `satquery_migrate` exits with status `0` (migration complete).

To tail backend logs:
```bash
docker logs -f satquery_api
```

---

## 8. Database Seeding & Verification

### 8.1. Run Demo Data Seeding
Populate your production database with initial sample satellite sessions and queries:
```bash
docker exec satquery_api python scripts/seed_demo.py
```

### 8.2. Test the Application
1. Open your browser and navigate to:
   ```
   http://<YOUR_VM_PUBLIC_IP>
   ```
2. Test the API health endpoint:
   ```bash
   curl http://localhost/api/v1/health
   # or
   curl http://<YOUR_VM_PUBLIC_IP>/api/v1/health
   ```
   *Expected Response:*
   ```json
   {"status":"ok","version":"0.1.0","app_name":"SatQuery AI"}
   ```

---

## 9. Setting Up a Custom Domain & Free SSL (Certbot)

To switch from plain HTTP (`http://IP`) to production HTTPS (`https://yourdomain.com`):

### 9.1. Point DNS Records
Add an **A record** in your domain registrar (Cloudflare, Namecheap, GoDaddy):
- **Host / Name**: `satquery` (or `@` for apex domain)
- **Value**: `<YOUR_VM_PUBLIC_IP>`

### 9.2. Obtain Let's Encrypt Certificate
Install Certbot on the host:
```bash
sudo apt-get install -y certbot
```

Stop Nginx temporarily to obtain the certificate:
```bash
docker compose -f docker-compose.prod.yml stop nginx
sudo certbot certonly --standalone -d yourdomain.com
docker compose -f docker-compose.prod.yml start nginx
```

### 9.3. Mount Certificates into Nginx
Update `nginx/nginx.conf` and `docker-compose.prod.yml` to mount `/etc/letsencrypt/live/yourdomain.com/` into `/etc/nginx/certs/`:
- `fullchain.pem` → `cert.pem`
- `privkey.pem` → `key.pem`

Update `.env.prod.real`:
```env
ALLOWED_ORIGINS=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1
NEXT_PUBLIC_WS_URL=wss://yourdomain.com/api/v1
APP_ENV=production
```

Recreate the containers:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod.real up -d --build frontend nginx
```

---

## 10. Maintenance, Zero-Downtime Updates & Troubleshooting

### 10.1. Auto-Start on System Reboot
Ensure containers restart automatically if the cloud instance restarts:
```bash
crontab -e
```
Add the following line to the bottom:
```bash
@reboot cd /home/ubuntu/SatQuery_AI && DOCKER_BUILDKIT=1 docker compose -f docker-compose.prod.yml --env-file .env.prod.real up -d
```

### 10.2. Deploying New Code Changes
When you push new changes to GitHub:
```bash
cd /home/ubuntu/SatQuery_AI
git pull origin master
DOCKER_BUILDKIT=1 docker compose -f docker-compose.prod.yml --env-file .env.prod.real up -d --build
```
*Docker will only rebuild changed code layers, updating services in ~60-90 seconds.*

### 10.3. Useful Commands
- **View logs across all services**:
  ```bash
  docker compose -f docker-compose.prod.yml logs -f
  ```
- **View worker logs only**:
  ```bash
  docker logs -f satquery_worker
  ```
- **Restart a specific service**:
  ```bash
  docker compose -f docker-compose.prod.yml restart api
  ```
- **Clean unused docker cache/images**:
  ```bash
  docker image prune -f
  ```
- **Backup PostgreSQL database**:
  ```bash
  docker exec satquery_db pg_dump -U satquery satquery_db > satquery_backup_$(date +%F).sql
  ```

---

## 11. GitHub Actions CI/CD — Automatic Deployments

This section sets up a fully automatic pipeline so that every `git push` to the `deploy` branch triggers a secure, zero-downtime redeployment on the Oracle VM — **no manual SSH required**.

### How It Works

```
Your laptop
    │
    │  git push origin deploy
    ▼
GitHub Repository  (source of truth)
    │
    │  .github/workflows/deploy.yml fires automatically
    ▼
GitHub-hosted runner (ubuntu-latest, free)
    │  ├─ Job 1: validates docker-compose.prod.yml & required files
    │  └─ Job 2: SSHes into Oracle VM and runs the deploy script
    ▼
Oracle VM  (your running application)
    │  1. git reset --hard origin/deploy     ← pull latest code
    │  2. docker compose build               ← rebuild changed layers only
    │  3. docker compose run --rm migrate    ← run alembic BEFORE restarting
    │  4. docker compose up -d --no-build    ← swap containers gracefully
    │  5. curl /api/v1/health (×30 retries)  ← verify app is healthy
    │  6. docker image prune                 ← reclaim disk space
    ▼
Application updated and running
```

> [!IMPORTANT]
> The file `.github/workflows/deploy.yml` is already in the repository.
> All you need to do is complete the three phases below.

---

### Phase A — Prepare the Oracle VM (run once)

SSH into your Oracle VM:
```bash
ssh -i ~/.ssh/oracle_satquery.pem ubuntu@<YOUR_VM_PUBLIC_IP>
```

#### A1. Run the one-time VM setup script

This installs Docker, opens firewall ports, and creates a systemd unit so the app survives reboots.

```bash
# On the Oracle VM:
cd /home/ubuntu/SatQuery_AI

# Make the script executable and run it
chmod +x scripts/vm_setup.sh
REPO_URL=https://github.com/<YOUR_USERNAME>/SatQuery_AI.git \
  bash scripts/vm_setup.sh
```

> **What the script does step by step:**
> 1. `apt-get update && apt-get upgrade` — patches system packages
> 2. `curl get.docker.com | sh` — installs the official Docker Engine
> 3. `usermod -aG docker ubuntu` — run docker without sudo after re-login
> 4. `systemctl enable docker` — Docker starts on every VM reboot
> 5. `iptables -I INPUT -p tcp --dport 80 -j ACCEPT` — opens port 80 (Oracle blocks it by default)
> 6. `iptables -I INPUT -p tcp --dport 443 -j ACCEPT` — opens port 443
> 7. `netfilter-persistent save` — iptables rules survive reboots
> 8. `git clone --branch deploy <REPO_URL>` — clones the repo (if not already present)
> 9. Opens `nano .env.prod` — prompts you to fill in secrets
> 10. Creates `/etc/systemd/system/satquery.service` — auto-starts the stack on VM reboot

#### A2. Create `.env.prod` on the VM

> [!IMPORTANT]
> `.env.prod` is intentionally **not** in git (it's in `.gitignore`). It lives only on the VM and contains your real secrets. Create it once — CI/CD reads it on every deploy but never modifies it.

```bash
# On the Oracle VM:
cd /home/ubuntu/SatQuery_AI

# 1. Generate a secure 64-character secret key:
python3 -c "import secrets; print(secrets.token_hex(64))"
# Copy the output — you'll paste it into .env.prod as SECRET_KEY

# 2. Create .env.prod from the existing template:
cp .env.prod .env.prod.bak    # optional backup of the placeholder template
nano .env.prod
```

Fill in the following values (everything else can stay as-is):

```env
# ── DATABASE ──────────────────────────────────────────────────────────────────
POSTGRES_USER=satquery
POSTGRES_PASSWORD=YourStrongDatabasePassword123!
POSTGRES_DB=satquery_db
POSTGRES_HOST=db
POSTGRES_PORT=5432
DATABASE_URL=postgresql+asyncpg://satquery:YourStrongDatabasePassword123!@db:5432/satquery_db

# ── REDIS ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── STORAGE (local filesystem — Oracle VM has 200 GB boot volume) ─────────────
STORAGE_BACKEND=local
STORAGE_LOCAL_ROOT=./data

# ── SECURITY ──────────────────────────────────────────────────────────────────
SECRET_KEY=<PASTE_THE_GENERATED_64_CHAR_HEX_HERE>
ALLOWED_ORIGINS=http://<YOUR_VM_PUBLIC_IP>

# ── APP ───────────────────────────────────────────────────────────────────────
APP_ENV=development
# Keep development so CORS does not enforce HTTPS-only (no SSL cert yet)

# ── VLM ───────────────────────────────────────────────────────────────────────
VLM_MODEL_NAME=./data/weights/satquery-paligemma-lora
VLM_DEVICE=cpu

# ── LLM / GEMINI ──────────────────────────────────────────────────────────────
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash
GOOGLE_API_KEY=<YOUR_GOOGLE_GEMINI_API_KEY>
GEMINI_API_KEY=<YOUR_GOOGLE_GEMINI_API_KEY>
GEMINI_MODEL=gemini-2.0-flash
OPENAI_API_KEY=PLACEHOLDER_API_KEY_TO_BE_PROVIDED

# ── FRONTEND ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://<YOUR_VM_PUBLIC_IP>/api/v1
NEXT_PUBLIC_WS_URL=ws://<YOUR_VM_PUBLIC_IP>/api/v1

# ── HUGGING FACE (needed for PaliGemma base model on first run) ───────────────
HF_TOKEN=hf_your_huggingface_token_here
```

Save and exit: `Ctrl + O`, `Enter`, then `Ctrl + X`.

#### A3. Do the initial build and launch

```bash
# On the Oracle VM:
cd /home/ubuntu/SatQuery_AI

export DOCKER_BUILDKIT=1
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

> ⏱️ The first build takes **8–12 minutes** (installs GDAL, PostGIS drivers, compiles Next.js).
> Subsequent CI/CD deployments take **~60–90 seconds**.

Verify everything started correctly:

```bash
# Check all service states:
docker compose -f docker-compose.prod.yml ps

# Expected output:
# satquery_nginx      running
# satquery_api        running
# satquery_worker     running
# satquery_frontend   running
# satquery_db         running (healthy)
# satquery_redis      running (healthy)
# satquery_migrate    exited (0)   ← correct — it ran migrations and quit

# Confirm the API is healthy:
curl http://localhost/api/v1/health
# Expected: {"status":"ok","version":"0.1.0","app_name":"SatQuery AI"}
```

---

### Phase B — Add GitHub Secrets (run once, in GitHub)

Go to your GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**.

Add all **5** secrets exactly as shown:

| Secret name | What to put | Example |
|---|---|---|
| `ORACLE_HOST` | Your VM's public IP address | `141.148.12.34` |
| `ORACLE_USER` | SSH login username | `ubuntu` |
| `ORACLE_SSH_KEY` | The **full contents** of your `.pem` private key file | `-----BEGIN OPENSSH PRIVATE KEY-----`...`-----END OPENSSH PRIVATE KEY-----` |
| `ORACLE_PORT` | SSH port (almost always 22) | `22` |
| `DEPLOY_DIR` | Absolute path to the repo on the VM | `/home/ubuntu/SatQuery_AI` |

**How to get your private key contents** (run on your local machine):
```bash
cat ~/.ssh/oracle_satquery.pem
# Copy everything printed — from -----BEGIN to -----END (inclusive)
# Paste the entire output as the value of ORACLE_SSH_KEY
```

---

### Phase C — Create the `deploy` branch and push (local machine)

```bash
# On your local machine, inside the SatQuery_AI directory:

# Create the deploy branch from your current branch (e.g. main/master)
git checkout -b deploy
git push -u origin deploy
```

> [!TIP]
> You only need to create the `deploy` branch once.
> After that, your normal workflow is:
> - Develop on `main` (or any feature branch)
> - Merge to `deploy` when ready to ship → GitHub Actions auto-deploys

---

### Phase D — Test the pipeline

```bash
# On your local machine:
git checkout deploy

# Make any small change to verify the pipeline:
echo "# CI/CD test" >> README.md
git add README.md
git commit -m "test: trigger CI/CD pipeline"
git push origin deploy
```

Then watch it run live:
**GitHub → Actions → Deploy SatQuery AI**

You'll see two jobs:
1. **Pre-flight Checks** (~30 s) — validates compose file & required files on GitHub's runner
2. **Deploy to Oracle VM** (~2–5 min) — SSHes in and runs the 7-step deploy script

---

### 11.1. Day-to-Day Deployment Workflow

```bash
# Develop normally on main:
git checkout main
# ... make changes, test locally ...
git add .
git commit -m "feat: my new feature"
git push origin main

# When ready to deploy to production:
git checkout deploy
git merge main          # bring changes from main into deploy
git push origin deploy  # ← this line triggers GitHub Actions → Oracle VM
```

That's it. GitHub Actions handles everything from here.

---

### 11.2. What GitHub Actions Does on Each Deploy (Exact Steps)

Every push to the `deploy` branch runs this sequence automatically on the Oracle VM:

```bash
# 1. Move to the project directory
cd /home/ubuntu/SatQuery_AI

# 2. Verify .env.prod exists (CI fails clearly if it's missing)
[ -f .env.prod ] || exit 1

# 3. Pull latest code
git fetch origin deploy
git reset --hard origin/deploy

# 4. Build only changed Docker image layers (BuildKit caching)
export DOCKER_BUILDKIT=1
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  build --parallel api worker frontend

# 5. Run DB migrations BEFORE restarting the API
#    (schema is always ready when the new API version starts)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm migrate

# 6. Swap containers gracefully (old container stays up until new one is ready)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --no-build api worker frontend nginx

# 7. Health check: poll /api/v1/health every 5s for up to 150s
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/v1/health)
  [ "$STATUS" = "200" ] && break
  sleep 5
done

# 8. Prune dangling images to reclaim disk space
docker image prune -f
```

---

### 11.3. Safety Guarantees

| Concern | How it's handled |
|---|---|
| **Secrets never in git** | `.env.prod` is in `.gitignore`; SSH key/IP/passwords only in GitHub Secrets |
| **Failed build doesn't kill running app** | `build` runs first; `up -d` only fires after a successful build |
| **DB migrated before API restarts** | `run --rm migrate` runs alembic before `up -d`; schema always ahead of code |
| **Health check gates success** | CI fails (red ✗) if `/api/v1/health` doesn't return 200 within 150 s |
| **No parallel deployments** | `concurrency: group: production-deploy` serialises all deploys |
| **App survives VM reboots** | `satquery.service` systemd unit auto-starts Docker Compose |
| **SSH host pinned** | `ssh-keyscan` pins the VM's public key — prevents MITM warnings |

---

### 11.4. Manually Trigger a Deploy (without pushing code)

You can re-run the latest deploy from the GitHub UI at any time:

1. Go to **GitHub → Actions → Deploy SatQuery AI**
2. Click **Run workflow** (top-right)
3. Select branch `deploy` → click **Run workflow**

Or from the command line using the GitHub CLI:
```bash
gh workflow run deploy.yml --ref deploy
```

---

### 11.5. Troubleshooting CI/CD

| Symptom | Cause | Fix |
|---|---|---|
| `ssh-keyscan` step fails | Wrong `ORACLE_HOST` or `ORACLE_PORT` secret | Double-check the IP and port in GitHub Secrets |
| `Configure SSH agent` fails | Malformed key | Paste the **entire** key including `-----BEGIN` and `-----END` lines |
| Deploy fails: `.env.prod not found` | File doesn't exist on VM | SSH into VM; create `/home/ubuntu/SatQuery_AI/.env.prod` |
| Health check times out | API crashed on startup | `docker logs satquery_api` on the VM for the error |
| Port 80 still unreachable | Oracle VCN or iptables blocked | Verify Security List ingress rules AND run `sudo iptables -L INPUT -n \| grep 80` |
| `docker compose build` fails | Missing dependency or bad `requirements.txt` | Check build logs in GitHub Actions output |
| Old version still running after deploy | Health check passed but cache served old JS | Hard-refresh browser (`Ctrl+Shift+R`) or clear CDN cache |

---

## 12. Running Locally on a Teammate's Machine

Your teammate **does not need Oracle Cloud** to run SatQuery AI.
The full stack (API + worker + frontend + database + Redis + MinIO) runs on any laptop or desktop using **Docker Compose** — Windows, Mac, or Linux.

> [!NOTE]
> This section is for **local development / testing only**.
> For the live production deployment on Oracle Cloud, see Sections 4–11.

---

### 12.1. Prerequisites (install once)

| Tool | How to install |
|---|---|
| **Docker Desktop** | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) — includes Docker Compose v2 |
| **Git** | [git-scm.com](https://git-scm.com/) |
| **Python 3.11+** | Only needed if running without Docker. Skip if using Docker only. |

Verify after installing:
```bash
docker --version          # Docker version 24.x or later
docker compose version    # Docker Compose version v2.x or later
git --version
```

---

### 12.2. Step 1 — Clone the repository

```bash
# Clone from GitHub:
git clone https://github.com/<YOUR_USERNAME>/SatQuery_AI.git
cd SatQuery_AI
```

> [!TIP]
> Replace `<YOUR_USERNAME>` with the actual GitHub username.
> The fine-tuned PaliGemma LoRA weights (`data/weights/satquery-paligemma-lora/`) are tracked in Git and will be downloaded automatically.

---

### 12.3. Step 2 — Create the secrets files

The local `docker-compose.yml` uses **Docker Secrets** (plain text files in the `secrets/` folder).
These files are already in `.gitignore` so they are never committed.

```bash
# Create each secrets file with the required value:

# PostgreSQL password (choose anything for local dev)
echo "localdevpassword" > secrets/postgres_password.txt

# JWT signing key (generate a random 64-char hex key)
python3 -c "import secrets; print(secrets.token_hex(64))" > secrets/secret_key.txt

# Gemini API key — get one free at https://aistudio.google.com/
echo "YOUR_GEMINI_API_KEY_HERE" > secrets/gemini_api_key.txt

# OpenAI API key (can be a placeholder if you're using Gemini only)
echo "PLACEHOLDER_OPENAI_KEY" > secrets/openai_api_key.txt

# MinIO credentials (any username/password, min 8 chars for password)
echo "minioadmin" > secrets/minio_root_user.txt
echo "minioadmin" > secrets/minio_root_password.txt
```

> [!IMPORTANT]
> Never commit these files. They are already covered by `.gitignore:19` (`secrets/*.txt`).

---

### 12.4. Step 3 — Create the `.env` file

```bash
# Copy the example template:
cp .env.example .env

# Open and edit it:
nano .env      # or: code .env  (VS Code)  |  notepad .env  (Windows)
```

Set **only** these values — leave everything else as the default in `.env.example`:

```env
# Match the password you put in secrets/postgres_password.txt
DATABASE_URL=postgresql+asyncpg://satquery:localdevpassword@db:5432/satquery_db

# Your Gemini API key
GOOGLE_API_KEY=YOUR_GEMINI_API_KEY_HERE
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

# Keep storage as local for dev (no S3 needed)
STORAGE_BACKEND=local

# Keep dev mode
APP_ENV=development
```

Save and close.

---

### 12.5. Step 4 — Start the full stack

```bash
# Enable BuildKit for faster builds, then start everything:
export DOCKER_BUILDKIT=1
docker compose up -d --build
```

> ⏱️ **First run takes 8–15 minutes** — Docker downloads base images and installs GDAL, PostGIS, and Next.js dependencies.
> **Subsequent starts take ~30 seconds** (everything is cached).

Watch the logs while it starts:
```bash
docker compose logs -f
# Press Ctrl+C to stop watching logs (containers keep running)
```

---

### 12.6. Step 5 — Verify everything is running

```bash
docker compose ps
```

Expected output:
```
NAME                   STATUS
satquery_nginx         running
satquery_api           running
satquery_worker        running
satquery_frontend      running
satquery_db            running (healthy)
satquery_redis         running (healthy)
satquery_minio         running (healthy)
satquery_migrate       exited (0)    ← correct — ran migrations and quit
satquery_minio_init    exited (0)    ← correct — created bucket and quit
```

Test the API:
```bash
curl http://localhost/api/v1/health
# Expected: {"status":"ok","version":"0.1.0","app_name":"SatQuery AI"}
```

Open the app in a browser:
```
http://localhost
```

---

### 12.7. Step 6 — (Optional) Seed demo data

Populate the database with sample satellite sessions and queries:
```bash
docker exec satquery_api python scripts/seed_demo.py
```

---

### 12.8. Stopping and restarting

```bash
# Stop all containers (data is preserved in Docker volumes):
docker compose down

# Start again later (no rebuild needed, very fast):
docker compose up -d

# Stop and DELETE all data (wipes the database, minio, redis):
docker compose down -v
```

---

### 12.9. What each service runs on (local)

| URL | Service |
|---|---|
| `http://localhost` | **Frontend** (Next.js) via Nginx |
| `http://localhost/api/v1/` | **Backend API** (FastAPI) via Nginx |
| `http://localhost/api/v1/health` | Health check |
| `http://localhost/docs` | FastAPI interactive docs (Swagger UI) |
| `http://localhost:9001` | **MinIO Console** (object storage UI) |
| `localhost:5432` | **PostgreSQL** (for DB tools like DBeaver/TablePlus) |
| `localhost:6379` | **Redis** |

---

### 12.10. Quick-reference cheat sheet

```bash
# ── One-time setup ────────────────────────────────────────────────────────────
git clone https://github.com/<USERNAME>/SatQuery_AI.git && cd SatQuery_AI
echo "localdevpassword"   > secrets/postgres_password.txt
python3 -c "import secrets; print(secrets.token_hex(64))" > secrets/secret_key.txt
echo "YOUR_GEMINI_KEY"    > secrets/gemini_api_key.txt
echo "PLACEHOLDER"        > secrets/openai_api_key.txt
echo "minioadmin"         > secrets/minio_root_user.txt
echo "minioadmin"         > secrets/minio_root_password.txt
cp .env.example .env
# Edit .env: set DATABASE_URL, GOOGLE_API_KEY, GEMINI_API_KEY

# ── Start ─────────────────────────────────────────────────────────────────────
export DOCKER_BUILDKIT=1
docker compose up -d --build

# ── Check status ──────────────────────────────────────────────────────────────
docker compose ps
curl http://localhost/api/v1/health

# ── View logs ─────────────────────────────────────────────────────────────────
docker compose logs -f api        # backend only
docker compose logs -f            # all services

# ── Stop ──────────────────────────────────────────────────────────────────────
docker compose down               # stop, keep data
docker compose down -v            # stop, wipe data
```

---

### 12.11. Troubleshooting (local)

| Symptom | Fix |
|---|---|
| `docker compose up` fails with `secret file not found` | Create all 6 files in `secrets/` — see Step 2 above |
| `satquery_api` exits immediately | Run `docker compose logs api` to see the error. Usually a missing env var or wrong `DATABASE_URL` |
| `satquery_migrate` exits with error | Database not ready yet — run `docker compose up -d` again; or check `docker compose logs db` |
| Port 80 already in use | Another app is using port 80. Stop it, or change the nginx port in `docker-compose.yml` to `8080:80` |
| Port 5432 already in use | A local PostgreSQL is running. Stop it: `sudo systemctl stop postgresql` (Linux) |
| `GDAL` errors during build | Make sure Docker Desktop has enough memory — set at least **4 GB** in Docker Desktop → Settings → Resources |
| Frontend shows blank page | Wait ~30s after start; Next.js needs a moment to compile on first request |
