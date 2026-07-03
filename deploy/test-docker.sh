#!/bin/bash

# Test Docker build and deployment
set -e

echo "=== Testing NotifyHub Docker Deployment ==="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose is not installed"
    exit 1
fi

# Build the image
echo "Building Docker image..."
docker-compose build

# Start the service
echo "Starting service..."
docker-compose up -d

# Wait for service to be ready
echo "Waiting for service to be ready..."
sleep 10

# Check health
echo "Checking health endpoint..."
if curl -s http://localhost:3000/health | grep -q '"status":"ok"'; then
    echo "✓ Health check passed"
else
    echo "✗ Health check failed"
    docker-compose logs
    exit 1
fi

# Check if frontend is accessible
echo "Checking frontend..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo "✓ Frontend is accessible"
else
    echo "✗ Frontend is not accessible"
    docker-compose logs
    exit 1
fi

# Stop the service
echo "Stopping service..."
docker-compose down

echo "=== All tests passed ==="
