#!/bin/bash
set -e

# Configure Solana CLI to connect locally (or override with env var)
: "${SOLANA_CLUSTER:=http://localhost:8899}"
solana config set --url "$SOLANA_CLUSTER"

# Paths inside container (after Docker COPY)
PROGRAM_SO="/app/streaming_payroll_solana/target/deploy/streaming_payroll_solana.so"
PROGRAM_KEYPAIR="/app/streaming_payroll_solana/wallet/program_keypair.json"
UPGRADE_AUTH="/app/streaming_payroll_solana/wallet/ProgramAuthority.json"

solana config set --keypair "$UPGRADE_AUTH"

# Start solana-test-validator with persistent ledger but silent logs
solana-test-validator \
  --ledger /app/ledger \
  --limit-ledger-size \
  --rpc-port 8899 \
  > /dev/null 2>&1 &

# Wait for RPC to be ready instead of blind sleep
echo "⏳ Waiting for Solana validator to be ready..."
until solana cluster-version >/dev/null 2>&1; do
  sleep 1
done
echo "✅ Validator is ready"

# Derive program ID
PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "Deploying program with ID: $PROGRAM_ID"

# Deploy or upgrade program (only if changed)
if solana program show "$PROGRAM_ID" >/dev/null 2>&1; then
    echo "Program already exists. Checking for changes..."
    
    # Dump deployed binary and compare
    solana program dump "$PROGRAM_ID" /tmp/deployed.so
    if cmp -s "$PROGRAM_SO" /tmp/deployed.so; then
        echo "✅ No changes in program binary. Skipping upgrade."
    else
        echo "🔄 Binary changed. Upgrading..."
        solana program upgrade "$PROGRAM_SO" \
            --program-id "$PROGRAM_ID" \
            --upgrade-authority "$UPGRADE_AUTH"
    fi
else
    echo "🚀 Program not found. Deploying new program..."
    solana program deploy "$PROGRAM_SO" \
        --program-id "$PROGRAM_KEYPAIR" \
        --upgrade-authority "$UPGRADE_AUTH"
fi

echo "✅ Program deployment check complete."

# Keep container alive (so validator keeps running)
tail -f /dev/null
