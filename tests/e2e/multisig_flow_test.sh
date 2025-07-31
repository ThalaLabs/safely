#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Test configuration
NETWORK="devnet"
DUST_AMOUNT="1000000" # 0.01 APT (1 million octas)
SAFELY_CMD="node dist/index.js"
TEST_DIR=$(mktemp -d)

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Function to extract address from account creation output
extract_address() {
    echo "$1" | grep -oE '0x[a-fA-F0-9]{64}' | head -1
}

# Function to get account balance
get_balance() {
    local address=$1
    local profile=$2
    local balance_output=$(aptos account balance --account "$address" --profile "$profile" 2>&1)
    # Extract balance value from JSON
    if echo "$balance_output" | grep -q '"balance"'; then
        echo "$balance_output" | grep -oE '"balance": [0-9]+' | grep -oE '[0-9]+'
    else
        echo "0"
    fi
}

# Function to wait for transaction
wait_for_transaction() {
    local tx_hash=$1
    local profile=$2
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if aptos transaction show --transaction-hash "$tx_hash" --profile "$profile" 2>/dev/null | grep -q "Success"; then
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    
    return 1
}

# Clean up function
cleanup() {
    # Clean up temporary directory
    if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
        rm -rf "$TEST_DIR"
    fi
    
    # Clean up Aptos profiles
    print_info "Cleaning up test profiles..."
    aptos config delete-profile --profile test_account_a 2>/dev/null || true
    aptos config delete-profile --profile test_account_b 2>/dev/null || true
    aptos config delete-profile --profile test_account_c 2>/dev/null || true
}

# Set up trap to ensure cleanup
trap cleanup EXIT

echo "========================================="
echo "Multisig Flow E2E Test"
echo "========================================="

# Create a test directory for our config
export APTOS_CONFIG_DIR="$TEST_DIR/.aptos"
mkdir -p "$APTOS_CONFIG_DIR"

# Step 1: Create three devnet accounts
print_info "Creating Account A (first owner)..."
ACCOUNT_A_KEY="$TEST_DIR/account_a.key"
aptos key generate --key-type ed25519 --output-file "$ACCOUNT_A_KEY" --assume-yes >/dev/null 2>&1
ACCOUNT_A_OUTPUT=$(aptos init --network "$NETWORK" --private-key-file "$ACCOUNT_A_KEY" --profile test_account_a --assume-yes 2>&1)
ACCOUNT_A=$(extract_address "$ACCOUNT_A_OUTPUT")
print_success "Account A created: $ACCOUNT_A"

print_info "Creating Account B (second owner)..."
ACCOUNT_B_KEY="$TEST_DIR/account_b.key"
aptos key generate --key-type ed25519 --output-file "$ACCOUNT_B_KEY" --assume-yes >/dev/null 2>&1
ACCOUNT_B_OUTPUT=$(aptos init --network "$NETWORK" --private-key-file "$ACCOUNT_B_KEY" --profile test_account_b --assume-yes 2>&1)
ACCOUNT_B=$(extract_address "$ACCOUNT_B_OUTPUT")
print_success "Account B created: $ACCOUNT_B"

print_info "Creating Account C (recipient)..."
ACCOUNT_C_KEY="$TEST_DIR/account_c.key"
aptos key generate --key-type ed25519 --output-file "$ACCOUNT_C_KEY" --assume-yes >/dev/null 2>&1
ACCOUNT_C_OUTPUT=$(aptos init --network "$NETWORK" --private-key-file "$ACCOUNT_C_KEY" --profile test_account_c --assume-yes 2>&1)
ACCOUNT_C=$(extract_address "$ACCOUNT_C_OUTPUT")
print_success "Account C created: $ACCOUNT_C"

# Wait a bit for the accounts to be funded
print_info "Waiting for accounts to be funded..."
sleep 5

# Get initial balance of Account C
INITIAL_BALANCE_C=$(get_balance "$ACCOUNT_C" "test_account_c")
print_info "Account C initial balance: $INITIAL_BALANCE_C octas"

# Step 2: Create a 2/2 multisig wallet with Account A and B as owners
print_info "Creating 2/2 multisig wallet with Account A and B as owners (both signatures required)..."

# Create multisig with Account B as additional owner and require 2 signatures
MULTISIG_OUTPUT=$($SAFELY_CMD account create \
    --network "aptos-$NETWORK" \
    --additional-owners "$ACCOUNT_B" \
    --num-signatures-required 2 \
    --profile test_account_a 2>&1)

# Extract multisig address
MULTISIG_ADDRESS=$(echo "$MULTISIG_OUTPUT" | grep -oE 'Create multisig ok: 0x[a-fA-F0-9]+' | cut -d' ' -f4)
if [ -z "$MULTISIG_ADDRESS" ]; then
    print_error "Failed to create multisig wallet"
    echo "$MULTISIG_OUTPUT"
    exit 1
fi
print_success "Multisig wallet created: $MULTISIG_ADDRESS"

# Fund the multisig wallet
print_info "Funding multisig wallet..."
aptos account fund-with-faucet \
    --account "$MULTISIG_ADDRESS" \
    --profile test_account_a \
    --amount 10000000 >/dev/null 2>&1 || true
sleep 3

# Verify multisig has funds
MULTISIG_BALANCE=$(get_balance "$MULTISIG_ADDRESS" "test_account_a")
print_info "Multisig wallet balance: $MULTISIG_BALANCE octas"

if [ "$MULTISIG_BALANCE" -eq "0" ]; then
    print_error "Failed to fund multisig wallet"
    exit 1
fi

# Step 3: Propose a transaction to transfer dust APT to Account C
print_info "Proposing transfer of $DUST_AMOUNT octas to Account C..."
PROPOSE_OUTPUT=$($SAFELY_CMD propose \
    --network "aptos-$NETWORK" \
    --multisig-address "$MULTISIG_ADDRESS" \
    --profile test_account_a \
    predefined transfer-assets \
    --asset "0x1::aptos_coin::AptosCoin" \
    --recipient "$ACCOUNT_C" \
    --amount "$DUST_AMOUNT" 2>&1)

# Check if proposal was created
if echo "$PROPOSE_OUTPUT" | grep -q "Propose ok"; then
    print_success "Proposal created (sequence number: 1)"
    PROPOSAL_ID=1
else
    print_error "Failed to create proposal"
    echo "$PROPOSE_OUTPUT"
    exit 1
fi

# Step 4: Account A approves the proposal
print_info "Account A approving proposal (1/2 signatures)..."
APPROVE_OUTPUT=$($SAFELY_CMD vote \
    --network "aptos-$NETWORK" \
    --multisig-address "$MULTISIG_ADDRESS" \
    --sequence-number "$PROPOSAL_ID" \
    --approve true \
    --profile test_account_a 2>&1)

if echo "$APPROVE_OUTPUT" | grep -q "Vote ok"; then
    print_success "Vote from Account A submitted"
else
    print_error "Failed to approve proposal with Account A"
    echo "$APPROVE_OUTPUT"
    exit 1
fi

# Wait a bit
sleep 3

# Step 5: Account B approves the proposal (this should trigger execution)
print_info "Account B approving proposal (2/2 signatures - should auto-execute)..."
APPROVE_B_OUTPUT=$($SAFELY_CMD vote \
    --network "aptos-$NETWORK" \
    --multisig-address "$MULTISIG_ADDRESS" \
    --sequence-number "$PROPOSAL_ID" \
    --approve true \
    --profile test_account_b 2>&1)

if echo "$APPROVE_B_OUTPUT" | grep -q "Vote ok"; then
    print_success "Vote from Account B submitted"
    VOTE_B_TX_URL=$(echo "$APPROVE_B_OUTPUT" | grep -oE 'https://[^[:space:]]+')
    print_info "Vote B transaction: $VOTE_B_TX_URL"
else
    print_error "Failed to approve proposal with Account B"
    echo "$APPROVE_B_OUTPUT"
    exit 1
fi

# Step 6: Execute the approved proposal
print_info "Executing the approved proposal..."
EXECUTE_OUTPUT=$($SAFELY_CMD execute \
    --network "aptos-$NETWORK" \
    --multisig-address "$MULTISIG_ADDRESS" \
    --profile test_account_a 2>&1)

if echo "$EXECUTE_OUTPUT" | grep -q "Execute ok"; then
    print_success "Proposal executed successfully"
    EXECUTE_TX_URL=$(echo "$EXECUTE_OUTPUT" | grep -oE 'https://[^[:space:]]+')
    print_info "Execute transaction: $EXECUTE_TX_URL"
else
    print_error "Failed to execute proposal"
    echo "$EXECUTE_OUTPUT"
fi

# Step 7: Wait and verify transfer
print_info "Waiting for transfer to complete..."
sleep 5

# Get final balance
FINAL_BALANCE_C=$(get_balance "$ACCOUNT_C" "test_account_c")
EXPECTED_BALANCE=$((INITIAL_BALANCE_C + DUST_AMOUNT))

print_info "Account C initial balance: $INITIAL_BALANCE_C octas"
print_info "Account C final balance: $FINAL_BALANCE_C octas"
print_info "Expected balance: $EXPECTED_BALANCE octas"

# Also check multisig balance to see if funds were deducted
MULTISIG_FINAL_BALANCE=$(get_balance "$MULTISIG_ADDRESS" "test_account_a")
print_info "Multisig initial balance: $MULTISIG_BALANCE octas"
print_info "Multisig final balance: $MULTISIG_FINAL_BALANCE octas"

if [ "$FINAL_BALANCE_C" -eq "$EXPECTED_BALANCE" ]; then
    print_success "Transfer verified! Account C received $DUST_AMOUNT octas"
    
    # Verify multisig balance decreased
    if [ "$MULTISIG_FINAL_BALANCE" -lt "$MULTISIG_BALANCE" ]; then
        DEDUCTED=$((MULTISIG_BALANCE - MULTISIG_FINAL_BALANCE))
        print_success "Multisig balance decreased by $DEDUCTED octas (transfer + gas)"
    fi
    
    echo
    echo "========================================="
    echo -e "${GREEN}Test passed successfully!${NC}"
    echo "========================================="
    echo
    echo "Summary:"
    echo "- Created 2/2 multisig with accounts A and B as owners"
    echo "- Proposed transfer of $DUST_AMOUNT octas to account C"
    echo "- Account A approved the proposal"
    echo "- Account B approved the proposal"
    echo "- Execute command was run to execute the transfer"
    echo "- Account C received the $DUST_AMOUNT octas"
    exit 0
else
    print_error "Transfer verification failed!"
    print_error "Expected: $EXPECTED_BALANCE octas, Got: $FINAL_BALANCE_C octas"
    
    # Additional debugging
    if [ "$MULTISIG_FINAL_BALANCE" -lt "$MULTISIG_BALANCE" ]; then
        print_info "Note: Multisig balance decreased from $MULTISIG_BALANCE to $MULTISIG_FINAL_BALANCE"
        print_info "This suggests a transaction was executed, but perhaps with different parameters"
    fi
    
    # Try to check if there's still a pending proposal
    print_info "Checking for any pending proposals..."
    $SAFELY_CMD proposal \
        --network "aptos-$NETWORK" \
        --multisig-address "$MULTISIG_ADDRESS" \
        --filter pending \
        --profile test_account_a 2>&1 || true
    
    echo
    echo "========================================="
    echo -e "${RED}Test failed!${NC}"
    echo "========================================="
    exit 1
fi