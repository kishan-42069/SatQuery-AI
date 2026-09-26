#!/usr/bin/env bash
# =============================================================================
# SatQuery AI — Oracle VM First-Time Setup Script
# Run this ONCE on your fresh Oracle Cloud Ubuntu VM.
#
# Usage:
#   chmod +x scripts/vm_setup.sh
#   ./scripts/vm_setup.sh
#
# What this does:
#   1. Updates system packages
#   2. Installs Docker Engine + Docker Compose v2 plugin
#   3. Adds the ubuntu user to the docker group
#   4. Enables Docker to start on boot
#   5. Configures UFW firewall rules (ports 22, 80, 443)
#   6. Opens ports in Oracle's iptables (required on OCI Ubuntu images)
#   7. Persists iptables rules across reboots
#   8. Clones the repo (if not already present)
#   9. Prompts you to create .env.prod
#  10. Creates a systemd service so the app auto-starts on VM reboot
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }
info() { echo -e "        $*"; }

echo ""
echo "========================================================"
echo "  SatQuery AI — Oracle VM First-Time Setup"
echo "========================================================"
echo ""

# ── Config — edit these before running if your setup differs ─────────────────
REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/SatQuery_AI.git}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/SatQuery_AI}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-deploy}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

# ── Step 1: System update ─────────────────────────────────────────────────────
echo "Step 1/10  Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y --no-install-recommends
sudo apt-get install -y --no-install-recommends \
    curl git ca-certificates gnupg lsb-release iptables-persistent netfilter-persistent
ok "System updated."

# ── Step 2: Install Docker Engine ────────────────────────────────────────────
echo ""
echo "Step 2/10  Installing Docker Engine..."
if command -v docker &>/dev/null; then
    ok "Docker already installed: $(docker --version)"
else
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sudo sh /tmp/get-docker.sh
    rm /tmp/get-docker.sh
    ok "Docker installed: $(docker --version)"
fi

# ── Step 3: Docker group membership ──────────────────────────────────────────
echo ""
echo "Step 3/10  Adding user to docker group..."
sudo usermod -aG docker ubuntu
ok "User 'ubuntu' added to docker group."
warn "You must log out and back in (or run 'newgrp docker') for this to take effect."
warn "All remaining steps use 'sudo docker' to avoid this requirement during setup."

# ── Step 4: Enable Docker on boot ────────────────────────────────────────────
echo ""
echo "Step 4/10  Enabling Docker service on boot..."
sudo systemctl enable docker
sudo systemctl start docker
ok "Docker service enabled and running."

# ── Step 5: UFW firewall (if active) ─────────────────────────────────────────
echo ""
echo "Step 5/10  Configuring UFW firewall rules..."
if sudo ufw status | grep -q "Status: active"; then
    sudo ufw allow 22/tcp   comment "SSH"
    sudo ufw allow 80/tcp   comment "HTTP (SatQuery)"
    sudo ufw allow 443/tcp  comment "HTTPS (SatQuery)"
    ok "UFW rules added for ports 22, 80, 443."
else
    warn "UFW is not active — skipping UFW configuration."
    info "If you use UFW later, run: sudo ufw allow 22/tcp 80/tcp 443/tcp"
fi

# ── Step 6: iptables rules (required on Oracle Cloud Ubuntu images) ───────────
echo ""
echo "Step 6/10  Opening ports in iptables (required for Oracle Cloud)..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
ok "Ports 80 and 443 opened in iptables."

# ── Step 7: Persist iptables across reboots ───────────────────────────────────
echo ""
echo "Step 7/10  Persisting iptables rules..."
sudo netfilter-persistent save
ok "iptables rules saved."

# ── Step 8: Clone the repository ─────────────────────────────────────────────
echo ""
echo "Step 8/10  Cloning repository..."
if [ -d "$DEPLOY_DIR/.git" ]; then
    ok "Repository already exists at $DEPLOY_DIR — skipping clone."
    cd "$DEPLOY_DIR"
    git fetch origin "$DEPLOY_BRANCH"
    git reset --hard "origin/$DEPLOY_BRANCH"
    ok "Updated to latest commit on branch '$DEPLOY_BRANCH': $(git log -1 --oneline)"
else
    if [ "$REPO_URL" = "https://github.com/YOUR_USERNAME/SatQuery_AI.git" ]; then
        fail "REPO_URL is not set. Edit this script and set REPO_URL before running, or pass it as an env var:\n  REPO_URL=https://github.com/your-user/SatQuery_AI.git ./scripts/vm_setup.sh"
    fi
    git clone --branch "$DEPLOY_BRANCH" "$REPO_URL" "$DEPLOY_DIR"
    ok "Repository cloned to $DEPLOY_DIR."
    cd "$DEPLOY_DIR"
fi

# ── Step 9: Create .env.prod ──────────────────────────────────────────────────
echo ""
echo "Step 9/10  Configuring .env.prod..."
if [ -f "$DEPLOY_DIR/$ENV_FILE" ]; then
    ok ".env.prod already exists — skipping creation."
else
    warn ".env.prod does not exist. Creating from .env.prod template..."
    cp "$DEPLOY_DIR/.env.prod" "$DEPLOY_DIR/.env.prod.bak" 2>/dev/null || true
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/$ENV_FILE" 2>/dev/null \
        || cp "$DEPLOY_DIR/.env.prod" "$DEPLOY_DIR/$ENV_FILE"

    # Generate a secure SECRET_KEY
    GENERATED_KEY=$(python3 -c "import secrets; print(secrets.token_hex(64))")

    echo ""
    echo "  ┌──────────────────────────────────────────────────────────────────┐"
    echo "  │  ACTION REQUIRED — edit $DEPLOY_DIR/$ENV_FILE  │"
    echo "  │                                                                  │"
    echo "  │  1. Set POSTGRES_PASSWORD to a strong password                   │"
    echo "  │  2. Set DATABASE_URL to match that password                      │"
    echo "  │  3. Set SECRET_KEY to the generated value below                  │"
    echo "  │  4. Set GOOGLE_API_KEY / GEMINI_API_KEY to your Gemini API key   │"
    echo "  │  5. Set ALLOWED_ORIGINS to http://<YOUR_VM_PUBLIC_IP>            │"
    echo "  │  6. Set NEXT_PUBLIC_API_URL to http://<YOUR_VM_PUBLIC_IP>/api/v1 │"
    echo "  │  7. Set NEXT_PUBLIC_WS_URL to ws://<YOUR_VM_PUBLIC_IP>/api/v1   │"
    echo "  └──────────────────────────────────────────────────────────────────┘"
    echo ""
    echo "  Generated SECRET_KEY (copy this into .env.prod):"
    echo "  $GENERATED_KEY"
    echo ""
    echo "  Opening nano to edit .env.prod now..."
    sleep 2
    nano "$DEPLOY_DIR/$ENV_FILE"
fi

# ── Step 10: Create systemd service for auto-start on VM reboot ───────────────
echo ""
echo "Step 10/10 Creating systemd service for auto-start on reboot..."

sudo tee /etc/systemd/system/satquery.service > /dev/null << EOF
[Unit]
Description=SatQuery AI Docker Compose Stack
Documentation=https://github.com/YOUR_USERNAME/SatQuery_AI
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DEPLOY_DIR
Environment=DOCKER_BUILDKIT=1
ExecStart=/usr/bin/docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
ExecStop=/usr/bin/docker compose -f $COMPOSE_FILE down
TimeoutStartSec=300
TimeoutStopSec=60
User=ubuntu
Group=docker

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable satquery.service
ok "satquery.service created and enabled on boot."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "========================================================"
echo "  Setup complete!"
echo ""
echo "  NEXT STEPS:"
echo ""
echo "  1. Make sure .env.prod is fully filled out:"
echo "     nano $DEPLOY_DIR/$ENV_FILE"
echo ""
echo "  2. Add your SSH public key as a Deploy Key in GitHub"
echo "     (or use a personal access token for git clone)."
echo ""
echo "  3. Do the initial build and launch:"
echo "     cd $DEPLOY_DIR"
echo "     DOCKER_BUILDKIT=1 docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --build"
echo ""
echo "  4. Check all services are running:"
echo "     docker compose -f $COMPOSE_FILE ps"
echo ""
echo "  5. Verify the app is live:"
echo "     curl http://localhost/api/v1/health"
echo ""
echo "  After that, every 'git push' to the 'deploy' branch"
echo "  will automatically redeploy via GitHub Actions."
echo "========================================================"
