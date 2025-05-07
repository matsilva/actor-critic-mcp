import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KnowledgeGraphManager, DagNode, ArtifactRef } from './KnowledgeGraph';
import { ProjectManager } from './ProjectManager';
import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';

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

describe('KnowledgeGraphManager', () => {
  const testFilePath = '/test/path/kg.json';
  let kg: KnowledgeGraphManager;
  let projectManager: ProjectManager;

  // Helper function to create a test node
  function createTestNode(
    role: 'actor' | 'critic' | 'summary' = 'actor',
    parents: string[] = [],
  ): DagNode {
    return {
      id: uuid(),
      thought: `Test thought ${uuid().slice(0, 8)}`,
      role,
      parents,
      children: [],
      createdAt: new Date().toISOString(),
      tags: ['test'],
    };
  }

  // Helper function to create a test artifact
  function createTestArtifact(): ArtifactRef {
    return {
      id: uuid(),
      name: `Test artifact ${uuid().slice(0, 8)}`,
    };
  }

  // Mock ProjectManager class
  class MockProjectManager {
    getCurrentProject = vi.fn().mockReturnValue('default');
    getCurrentProjectPath = vi.fn().mockReturnValue(testFilePath);
    getProjectPath = vi.fn().mockReturnValue(testFilePath);
    listProjects = vi.fn().mockReturnValue(['default']);
    validateProjectName = vi.fn();
    switchProject = vi.fn();
    createProject = vi.fn();
  }

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();

    // Mock readFile to return empty JSON by default
    vi.mocked(fs.readFile).mockResolvedValue('{}');

    // Create a new MockProjectManager instance
    projectManager = new MockProjectManager();

    // Create a new KnowledgeGraphManager instance with MockProjectManager
    kg = new KnowledgeGraphManager(projectManager as unknown as ProjectManager);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initialization and Persistence', () => {
    it('should initialize with empty entities and relations when file is empty', async () => {
      await kg.init();

      expect(fs.readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(kg['entities']).toEqual({});
      expect(kg['relations']).toEqual([]);
    });

    it('should load entities and relations from file during initialization', async () => {
      const testData = {
        entities: {
          'test-id': createTestNode(),
        },
        relations: [{ from: 'test-id', to: 'other-id', type: 'test' }],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(testData));

      await kg.init();

      expect(kg['entities']).toEqual(testData.entities);
      expect(kg['relations']).toEqual(testData.relations);
    });

    it('should not write to file if not dirty', async () => {
      await kg.flush();

      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should write to file when flushing if dirty', async () => {
      const node = createTestNode();
      kg.createEntity(node);

      await kg.flush();

      expect(fs.writeFile).toHaveBeenCalledWith(
        testFilePath,
        JSON.stringify({ entities: { [node.id]: node }, relations: [] }),
        'utf8',
      );

      // Should reset dirty flag
      await kg.flush();
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('Entity and Relation Management', () => {
    it('should create and retrieve entities', async () => {
      const node = createTestNode();
      kg.createEntity(node);

      expect(kg.getNode(node.id)).toEqual(node);
      expect(kg['dirty']).toBe(true);
    });

    it('should create relations', async () => {
      const node1 = createTestNode();
      const node2 = createTestNode();

      kg.createEntity(node1);
      kg.createEntity(node2);
      kg.createRelation(node1.id, node2.id, 'test-relation');

      expect(kg['relations']).toContainEqual({
        from: node1.id,
        to: node2.id,
        type: 'test-relation',
      });
      expect(kg['dirty']).toBe(true);
    });

    it('should get children by relation type', async () => {
      const parent = createTestNode();
      const child1 = createTestNode();
      const child2 = createTestNode();
      const otherChild = createTestNode();

      kg.createEntity(parent);
      kg.createEntity(child1);
      kg.createEntity(child2);
      kg.createEntity(otherChild);

      kg.createRelation(parent.id, child1.id, 'test-relation');
      kg.createRelation(parent.id, child2.id, 'test-relation');
      kg.createRelation(parent.id, otherChild.id, 'other-relation');

      const children = kg.getChildren(parent.id, 'test-relation');

      expect(children).toHaveLength(2);
      expect(children).toContainEqual(child1);
      expect(children).toContainEqual(child2);
      expect(children).not.toContainEqual(otherChild);
    });
  });

  describe('Graph Traversal', () => {
    it('should identify head nodes (nodes with no outgoing relations)', async () => {
      const node1 = createTestNode();
      const node2 = createTestNode();
      const node3 = createTestNode();

      kg.createEntity(node1);
      kg.createEntity(node2);
      kg.createEntity(node3);

      // In KnowledgeGraph.ts, getHeads() returns nodes that don't have outgoing relations
      // Create a relation from node1 to node2
      kg.createRelation(node1.id, node2.id, 'test-relation');

      const heads = kg.getHeads();

      // Based on the implementation in KnowledgeGraph.ts:
      // getHeads() returns nodes that don't have outgoing relations
      // So node2 and node3 should be in the heads, but not node1
      expect(heads).toHaveLength(2);

      // Get the IDs for easier comparison
      const headIds = heads.map((h) => h.id);

      // node1 has an outgoing relation, so it should not be in the heads
      expect(headIds).not.toContain(node1.id);

      // node2 and node3 don't have outgoing relations, so they should be in the heads
      expect(headIds).toContain(node2.id);
      expect(headIds).toContain(node3.id);
    });

    it('should calculate depth correctly', async () => {
      const root = createTestNode();
      const level1 = createTestNode('actor', [root.id]);
      const level2 = createTestNode('actor', [level1.id]);
      const level3 = createTestNode('actor', [level2.id]);

      kg.createEntity(root);
      kg.createEntity(level1);
      kg.createEntity(level2);
      kg.createEntity(level3);

      // Create the parent-child relationships
      kg.createRelation(level1.id, root.id, 'parent');
      kg.createRelation(level2.id, level1.id, 'parent');
      kg.createRelation(level3.id, level2.id, 'parent');

      // Test depth calculation
      expect(kg['depth'](root.id)).toBe(0);
      expect(kg['depth'](level1.id)).toBe(1);
      expect(kg['depth'](level2.id)).toBe(2);
      expect(kg['depth'](level3.id)).toBe(3);
    });

    it('should return all DAG nodes', async () => {
      const node1 = createTestNode();
      const node2 = createTestNode();
      const artifact = createTestArtifact();

      kg.createEntity(node1);
      kg.createEntity(node2);
      kg.createEntity(artifact);

      const allNodes = kg.allDagNodes();

      expect(allNodes).toHaveLength(2);
      expect(allNodes).toContainEqual(node1);
      expect(allNodes).toContainEqual(node2);
      // Should not include artifacts
      expect(allNodes).not.toContainEqual(artifact);
    });
  });

  describe('Branch Operations', () => {
    it('should list branches with correct information', async () => {
      const node1 = createTestNode();
      node1.branchLabel = 'branch-1';
      const node2 = createTestNode();
      node2.branchLabel = 'branch-2';

      kg.createEntity(node1);
      kg.createEntity(node2);

      // Create a child for node1 to test depth calculation
      const child = createTestNode('actor', [node1.id]);
      kg.createEntity(child);
      kg.createRelation(child.id, node1.id, 'parent');

      // Update label index
      kg.labelIndex.set('branch-1', node1.id);
      kg.labelIndex.set('branch-2', node2.id);

      const branches = kg.listBranches();

      expect(branches).toHaveLength(2);

      const branch1 = branches.find((b) => b.branchId === node1.id);
      expect(branch1).toBeDefined();
      expect(branch1?.label).toBe('branch-1');
      expect(branch1?.head).toEqual(node1);
      expect(branch1?.depth).toBe(0);

      const branch2 = branches.find((b) => b.branchId === node2.id);
      expect(branch2).toBeDefined();
      expect(branch2?.label).toBe('branch-2');
      expect(branch2?.head).toEqual(node2);
      expect(branch2?.depth).toBe(0);
    });

    it('should resume a branch by ID', async () => {
      const root = createTestNode();
      const level1 = createTestNode('actor', [root.id]);
      const level2 = createTestNode('actor', [level1.id]);

      kg.createEntity(root);
      kg.createEntity(level1);
      kg.createEntity(level2);

      // Create the parent-child relationships
      kg.createRelation(level1.id, root.id, 'parent');
      kg.createRelation(level2.id, level1.id, 'parent');

      const resumeText = kg.resume(level2.id);

      // Should include all nodes in the branch, from oldest to newest
      const expectedText = [root.thought, level1.thought, level2.thought].join('\n');
      expect(resumeText).toBe(expectedText);
    });

    it('should resume a branch by label', async () => {
      const node = createTestNode();
      node.branchLabel = 'test-branch';

      kg.createEntity(node);
      kg.labelIndex.set('test-branch', node.id);

      const resumeText = kg.resume('test-branch');

      expect(resumeText).toBe(node.thought);
    });

    it('should throw an error when resuming a non-existent branch', async () => {
      expect(() => kg.resume('non-existent')).toThrow('branch not found');
    });
  });

  describe('Export Operations', () => {
    it('should export all nodes when no filter is provided', async () => {
      const node1 = createTestNode();
      const node2 = createTestNode();

      kg.createEntity(node1);
      kg.createEntity(node2);

      const exported = kg.exportPlan() as any[];

      expect(exported).toHaveLength(2);
      expect(exported[0].id).toBe(node1.id);
      expect(exported[1].id).toBe(node2.id);
    });

    it('should filter nodes by tag when exporting', async () => {
      const node1 = createTestNode();
      node1.tags = ['tag1', 'common'];

      const node2 = createTestNode();
      node2.tags = ['tag2', 'common'];

      kg.createEntity(node1);
      kg.createEntity(node2);

      const exportedTag1 = kg.exportPlan('tag1') as any[];
      expect(exportedTag1).toHaveLength(1);
      expect(exportedTag1[0].id).toBe(node1.id);

      const exportedCommon = kg.exportPlan('common') as any[];
      expect(exportedCommon).toHaveLength(2);
    });

    it('should include only specified fields in exported nodes', async () => {
      const node = createTestNode();
      node.branchLabel = 'test-branch';
      node.verdict = 'approved';
      node.artifacts = [createTestArtifact()];

      kg.createEntity(node);

      const exported = kg.exportPlan() as any[];
      const exportedNode = exported[0];

      expect(exportedNode.id).toBe(node.id);
      expect(exportedNode.thought).toBe(node.thought);
      expect(exportedNode.tags).toEqual(node.tags);
      expect(exportedNode.branchLabel).toBe(node.branchLabel);
      expect(exportedNode.verdict).toBe(node.verdict);
      expect(exportedNode.parents).toEqual(node.parents);

      // Should include simplified artifacts
      expect(exportedNode.artifacts).toHaveLength(1);
      expect(exportedNode.artifacts[0].name).toBe(node.artifacts![0].name);
      expect(exportedNode.artifacts[0].uri).toBe(node.artifacts![0].uri);

      // Should not include other fields
      expect(exportedNode.role).toBeUndefined();
      expect(exportedNode.children).toBeUndefined();
      expect(exportedNode.createdAt).toBeUndefined();
    });
  });
});
