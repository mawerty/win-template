#!/bin/bash
echo "========================================"
echo "   Atlantis Analyst Demo"
echo "========================================"
echo ""
echo "Starting server..."
echo ""
echo "Open in browser: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop"
echo ""
cd "$(dirname "$0")"
npx serve -s . -l 8080

