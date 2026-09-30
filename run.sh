#!/bin/bash
# ==============================================================================
# AsteriaNav-3D: One-Click Mission Control Launcher
# India's First Indigenous Planetary Surface Reconstruction Engine
# ==============================================================================

echo "=========================================================="
echo "    ASTERIANAV-3D // BHARAT DEEP-SPACE INITIATIVE"
echo "    Autonomous Planetary Surface Reconstruction Engine"
echo "=========================================================="
echo ""

PORT=8080

# 1. Run core verification pass
echo "[+] Step 1: Running core reconstruction and point-cloud generation pass..."
python3 core/reconstructor.py
echo "[✓] Core assets generated in data/"
echo ""

# 2. Check port availability
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "[!] Port $PORT is already in use. Attempting to use port 8081..."
    PORT=8081
fi

# 3. Launch HTTP Server
echo "[+] Step 2: Starting Mission Control Web Dashboard on port $PORT..."
echo "[✓] Dashboard URL: http://localhost:$PORT"
echo "[*] Press Ctrl+C to terminate the mission control server."
echo ""

# Open browser if graphical environment is available
if command -v xdg-open > /dev/null; then
    xdg-open "http://localhost:$PORT" 2>/dev/null &
fi

python3 -m http.server $PORT --directory web
