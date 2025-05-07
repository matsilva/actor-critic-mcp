import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KnowledgeGraphManager } from './KnowledgeGraph';
import { ProjectManager } from './ProjectManager';
import fs from 'node:fs/promises';
import { CFG, FileOps } from '../config';
import path from 'node:path';

// Mock fs module
vi.mock('node:fs/promises', () => {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    default: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

// Mock node:fs module (used in config.ts)
vi.mock('node:fs', () => {
  return {
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({
      isSymbolicLink: vi.fn().mockReturnValue(false),
      size: 10, // Not empty
    }),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    symlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    default: {
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({
        isSymbolicLink: vi.fn().mockReturnValue(false),
        size: 10, // Not empty
      }),
      readdirSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      copyFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      symlinkSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
  };
});

describe('KnowledgeGraphManager Project Management', () => {
  let kg: KnowledgeGraphManager;
  let projectManager: ProjectManager;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock config functions
    vi.spyOn(FileOps, 'listProjectFiles').mockReturnValue(['default', 'project1', 'project2']);
    vi.spyOn(FileOps, 'createProjectFile').mockReturnValue(true);
    vi.spyOn(FileOps, 'setCurrentProjectFile').mockReturnValue(true);
    vi.spyOn(FileOps, 'getProjectFilePath').mockImplementation((projectName) => {
      return path.resolve('/test/path', `kg.${projectName}.json`);
    });

    // Mock the current project in CFG
    Object.defineProperty(CFG, 'CURRENT_PROJECT', {
      value: 'default',
      writable: true,
    });

    // Create ProjectManager instance
    projectManager = new ProjectManager();

    // Create KnowledgeGraphManager instance with ProjectManager
    kg = new KnowledgeGraphManager(projectManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Project Management', () => {
    it('should use the ProjectManager to get project information', () => {
      // Mock the current project in CFG
      Object.defineProperty(CFG, 'CURRENT_PROJECT', {
        value: 'testproject',
        writable: true,
      });

      expect(projectManager.getCurrentProject()).toBe('testproject');
      expect(projectManager.getCurrentProjectPath()).toBe('/test/path/kg.testproject.json');
      expect(kg.getCurrentProject()).toBe('testproject');
    });

    it('should switch to an existing project', async () => {
      // Mock readFile to return empty entities and relations
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ entities: {}, relations: [] }));

      // Mock getCurrentProjectPath to return the correct path
      vi.spyOn(projectManager, 'getCurrentProjectPath').mockReturnValue(
        '/test/path/kg.project1.json',
      );

      const result = await kg.switchProject('project1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully switched to project: project1');
      expect(FileOps.setCurrentProjectFile).toHaveBeenCalledWith('project1');
      expect(fs.readFile).toHaveBeenCalledWith('/test/path/kg.project1.json', 'utf8');
    });

    it('should handle errors when switching projects', async () => {
      // Mock setCurrentProjectFile to return false (switch failed)
      vi.spyOn(FileOps, 'setCurrentProjectFile').mockReturnValue(false);

      const result = await kg.switchProject('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe("Project 'nonexistent' does not exist");
    });

    it('should reject invalid project names when switching', async () => {
      const result = await kg.switchProject('invalid/project');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Project name can only contain letters, numbers, dashes, and underscores',
      );
      expect(FileOps.setCurrentProjectFile).not.toHaveBeenCalled();
    });

    it('should flush changes before switching projects', async () => {
      // Make the graph dirty
      kg['dirty'] = true;

      // Mock readFile to return empty entities and relations
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ entities: {}, relations: [] }));

      await kg.switchProject('project2');

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle read errors when switching projects', async () => {
      // Mock readFile to throw an error
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

      const result = await kg.switchProject('project1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Error switching to project: Read error');
    });
  });
});
