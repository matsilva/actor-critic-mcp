import { CFG, FileOps } from '../config.ts';
import path from 'node:path';

/**
 * ProjectManager handles project-related operations for the knowledge graph system.
 * It manages project creation, switching, and validation.
 */
export class ProjectManager {
  // Track current project at the instance level instead of using global state
  private instanceCurrentProject: string;

  /**
   * Creates a new ProjectManager instance.
   * Initializes with the default project from config, but maintains its own state
   * to prevent global state from persisting across different editor instances.
   */
  constructor() {
    // Initialize with the global default, but will maintain separate instance state
    this.instanceCurrentProject = CFG.CURRENT_PROJECT;
    console.log(`[ProjectManager] Initialized with current project: ${this.getCurrentProject()}`);
  }

  /**
   * Get the name of the current active project for this instance
   * @returns The current project name for this instance
   */
  getCurrentProject(): string {
    return this.instanceCurrentProject;
  }

  /**
   * Get the file path for the current project
   * @returns The file path for the current project
   */
  getCurrentProjectPath(): string {
    return FileOps.getProjectFilePath(this.getCurrentProject());
  }

  /**
   * Get the file path for a specific project
   * @param projectName The name of the project
   * @returns The file path for the specified project
   */
  getProjectPath(projectName: string): string {
    return FileOps.getProjectFilePath(projectName);
  }

  /**
   * List all available knowledge graph projects
   * @returns Array of project names
   */
  listProjects(): string[] {
    return FileOps.listProjectFiles();
  }

  /**
   * Validate a project name for format and security constraints
   * @param projectName The project name to validate
   * @returns Object with validation result and optional error message
   */
  validateProjectName(projectName: string): { valid: boolean; error?: string } {
    // Check for empty string
    if (!projectName || projectName.trim() === '') {
      return { valid: false, error: 'Project name cannot be empty' };
    }

    // Check for valid characters (alphanumeric, dash, underscore)
    const validNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validNameRegex.test(projectName)) {
      return {
        valid: false,
        error: 'Project name can only contain letters, numbers, dashes, and underscores',
      };
    }

    // Check for reasonable length
    if (projectName.length > 50) {
      return { valid: false, error: 'Project name is too long (max 50 characters)' };
    }

    return { valid: true };
  }

  /**
   * Extracts the project name from a project context path
   * The project name is the last segment of the path that meets validation criteria
   *
   * @param projectContext The full path to the project directory
   * @returns The extracted project name or null if invalid
   */
  getProjectNameFromContext(projectContext: string): string | null {
    if (!projectContext || typeof projectContext !== 'string' || projectContext.trim() === '') {
      console.log(`[ProjectManager] Invalid project context: ${projectContext}`);
      return null;
    }

    // Normalize path and extract the basename
    const normalizedPath = path.normalize(projectContext);
    const lastSegment = path.basename(normalizedPath);

    // Clean and validate project name
    const cleanedProjectName = lastSegment.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);

    const validation = this.validateProjectName(cleanedProjectName);
    if (!validation.valid) {
      console.log(
        `[ProjectManager] Invalid project name: ${cleanedProjectName}, error: ${validation.error}`,
      );
      return null;
    }

    return cleanedProjectName;
  }

  /**
   * Switch to a different knowledge graph project
   * @param projectName Name of the project to switch to
   * @returns Object with success status and message
   */
  async switchProject(projectName: string): Promise<{ success: boolean; message: string }> {
    try {
      // Validate project name
      const validation = this.validateProjectName(projectName);
      if (!validation.valid) {
        return { success: false, message: validation.error || 'Invalid project name' };
      }

      // Check if project exists
      const projects = this.listProjects();
      if (!projects.includes(projectName) && projectName !== 'default') {
        return { success: false, message: `Project '${projectName}' does not exist` };
      }

      // Update the global project configuration (for backward compatibility)
      const success = FileOps.setCurrentProjectFile(projectName);
      if (!success) {
        return { success: false, message: `Failed to switch to project: ${projectName}` };
      }
      
      // Update the instance-level current project
      this.instanceCurrentProject = projectName;

      console.log(`[ProjectManager] Successfully switched to project: ${projectName}`);
      return { success: true, message: `Successfully switched to project: ${projectName}` };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ProjectManager] Error switching to project ${projectName}:`, errorMessage);
      return { success: false, message: `Error switching to project: ${errorMessage}` };
    }
  }

  /**
   * Create a new knowledge graph project
   * @param projectName Name of the new project to create
   * @returns Object with success status and message
   */
  async createProject(projectName: string): Promise<{ success: boolean; message: string }> {
    try {
      // Validate project name
      const validation = this.validateProjectName(projectName);
      if (!validation.valid) {
        return { success: false, message: validation.error || 'Invalid project name' };
      }

      // Check if project already exists
      const projects = this.listProjects();
      if (projects.includes(projectName)) {
        return { success: false, message: `Project '${projectName}' already exists` };
      }

      // Create the new project
      const success = FileOps.createProjectFile(projectName);
      if (!success) {
        return { success: false, message: `Failed to create project: ${projectName}` };
      }

      console.log(`[ProjectManager] Successfully created project: ${projectName}`);
      return { success: true, message: `Successfully created project: ${projectName}` };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ProjectManager] Error creating project ${projectName}:`, errorMessage);
      return { success: false, message: `Error creating project: ${errorMessage}` };
    }
  }

  /**
 * Switches to the project specified in the project context if needed
 * If no project context is provided or the project doesn't exist, stays with the current project
 * 
 * IMPORTANT: This method ALWAYS forces a switch when projectContext is provided and valid,
 * even if it appears to be the same as the current project. This ensures that each editor
 * session gets its own proper project context and doesn't rely on the global state.
 * 
 * @param projectContext The full path to the project directory
 * @returns Promise resolving to true if project was switched, false if no switch was needed
 */
async switchProjectIfNeeded(projectContext?: string): Promise<boolean> {
  try {
    if (!projectContext) {
      console.log(`[ProjectManager] No project context provided, staying with current project: ${this.getCurrentProject()}`);
      return false;
    }
    
    // Extract project name from context
    const projectName = this.getProjectNameFromContext(projectContext);
    
    // If extraction failed, stay with current project
    if (!projectName) {
      console.log(`[ProjectManager] Could not extract valid project name from context: ${projectContext}, staying with current project: ${this.getCurrentProject()}`);
      return false;
    }
    
    // IMPORTANT: We always force a switch when a valid projectContext is provided
    // This ensures each editor session gets its own proper context and doesn't rely on global state
    // We do this even if projectName === currentProject to ensure the file path is correctly set
    
    // Check if the project exists, create it if not
    const projects = this.listProjects();
    if (!projects.includes(projectName)) {
      console.log(`[ProjectManager] Project from context doesn't exist, creating: ${projectName}`);
      // Project doesn't exist, create it
      const createResult = await this.createProject(projectName);
      if (!createResult.success) {
        console.log(`[ProjectManager] Failed to create project from context: ${projectName}, error: ${createResult.message}`);
        return false;
      }
    }
    
    // Always switch to the project when context is provided
    console.log(`[ProjectManager] Enforcing switch to project from context: ${projectName}`);
    const result = await this.switchProject(projectName);
    if (result.success) {
      console.log(`[ProjectManager] Successfully switched to project: ${projectName}`);
      return true;
    } else {
      console.log(`[ProjectManager] Failed to switch to project: ${projectName}, error: ${result.message}`);
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`[ProjectManager] Error in switchProjectIfNeeded: ${errorMessage}`);
    return false;
  }
}
}
