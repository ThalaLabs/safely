#!/bin/bash
set -e # Exit on error

FAILED_TESTS=0
TOTAL_TESTS=0

# Run all test files
for test_file in $(find "$(dirname "$0")/commands" -name "*.sh"); do
    echo "Running $test_file..."
    chmod +x "$test_file"
    if ! "$test_file"; then
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
done

if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}${FAILED_TESTS} out of ${TOTAL_TESTS} test files failed!${NC}"
    exit 1
else
    echo -e "${GREEN}All ${TOTAL_TESTS} test files completed successfully!${NC}"
fi