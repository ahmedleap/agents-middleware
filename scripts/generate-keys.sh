#!/bin/bash

# Script to generate RSA key pair for JWT signing
# Usage: ./scripts/generate-keys.sh

set -e

echo "🔑 Generating RSA key pair for JWT..."

# Generate 4096-bit RSA private key
echo "Generating private key..."
openssl genrsa -out private_key.pem 4096

# Extract public key from private key
echo "Extracting public key..."
openssl rsa -in private_key.pem -pubout -out public_key.pem

echo ""
echo "✅ Keys generated successfully!"
echo "   Private key: private_key.pem (DO NOT COMMIT TO GIT)"
echo "   Public key:  public_key.pem"
echo ""
echo "📝 To use these keys in .env, base64 encode them:"
echo ""
echo "   Private key (base64):"
echo "   $(cat private_key.pem | base64 -w 0)"
echo ""
echo "   Public key (base64):"
echo "   $(cat public_key.pem | base64 -w 0)"
echo ""
echo "Then add these to your .env file:"
echo "   JWT_PRIVATE_KEY=<base64_private_key>"
echo "   JWT_PUBLIC_KEY=<base64_public_key>"
