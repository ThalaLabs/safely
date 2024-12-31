#!/bin/bash

# Source common utilities
source "$(dirname "$0")/../../lib/setup.sh"
source "$(dirname "$0")/../../lib/assertions.sh"

# Setup
TEST_ACCOUNT=$(setup_test_env)
MULTISIG_ADDRESS=$(create_test_multisig "$TEST_ACCOUNT")

echo "Testing transfer_coins proposal..."

# Test creating a transfer_coins proposal
assert_output "Create transfer_coins proposal" \
    "pnpm safely propose predefined transfer-coins \
        -m $MULTISIG_ADDRESS \
        --coin-type '0x1::aptos_coin::AptosCoin' \
        --recipient '0x123' \
        --amount '1000' \
        --profile e2e_test \
        --network devnet" \
    "Created proposal"

# Test proposal appears in list
assert_output "Check proposal in list" \
    "pnpm safely proposal -m $MULTISIG_ADDRESS --network devnet" \
    "transfer_coins"

# Cleanup
cleanup 