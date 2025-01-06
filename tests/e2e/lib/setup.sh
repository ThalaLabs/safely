#!/bin/bash

# Colors for output
export GREEN='\033[0;32m'
export RED='\033[0;31m'
export NC='\033[0m' # No Color

# Check dependencies
if ! command -v aptos &> /dev/null; then
    echo -e "${RED}Error: aptos CLI is not installed${NC}"
    echo -e "Please install it first: ${GREEN}https://aptos.dev/en/build/cli${NC}"
    exit 1
fi

# Setup test environment
setup_test_env() {
    echo " Setting up test environment..."  >&2
    echo -e "\n" | aptos init --network devnet --profile e2e_test --assume-yes >&2
    TEST_ACCOUNT=$(aptos account list --profile e2e_test | grep -o "\"authentication_key\": .*" | grep -Eo '0x[a-fA-F0-9]+')
    echo "$TEST_ACCOUNT"
}

# Create a test multisig and return its address
create_test_multisig() {
    local owner=$1
    echo "Creating test multisig..."  >&2
    local output

    raw=$(pnpm safely account create -o 0x1 -n 1 -p e2e_test)

    # the raw is in this format: "Create multisig ok: https://explorer.aptoslabs.com/account/0x4977b2fd2b642cdba4bd5e59bb7761452254de2474e3fde865ec61cdb2731a37?network=devnet"
    output=$(echo "$raw" | grep -o 'https://explorer.aptoslabs.com/account/0x[a-fA-F0-9]\{64\}?network=devnet' | tail -n1)
    output=$(echo "$output" | grep -o '0x[a-fA-F0-9]\{64\}')
    
    # Transfer tokens to the multisig address
    aptos move run --function-id '0x1::coin::transfer' --args "address:$output" u64:50000000 --type-args 0x1::aptos_coin::AptosCoin --profile e2e_test --assume-yes >&2
    echo "$output"
}

# Cleanup function
cleanup() {
    rm -rf .aptos
} 