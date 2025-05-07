import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectManager } from './ProjectManager';
import { CFG, FileOps } from '../config';

// Mock config module
vi.mock('../config.ts', () => {
  return {
    CFG: {
      CURRENT_PROJECT: 'default',
      getProjectMemoryFilePath: vi.fn((projectName) => `/test/path/kg.${projectName}.json`),
      listProjects: vi.fn(() => ['default', 'project1', 'project2']),
      createProject: vi.fn(() => true),
      switchProject: vi.fn(() => true),
    },
    FileOps: {
      getProjectFilePath: vi.fn((projectName) => `/test/path/kg.${projectName}.json`),
      listProjectFiles: vi.fn(() => ['default', 'project1', 'project2']),
      createProjectFile: vi.fn(() => true),
      setCurrentProjectFile: vi.fn(() => true),
    },
  };
});

describe('ProjectManager', () => {
  let projectManager: ProjectManager;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create ProjectManager instance
    projectManager = new ProjectManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Project Management', () => {
    it('should get the current project name', () => {
      expect(projectManager.getCurrentProject()).toBe('default');
    });

    it('should get the current project path', () => {
      expect(projectManager.getCurrentProjectPath()).toBe('/test/path/kg.default.json');
      expect(FileOps.getProjectFilePath).toHaveBeenCalledWith('default');
    });

    it('should get a specific project path', () => {
      expect(projectManager.getProjectPath('project1')).toBe('/test/path/kg.project1.json');
      expect(FileOps.getProjectFilePath).toHaveBeenCalledWith('project1');
    });

    it('should list available projects', () => {
      const projects = projectManager.listProjects();
      expect(projects).toEqual(['default', 'project1', 'project2']);
      expect(FileOps.listProjectFiles).toHaveBeenCalled();
    });

    it('should validate project names correctly', () => {
      // Valid project names
      expect(projectManager.validateProjectName('valid-project')).toEqual({ valid: true });
      expect(projectManager.validateProjectName('valid_project')).toEqual({ valid: true });
      expect(projectManager.validateProjectName('validProject123')).toEqual({ valid: true });

      // Invalid project names
      expect(projectManager.validateProjectName('')).toEqual({
        valid: false,
        error: 'Project name cannot be empty',
      });
      expect(projectManager.validateProjectName('invalid/project')).toEqual({
        valid: false,
        error: 'Project name can only contain letters, numbers, dashes, and underscores',
      });
      expect(projectManager.validateProjectName('invalid project')).toEqual({
        valid: false,
        error: 'Project name can only contain letters, numbers, dashes, and underscores',
      });
      expect(projectManager.validateProjectName('a'.repeat(51))).toEqual({
        valid: false,
        error: 'Project name is too long (max 50 characters)',
      });
    });

    it('should create a new project', async () => {
      const result = await projectManager.createProject('newproject');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully created project: newproject');
      expect(FileOps.createProjectFile).toHaveBeenCalledWith('newproject');
    });

    it('should handle errors when creating a project', async () => {
      // Mock createProjectFile to return false (project already exists)
      vi.spyOn(FileOps, 'createProjectFile').mockReturnValue(false);

      const result = await projectManager.createProject('project1');

      expect(result.success).toBe(false);
      expect(result.message).toBe("Project 'project1' already exists");
    });

    it('should reject invalid project names when creating', async () => {
      const result = await projectManager.createProject('invalid/project');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Project name can only contain letters, numbers, dashes, and underscores',
      );
      expect(FileOps.createProjectFile).not.toHaveBeenCalled();
    });

    it('should switch to an existing project', async () => {
      const result = await projectManager.switchProject('project1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully switched to project: project1');
      expect(FileOps.setCurrentProjectFile).toHaveBeenCalledWith('project1');
    });

    it('should handle errors when switching projects', async () => {
      // Mock setCurrentProjectFile to return false (switch failed)
      vi.spyOn(FileOps, 'setCurrentProjectFile').mockReturnValue(false);

      const result = await projectManager.switchProject('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe("Project 'nonexistent' does not exist");
    });

    it('should reject invalid project names when switching', async () => {
      const result = await projectManager.switchProject('invalid/project');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Project name can only contain letters, numbers, dashes, and underscores',
      );
      expect(FileOps.setCurrentProjectFile).not.toHaveBeenCalled();
    });

    it('should handle non-existent projects when switching', async () => {
      // Mock listProjectFiles to return only default project
      vi.spyOn(FileOps, 'listProjectFiles').mockReturnValue(['default']);

      const result = await projectManager.switchProject('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe("Project 'nonexistent' does not exist");
      expect(FileOps.setCurrentProjectFile).not.toHaveBeenCalled();
    });
  });
});
