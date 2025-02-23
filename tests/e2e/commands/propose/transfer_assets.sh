#!/bin/bash

# Source common utilities
source "$(dirname "$0")/../../lib/setup.sh"
source "$(dirname "$0")/../../lib/assertions.sh"

# Setup
TEST_ACCOUNT=$(setup_test_env)
MULTISIG_ADDRESS=$(create_test_multisig "$TEST_ACCOUNT")

# Test creating a transfer_coins proposal
assert_output "Create transfer_assets proposal" \
    "pnpm safely propose predefined transfer-assets \
        -m $MULTISIG_ADDRESS \
        --asset 0x1::aptos_coin::AptosCoin \
        --recipient 0x1 \
        --amount 2 \
        --profile e2e_test" \
    "Propose ok"

# Test proposal appears in list
assert_output "Check proposal in list" \
    "sleep 10 && echo EXIT | pnpm safely proposal -m ${MULTISIG_ADDRESS} --network devnet" \
    "transfer_coins"

# Vote
assert_output "Vote on proposal" \
    "pnpm safely vote -m ${MULTISIG_ADDRESS} -s 1 -a true -p e2e_test" \
    "Vote ok"

# Execute
assert_output "Execute proposal" \
    "pnpm safely execute -m ${MULTISIG_ADDRESS} -p e2e_test" \
    "Execute ok"

# Cleanup
cleanup 