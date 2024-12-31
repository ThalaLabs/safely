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
    echo "Setting up test environment..."
    echo -e "\n" | aptos init --network devnet --profile e2e_test --assume-yes
    TEST_ACCOUNT=$(aptos account list --profile e2e_test | grep -o '0x[a-fA-F0-9]\{64\}')
    echo "Test account: $TEST_ACCOUNT"
    echo "$TEST_ACCOUNT"
}

# Create a test multisig and return its address
create_test_multisig() {
    local owner=$1
    echo "Creating test multisig..."
    local output
    output=$(pnpm safely propose predefined create-multisig \
        --owners "$owner" \
        --threshold 1 \
        --profile e2e_test \
        --network devnet)
    
    echo "$output" | grep -o '0x[a-fA-F0-9]\{64\}'
}

# Cleanup function
cleanup() {
    rm -rf .aptos
} 