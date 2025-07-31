#!/bin/bash
set -e # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from project root directory${NC}"
    exit 1
fi

# Build the project first
echo "Building project..."
pnpm build

# Run the multisig flow test
echo "Running multisig flow test..."
chmod +x "tests/e2e/multisig_flow_test.sh"

if "tests/e2e/multisig_flow_test.sh"; then
    echo -e "${GREEN}All tests completed successfully!${NC}"
    exit 0
else
    echo -e "${RED}Test failed!${NC}"
    exit 1
fi