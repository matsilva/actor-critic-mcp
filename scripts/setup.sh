#!/bin/bash

# CodeLoops Quick Setup Script
# This script automates the setup process for CodeLoops,
# now with Google Gemini & pydocs support.

# Text formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
# use FE9A00 instead of BLUE
BLUE="\033[0;34m"
ORANGE="\033[0;38;5;166m"
RED="\033[0;31m"
NC="\033[0m" # No Color

# Print header
echo -e "${BOLD}${ORANGE}
 ██████╗ ██████╗ ██████╗ ███████╗██╗      ██████╗  ██████╗ ██████╗ ███████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝██║     ██╔═══██╗██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║██║  ██║█████╗  ██║     ██║   ██║██║   ██║██████╔╝███████╗
██║     ██║   ██║██║  ██║██╔══╝  ██║     ██║   ██║██║   ██║██╔═══╝ ╚════██║
╚██████╗╚██████╔╝██████╔╝███████╗███████╗╚██████╔╝╚██████╔╝██║     ███████║
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝

${NC}${BOLD}Quick Setup Script${NC}
"

echo -e "${BOLD}This script will set up CodeLoops on your system.${NC}"
echo -e "It will check for prerequisites, install dependencies, and configure the system.\n"

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Step 1: Check prerequisites
echo -e "${BOLD}${BLUE}Step 1: Checking prerequisites...${NC}"

# Check for Node.js
if command_exists node; then
  NODE_VERSION=$(node -v)
  echo -e "✅ ${GREEN}Node.js is installed:${NC} $NODE_VERSION"
  NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1 | tr -d 'v')
  if [ "$NODE_MAJOR_VERSION" -lt 18 ]; then
    echo -e "⚠️  ${YELLOW}Warning: Node.js version 18+ is recommended. You have $NODE_VERSION${NC}"
  fi
else
  echo -e "❌ ${RED}Node.js is not installed. Please install Node.js v18+ from https://nodejs.org/${NC}"
  exit 1
fi

# Check for Python
if command_exists python3; then
  PYTHON_VERSION=$(python3 --version)
  echo -e "✅ ${GREEN}Python is installed:${NC} $PYTHON_VERSION"
  PYTHON_VERSION_NUM=$(echo $PYTHON_VERSION | cut -d' ' -f2)
  PYTHON_MAJOR=$(echo $PYTHON_VERSION_NUM | cut -d. -f1)
  PYTHON_MINOR=$(echo $PYTHON_VERSION_NUM | cut -d. -f2)
  if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 11 ]); then
    echo -e "⚠️  ${YELLOW}Warning: Python 3.11+ is recommended. You have $PYTHON_VERSION_NUM${NC}"
  fi
else
  echo -e "❌ ${RED}Python 3 is not installed. Please install Python 3.11+ from https://www.python.org/${NC}"
  exit 1
fi

# Check for uv
if command_exists uv; then
  UV_VERSION=$(uv --version)
  echo -e "✅ ${GREEN}uv is installed:${NC} $UV_VERSION"
else
  echo -e "⚠️  ${YELLOW}uv is not installed. Installing uv...${NC}"
  if command_exists pip3; then
    pip3 install uv
    if [ $? -eq 0 ]; then
      echo -e "✅ ${GREEN}uv has been installed successfully.${NC}"
    else
      echo -e "❌ ${RED}Failed to install uv. Please install it manually: https://docs.astral.sh/uv/getting-started/installation${NC}"
      exit 1
    fi
  else
    echo -e "❌ ${RED}pip3 is not available. Please install uv manually: https://docs.astral.sh/uv/getting-started/installation${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}All prerequisites are satisfied!${NC}\n"

# Step 2: Install Node.js dependencies
echo -e "${BOLD}${BLUE}Step 2: Installing Node.js dependencies...${NC}"
npm install
if [ $? -eq 0 ]; then
  echo -e "✅ ${GREEN}Node.js dependencies installed successfully.${NC}\n"
else
  echo -e "❌ ${RED}Failed to install Node.js dependencies. Please check the error messages above.${NC}"
  exit 1
fi

# Install Google Gemini Node SDK
echo -e "${BOLD}${BLUE}Installing Google Gemini Node SDK…${NC}"
npm install --save @google/generative-ai
if [ $? -eq 0 ]; then
  echo -e "✅ ${GREEN}@google/generative-ai installed successfully.${NC}\n"
else
  echo -e "❌ ${RED}Failed to install @google/generative-ai. Please check npm logs.${NC}"
  exit 1
fi

# Step 3: Set up Python virtual environments
echo -e "${BOLD}${BLUE}Step 3: Setting up Python virtual environments...${NC}"

# Setup Critic Agent
echo -e "${BOLD}Setting up Critic Agent...${NC}"
cd agents/critic
uv sync
if [ $? -eq 0 ]; then
  echo -e "✅ ${GREEN}Critic Agent dependencies installed successfully.${NC}"

  # Install Google Gemini Python client & pydocs
  echo -e "${BOLD}${BLUE}Installing Google Gemini Python client and pydocs…${NC}"
  uv pip install --upgrade google-generativeai pydocs
  if [ $? -eq 0 ]; then
    echo -e "✅ ${GREEN}google-generativeai and pydocs installed in Critic venv.${NC}"
  else
    echo -e "❌ ${RED}Failed to install google-generativeai or pydocs in Critic venv.${NC}"
    exit 1
  fi

  # Copy template files if they don't exist
  if [ ! -f fastagent.config.yaml ]; then
    cp fastagent.config.template.yaml fastagent.config.yaml
    echo -e "✅ ${GREEN}Created fastagent.config.yaml${NC}"
  fi
  if [ ! -f fastagent.secrets.yaml ]; then
    cp fastagent.secrets.template.yaml fastagent.secrets.yaml
    echo -e "✅ ${GREEN}Created fastagent.secrets.yaml${NC}"
    CRITIC_SECRETS_CREATED=true
  fi
else
  echo -e "❌ ${RED}Failed to set up Critic Agent. Please check the error messages above.${NC}"
  exit 1
fi

# Setup Summarize Agent
echo -e "\n${BOLD}Setting up Summarize Agent...${NC}"
cd ../summarize
uv sync
if [ $? -eq 0 ]; then
  echo -e "✅ ${GREEN}Summarize Agent dependencies installed successfully.${NC}"

  # Install Google Gemini Python client & pydocs
  echo -e "${BOLD}${BLUE}Installing Google Gemini Python client and pydocs…${NC}"
  uv pip install --upgrade google-generativeai pydocs
  if [ $? -eq 0 ]; then
    echo -e "✅ ${GREEN}google-generativeai and pydocs installed in Summarize venv.${NC}"
  else
    echo -e "❌ ${RED}Failed to install google-generativeai or pydocs in Summarize venv.${NC}"
    exit 1
  fi

  # Copy template files if they don't exist
  if [ ! -f fastagent.config.yaml ]; then
    cp fastagent.config.template.yaml fastagent.config.yaml
    echo -e "✅ ${GREEN}Created fastagent.config.yaml${NC}"
  fi
  if [ ! -f fastagent.secrets.yaml ]; then
    cp fastagent.secrets.template.yaml fastagent.secrets.yaml
    echo -e "✅ ${GREEN}Created fastagent.secrets.yaml${NC}"
    SUMMARIZE_SECRETS_CREATED=true
  fi
else
  echo -e "❌ ${RED}Failed to set up Summarize Agent. Please check the error messages above.${NC}"
  exit 1
fi

# Return to project root
cd ../..
echo -e "${GREEN}Python virtual environments set up successfully!${NC}\n"

# Step 4: Configure API keys
echo -e "${BOLD}${BLUE}Step 4: Configuring API keys...${NC}"
if [ "$CRITIC_SECRETS_CREATED" = true ] || [ "$SUMMARIZE_SECRETS_CREATED" = true ]; then
  echo -e "${YELLOW}You need to configure your API keys in the following files:${NC}"
  if [ "$CRITIC_SECRETS_CREATED" = true ]; then
    echo -e "  - ${BOLD}agents/critic/fastagent.secrets.yaml${NC}"
  fi
  if [ "$SUMMARIZE_SECRETS_CREATED" = true ]; then
    echo -e "  - ${BOLD}agents/summarize/fastagent.secrets.yaml${NC}"
  fi
  echo -e "\n${BOLD}Example configuration:${NC}"
  echo -e "  anthropic:"
  echo -e "    api_key: your-api-key-here"
  echo -e "  # OR"
  echo -e "  openai:"
  echo -e "    api_key: your-api-key-here"
  echo -e "\n${YELLOW}Please edit these files before starting the server.${NC}"
else
  echo -e "${GREEN}API key configuration files already exist.${NC}"
  echo -e "${YELLOW}If you need to update your API keys, edit the following files:${NC}"
  echo -e "  - ${BOLD}agents/critic/fastagent.secrets.yaml${NC}"
  echo -e "  - ${BOLD}agents/summarize/fastagent.secrets.yaml${NC}"
fi

echo -e "\n${GREEN}Setup completed successfully!${NC}\n"

# Step 5: Provide instructions for starting the server
echo -e "${BOLD}${BLUE}Step 5: Starting CodeLoops...${NC}"
echo -e "${BOLD}To start the CodeLoops server, run:${NC}"
echo -e "  ${BOLD}npx -y tsx src${NC}"
echo -e "\n${BOLD}Once started, you can use CodeLoops with your AI coding agent by:${NC}"
echo -e "1. Configuring your agent to use the MCP server"
echo -e "2. Using prompts like: ${BOLD}\"Use the CodeLoops tool to plan and implement...\"${NC}"
echo -e "${YELLOW}Server not started. You can start it later with:${NC} ${BOLD}npx -y tsx src${NC}"
