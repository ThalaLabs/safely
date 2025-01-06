#!/bin/bash
# set -e # Exit on error
set -x  # Add this to see all commands being executed

# Run all test files
for test_file in $(find "$(dirname "$0")/commands" -name "*.sh"); do
    echo "Running $test_file..."
    chmod +x "$test_file"
    "$test_file"
done

echo "All tests completed!" 