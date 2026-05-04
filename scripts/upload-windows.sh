#!/bin/bash

# This script uploads the latest Windows installer to the VM and starts an RDP session.
# Usage: ./scripts/upload-windows.sh

# --- Configuration ---
VM_HOST="localhost"
VM_USER="Docker"
VM_PASS="admin"
VM_RDP_PORT="3389"
SHARED_FOLDER="/home/armaldio/Documents/vms/shared"

# --- Build Step ---
echo "🏗️  Building dependencies..."
pnpm turbo build --filter=@pipelab/app

echo "📦 Creating Windows installer..."
pnpm --filter=@pipelab/app make --platform win32 --arch x64

# --- Find the latest installer ---
# Squirrel installer is typically in apps/desktop/out/make/squirrel.windows/x64/
INSTALLER_DIR="apps/desktop/out/make/squirrel.windows/x64/"
INSTALLER=$(find "$INSTALLER_DIR" -name "*.exe" | head -n 1)

if [ -z "$INSTALLER" ]; then
    echo "❌ Error: No Windows installer found in $INSTALLER_DIR"
    echo "Please run 'pnpm --filter @pipelab/app make' first to generate the installer."
    exit 1
fi

echo "🚀 Found installer: $INSTALLER"

# --- Copy to Shared Folder ---
if [ ! -d "$SHARED_FOLDER" ]; then
    echo "❌ Error: Shared folder not found at $SHARED_FOLDER"
    exit 1
fi

echo "📤 Copying to shared folder: $SHARED_FOLDER"
cp "$INSTALLER" "$SHARED_FOLDER/"

if [ $? -eq 0 ]; then
    echo "✅ Copy successful!"
else
    echo "❌ Copy failed!"
    exit 1
fi
