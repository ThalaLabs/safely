#!/bin/bash

# Function to run test and check output
assert_output() {
    local test_name=$1
    local command=$2
    local expected_output=$3
    
    echo "Running test: $test_name"
    local output
    output=$(eval "$command")
    
    if echo "$output" | grep -q "$expected_output"; then
        echo -e "${GREEN}✓ Test passed: $test_name${NC}"
        return 0
    else
        echo -e "${RED}✗ Test failed: $test_name${NC}"
        echo "Expected output to contain: $expected_output"
        echo "Actual output: $output"
        exit 1
    fi
} 