#!/bin/bash
# Cannect AppView Deployment Script

set -e

echo "=== Cannect AppView Deployment ==="

# Configuration
INSTALL_DIR="/opt/cannect-appview"
SERVICE_NAME="cannect-appview"

# Create directory
echo "Creating installation directory..."
mkdir -p $INSTALL_DIR

# Copy files (assuming script is run from scripts/appview directory)
echo "Copying files..."
cp -r src package.json tsconfig.json $INSTALL_DIR/

# Create .env from example if not exists
if [ ! -f "$INSTALL_DIR/.env" ]; then
    cat > $INSTALL_DIR/.env << 'EOF'
APPVIEW_PORT=4000
APPVIEW_HOSTNAME=appview.cannect.space
APPVIEW_DB_PATH=/opt/cannect-appview/appview.db
CANNECT_PDS=https://cannect.space
EOF
    echo "Created .env file"
fi

# Install dependencies
echo "Installing dependencies..."
cd $INSTALL_DIR
npm install

# Build TypeScript
echo "Building..."
npm run build

# Create systemd service
echo "Creating systemd service..."
cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Cannect AppView
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

# Reload and start service
echo "Starting service..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo "=== Deployment Complete ==="
echo "Check status: systemctl status $SERVICE_NAME"
echo "View logs: journalctl -u $SERVICE_NAME -f"
echo ""
echo "AppView running at: http://localhost:4000"
echo "Health check: curl http://localhost:4000/xrpc/_health"
