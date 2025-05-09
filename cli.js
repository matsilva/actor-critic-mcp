#!/usr/bin/env node

/**
 * CodeLoops CLI
 * 
 * A simple command-line interface for managing the CodeLoops server.
 */

import { execa } from 'execa';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  orange: '\x1b[38;5;166m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

// Create readline interface for user input
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Store the server process
let serverProcess = null;

/**
 * Print the CodeLoops banner
 */
function printBanner() {
  console.log(`${colors.orange}${colors.bright}
 ██████╗ ██████╗ ██████╗ ███████╗██╗      ██████╗  ██████╗ ██████╗ ███████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝██║     ██╔═══██╗██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║██║  ██║█████╗  ██║     ██║   ██║██║   ██║██████╔╝███████╗
██║     ██║   ██║██║  ██║██╔══╝  ██║     ██║   ██║██║   ██║██╔═══╝ ╚════██║
╚██████╗╚██████╔╝██████╔╝███████╗███████╗╚██████╔╝╚██████╔╝██║     ███████║
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝
${colors.reset}${colors.bright}CLI v0.1.0${colors.reset}
`);
}

/**
 * Print the main menu
 */
function printMenu() {
  console.log(`\n${colors.bright}CodeLoops CLI${colors.reset}\n`);
  console.log(`${colors.bright}1.${colors.reset} Start server`);
  console.log(`${colors.bright}2.${colors.reset} Stop server`);
  console.log(`${colors.bright}3.${colors.reset} Check server status`);
  console.log(`${colors.bright}4.${colors.reset} Run setup`);
  console.log(`${colors.bright}5.${colors.reset} Exit\n`);
}

/**
 * Start the CodeLoops server
 */
async function startServer() {
  if (serverProcess) {
    console.log(`${colors.yellow}Server is already running!${colors.reset}`);
    return;
  }

  console.log(`${colors.green}Starting CodeLoops server...${colors.reset}`);

  try {
    // Start the server as a detached process
    serverProcess = execa('npx', ['-y', 'tsx', 'src'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    });

    // Handle server output
    serverProcess.stdout.on('data', (data) => {
      console.log(`${colors.dim}[Server] ${data}${colors.reset}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`${colors.red}[Server Error] ${data}${colors.reset}`);
    });

    // Handle server exit
    serverProcess.on('exit', (code) => {
      console.log(`${colors.yellow}Server exited with code ${code}${colors.reset}`);
      serverProcess = null;
    });

    console.log(`${colors.green}Server started successfully!${colors.reset}`);
    console.log(`${colors.dim}Use your AI coding agent to interact with CodeLoops.${colors.reset}`);
    console.log(`${colors.dim}Example prompt: "Use the CodeLoops tool to plan and implement..."${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Failed to start server: ${error.message}${colors.reset}`);
  }
}

/**
 * Stop the CodeLoops server
 */
function stopServer() {
  if (!serverProcess) {
    console.log(`${colors.yellow}No server is currently running!${colors.reset}`);
    return;
  }

  console.log(`${colors.yellow}Stopping CodeLoops server...${colors.reset}`);

  try {
    // Kill the server process
    process.kill(-serverProcess.pid);
    serverProcess = null;
    console.log(`${colors.green}Server stopped successfully!${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Failed to stop server: ${error.message}${colors.reset}`);
  }
}

/**
 * Check the status of the CodeLoops server
 */
function checkServerStatus() {
  if (serverProcess) {
    console.log(`${colors.green}Server is running with PID ${serverProcess.pid}${colors.reset}`);
  } else {
    console.log(`${colors.yellow}Server is not running${colors.reset}`);
  }
}

/**
 * Run the setup script
 */
async function runSetup() {
  console.log(`${colors.green}Running CodeLoops setup...${colors.reset}`);

  try {
    const setupPath = join(__dirname, 'scripts', 'setup.sh');

    // Check if setup script exists
    if (!fs.existsSync(setupPath)) {
      console.error(`${colors.red}Setup script not found at ${setupPath}${colors.reset}`);
      return;
    }

    // Make sure the script is executable
    await execa('chmod', ['+x', setupPath]);

    // Run the setup script
    const setup = execa('bash', [setupPath], {
      stdio: 'inherit'
    });

    await setup;
    console.log(`${colors.green}Setup completed!${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Setup failed: ${error.message}${colors.reset}`);
  }
}

/**
 * Handle user input from the menu
 */
function handleMenuChoice(choice) {
  switch (choice) {
    case '1':
      startServer();
      break;
    case '2':
      stopServer();
      break;
    case '3':
      checkServerStatus();
      break;
    case '4':
      runSetup();
      break;
    case '5':
      console.log(`${colors.green}Exiting CodeLoops CLI. Goodbye!${colors.reset}`);
      if (serverProcess) {
        stopServer();
      }
      rl.close();
      process.exit(0);
      break;
    default:
      console.log(`${colors.red}Invalid choice. Please try again.${colors.reset}`);
  }

  // Show the menu again after processing the choice
  setTimeout(() => {
    printMenu();
    promptUser();
  }, 500);
}

/**
 * Prompt the user for input
 */
function promptUser() {
  rl.question(`${colors.bright}Enter your choice (1-5):${colors.reset} `, (answer) => {
    handleMenuChoice(answer.trim());
  });
}

/**
 * Handle command line arguments
 */
function handleArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // No arguments, show interactive menu
    printBanner();
    printMenu();
    promptUser();
    return;
  }

  // Handle command line arguments
  switch (args[0]) {
    case 'start':
      startServer();
      break;
    case 'stop':
      stopServer();
      break;
    case 'status':
      checkServerStatus();
      break;
    case 'setup':
      runSetup();
      break;
    default:
      console.log(`${colors.red}Unknown command: ${args[0]}${colors.reset}`);
      console.log(`${colors.yellow}Available commands: start, stop, status, setup${colors.reset}`);
      process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Received SIGINT. Shutting down...${colors.reset}`);
  if (serverProcess) {
    stopServer();
  }
  rl.close();
  process.exit(0);
});

// Start the CLI
handleArgs();
