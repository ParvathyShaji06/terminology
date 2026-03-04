#!/bin/bash
# 🚀 Terminology Dashboard: All-in-One Installer for Linux/macOS
echo "🔧 Setting up your terminology project from scratch..."

# 1. Check for Python & Pip
if ! command -v python3 &> /dev/null; then
    echo "📥 Installing Python3..."
    sudo apt update && sudo apt install -y python3 python3-pip
else
    echo "✅ Python3 already installed"
fi

# 2. Check for Node.js (v18+)
if ! command -v node &> /dev/null; then
    echo "📥 Installing Node.js (this may take a minute)..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "✅ Node.js already installed"
fi

# 3. Install Python Libraries
echo "📦 Installing Python libraries..."
pip3 install -r requirements.txt

# 4. Install Dashboard Libraries
echo "📦 Installing Dashboard libraries..."
cd dashboard
npm install

echo "🎉 DONE! Everything is installed."
echo "🚀 To start, run: cd dashboard && npm run dev"
