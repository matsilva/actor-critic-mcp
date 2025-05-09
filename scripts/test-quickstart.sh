#!/bin/bash

# CodeLoops Quickstart Test Script
# This script tests the setup script and CLI functionality

# Text formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
ORANGE="\033[0;38;5;166m"
RED="\033[0;31m"
NC="\033[0m" # No Color

# Test results counter
TESTS_PASSED=0
TESTS_FAILED=0

# Print header
echo -e "${BOLD}${ORANGE}
 ██████╗ ██████╗ ██████╗ ███████╗██╗      ██████╗  ██████╗ ██████╗ ███████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝██║     ██╔═══██╗██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║██║  ██║█████╗  ██║     ██║   ██║██║   ██║██████╔╝███████╗
██║     ██║   ██║██║  ██║██╔══╝  ██║     ██║   ██║██║   ██║██╔═══╝ ╚════██║
╚██████╗╚██████╔╝██████╔╝███████╗███████╗╚██████╔╝╚██████╔╝██║     ███████║
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝
${NC}${BOLD}Quickstart Test Script${NC}
"

echo -e "${BOLD}This script will test the CodeLoops quickstart functionality.${NC}"
echo -e "It will verify the setup script and CLI functionality.\n"

# Function to run a test and report results
run_test() {
  local test_name="$1"
  local test_command="$2"
  local expected_pattern="$3"
  
  echo -e "\n${BOLD}${BLUE}Testing: ${test_name}${NC}"
  echo -e "${YELLOW}Command: ${test_command}${NC}"
  
  # Run the command and capture output
  output=$(eval "$test_command" 2>&1)
  exit_code=$?
  
  # Check if the output matches the expected pattern
  if echo "$output" | grep -q "$expected_pattern"; then
    echo -e "${GREEN}✅ PASSED: Output contains expected pattern${NC}"
    echo -e "${YELLOW}Expected pattern: ${expected_pattern}${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}❌ FAILED: Output does not contain expected pattern${NC}"
    echo -e "${YELLOW}Expected pattern: ${expected_pattern}${NC}"
    echo -e "${YELLOW}Actual output:${NC}"
    echo "$output" | head -n 10
    if [ $(echo "$output" | wc -l) -gt 10 ]; then
      echo -e "${YELLOW}... (output truncated)${NC}"
    fi
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  
  # Check exit code
  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✅ PASSED: Command exited with code 0${NC}"
  else
    echo -e "${RED}❌ FAILED: Command exited with code ${exit_code}${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# Function to check if a file exists and has executable permissions
check_executable() {
  local file_path="$1"
  
  echo -e "\n${BOLD}${BLUE}Checking: ${file_path}${NC}"
  
  if [ -f "$file_path" ]; then
    echo -e "${GREEN}✅ PASSED: File exists${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}❌ FAILED: File does not exist${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
  
  if [ -x "$file_path" ]; then
    echo -e "${GREEN}✅ PASSED: File is executable${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}❌ FAILED: File is not executable${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
  
  return 0
}

# Navigate to project root
cd "$(dirname "$0")/.." || exit 1

echo -e "${BOLD}${BLUE}Current directory: $(pwd)${NC}\n"

# Test 1: Check if setup.sh exists and is executable
check_executable "scripts/setup.sh"

# Test 2: Test setup script prerequisites check
run_test "Setup script prerequisites check" \
         "bash scripts/setup.sh | head -n 20" \
         "Checking prerequisites"

# Test 3: Test package.json scripts
run_test "Package.json scripts" \
         "grep -A 10 '\"scripts\"' package.json" \
         "\"setup\": \"bash scripts/setup.sh\""

# Test 4: Test QUICKSTART.md content
run_test "QUICKSTART.md content" \
         "grep -A 5 'Get Started in Seconds' QUICKSTART.md" \
         "CodeLoops enhances AI coding agents"

# Print test summary
echo -e "\n${BOLD}${BLUE}Test Summary${NC}"
echo -e "${GREEN}Tests passed: ${TESTS_PASSED}${NC}"
echo -e "${RED}Tests failed: ${TESTS_FAILED}${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}${BOLD}All tests passed! The quickstart implementation is working correctly.${NC}"
  exit 0
else
  echo -e "\n${RED}${BOLD}Some tests failed. Please fix the issues before finalizing the implementation.${NC}"
  exit 1
fi
