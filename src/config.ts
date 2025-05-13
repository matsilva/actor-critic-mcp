import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Path Configuration ----------------------------------------------------------
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', 'data');
const projectConfigPath = path.resolve(dataDir, 'currentProject.json');
const legacyMemoryFilePath = path.resolve(dataDir, 'kg.json');

// Initialize data directory if it doesn't exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// -----------------------------------------------------------------------------
// Project Configuration -------------------------------------------------------
// -----------------------------------------------------------------------------

// IMPORTANT NOTE: This global currentProject setting is only used as a default/fallback value.
// Each ProjectManager instance maintains its own project state to prevent issues with
// multiple editor instances. The global state should NOT be relied upon directly.
// Instead, always use ProjectManager.getCurrentProject() to get the current project.

// Initialize or load current project configuration (used only as a default)
let currentProject = 'default';
try {
  if (fs.existsSync(projectConfigPath)) {
    const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'));
    currentProject = projectConfig.currentProject || 'default';
  } else {
    fs.writeFileSync(projectConfigPath, JSON.stringify({ currentProject }, null, 2), 'utf8');
  }
} catch (err) {
  console.error('Error loading project configuration, using default:', err);
}

// -----------------------------------------------------------------------------
// File Operations -------------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Get the file path for a specific project
 * @param projectName The name of the project
 * @returns The file path for the specified project
 */
function getProjectFilePath(projectName: string): string {
  return path.resolve(dataDir, `kg.${projectName}.json`);
}

/**
 * List all available project files
 * @returns Array of project names extracted from file names
 */
function listProjectFiles(): string[] {
  try {
    const files = fs.readdirSync(dataDir);
    return files
      .filter((file) => file.startsWith('kg.') && file.endsWith('.json') && file !== 'kg.json')
      .map((file) => file.replace(/^kg\./, '').replace(/\.json$/, ''));
  } catch (err) {
    console.error('Error listing project files:', err);
    return [];
  }
}

/**
 * Create a new project file
 * @param projectName Name of the new project to create
 * @returns True if the project file was created successfully, false otherwise
 */
function createProjectFile(projectName: string): boolean {
  try {
    const projectPath = getProjectFilePath(projectName);

    // Check if project already exists
    if (fs.existsSync(projectPath)) {
      return false; // Project already exists
    }

    // Create the project file
    fs.writeFileSync(projectPath, '{}', 'utf8');

    return true;
  } catch (err) {
    console.error('Error creating project file:', err);
    return false;
  }
}

/**
 * Set the current project in the configuration file
 * @param projectName Name of the project to set as current
 * @returns True if the project was set as current successfully, false otherwise
 */
function setCurrentProjectFile(projectName: string): boolean {
  try {
    const projectPath = getProjectFilePath(projectName);

    // Create the project file if it doesn't exist
    if (!fs.existsSync(projectPath)) {
      fs.writeFileSync(projectPath, '{}', 'utf8');
    }

    // Update the current project configuration
    fs.writeFileSync(
      projectConfigPath,
      JSON.stringify({ currentProject: projectName }, null, 2),
      'utf8',
    );

    return true;
  } catch (err) {
    console.error('Error setting current project file:', err);
    return false;
  }
}

/**
 * File operations for managing project files
 */
export const FileOps = {
  /**
   * Get the file path for a specific project
   * @param projectName The name of the project
   * @returns The file path for the specified project
   */
  getProjectFilePath,

  /**
   * List all available project files
   * @returns Array of project names extracted from file names
   */
  listProjectFiles,

  /**
   * Create a new project file
   * @param projectName Name of the new project to create
   * @returns True if the project file was created successfully, false otherwise
   */
  createProjectFile,

  /**
   * Set the current project in the configuration file
   * @param projectName Name of the project to set as current
   * @returns True if the project was set as current successfully, false otherwise
   */
  setCurrentProjectFile,
};

// Get the current project's memory file path
const currentMemoryFilePath = getProjectFilePath(currentProject);

// Initialize the current project's memory file if it doesn't exist
if (!fs.existsSync(currentMemoryFilePath)) {
  fs.writeFileSync(currentMemoryFilePath, '{}', 'utf8');
}

// Handle migration from legacy kg.json to project-based structure
if (fs.existsSync(legacyMemoryFilePath)) {
  try {
    const stats = fs.statSync(legacyMemoryFilePath);
    if (!stats.isSymbolicLink() && stats.size > 2) {
      // Size > 2 means it's not just '{}'
      // If this is the first time setting up projects, and we have existing data in kg.json,
      // move it to the default project file
      const defaultProjectPath = getProjectFilePath('default');
      if (
        !fs.existsSync(defaultProjectPath) ||
        fs.readFileSync(defaultProjectPath, 'utf8') === '{}'
      ) {
        fs.copyFileSync(legacyMemoryFilePath, defaultProjectPath);
      }
    }
  } catch (err) {
    console.error('Error handling legacy file migration:', err);
  }
}

// -----------------------------------------------------------------------------
// Configuration Constants -----------------------------------------------------
// -----------------------------------------------------------------------------

export const CFG = {
  // Application settings
  WINDOW: Number(process.env.WINDOW ?? 20),
  CRITIC_EVERY_N_STEPS: Number(process.env.critic_every_n_steps ?? 3),
  MAX_REVISION_CYCLES: Number(process.env.max_revision_cycles ?? 2),

  // Project settings
  MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH ?? currentMemoryFilePath,
  CURRENT_PROJECT: currentProject,
  PROJECT_CONFIG_PATH: projectConfigPath,

  // For backward compatibility
  getProjectMemoryFilePath: getProjectFilePath,
  listProjects: listProjectFiles,
  switchProject: setCurrentProjectFile,
  createProject: createProjectFile,

  // File operations
  FileOps,
};
