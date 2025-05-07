import { CFG, FileOps } from '../config.ts';

/**
 * ProjectManager handles project-related operations for the knowledge graph system.
 * It manages project creation, switching, and validation.
 */
export class ProjectManager {
  /**
   * Creates a new ProjectManager instance.
   */
  constructor() {
    console.log(`[ProjectManager] Initialized with current project: ${this.getCurrentProject()}`);
  }

  /**
   * Get the name of the current active project
   * @returns The current project name
   */
  getCurrentProject(): string {
    return CFG.CURRENT_PROJECT;
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

      // Switch to the new project in the configuration
      const success = FileOps.setCurrentProjectFile(projectName);
      if (!success) {
        return { success: false, message: `Failed to switch to project: ${projectName}` };
      }

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
}
