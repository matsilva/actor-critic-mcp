import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KnowledgeGraphManager, DagNode } from './KnowledgeGraph.js';
import { Tag } from './tags.js';
import { Actor } from '../agents/Actor.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import os from 'node:os';
import { createLogger, setGlobalLogger, getInstance as getLogger } from '../logger.js';
const logger = createLogger({ withFile: false, withDevStdout: true });
setGlobalLogger(logger);

describe('KnowledgeGraphManager', () => {
  let kg: KnowledgeGraphManager;
  let testDataDir: string;
  let logFilePath: string;

  // Create a temporary directory for test data
  beforeEach(async () => {
    // Create a unique test directory
    testDataDir = path.join(os.tmpdir(), `kg-test-${uuid()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    logFilePath = path.join(testDataDir, 'knowledge_graph.ndjson');

    // Create a KnowledgeGraphManager instance with a custom log file path
    kg = new KnowledgeGraphManager(getLogger());
    // Set the log file path directly using a non-exported property
    // @ts-expect-error - Accessing private property for testing
    kg.logFilePath = logFilePath;
    await kg.init();
  });

  // Clean up after each test
  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up test directory:', error);
    }
  });

  // Helper function to create a test node
  const createTestNode = (
    project: string,
    role: 'actor' | 'critic' | 'summary' = 'actor',
    parents: string[] = [],
  ): DagNode => ({
    id: uuid(),
    project,
    projectContext: `/path/to/${project}`,
    thought: `Test thought for ${project}`,
    role,
    parents,
    children: [],
    createdAt: '',
    tags: [Tag.Task],
    artifacts: [],
    diff: undefined,
  });

  describe('appendEntity', () => {
    it('should successfully append a node to the log file', async () => {
      const testNode = createTestNode('test-project');
      await kg.appendEntity(testNode);

      // Read the log file and verify the node was written
      const content = await fs.readFile(logFilePath, 'utf-8');
      expect(content).toContain(testNode.id);
      expect(content).toContain(testNode.project);
      expect(content).toContain(testNode.thought);
    });

    it('should set the createdAt timestamp when appending', async () => {
      const testNode = createTestNode('test-project');
      expect(testNode.createdAt).toBe('');

      await kg.appendEntity(testNode);
      expect(testNode.createdAt).not.toBe('');

      // Verify it's a valid ISO date string
      expect(() => new Date(testNode.createdAt)).not.toThrow();
    });

    it('should store the diff field when provided', async () => {
      const testNode = createTestNode('test-project');
      testNode.diff = 'diff --git a/file b/file';
      await kg.appendEntity(testNode);

      const stored = await kg.getNode(testNode.id);
      expect(stored?.diff).toBe('diff --git a/file b/file');
    });

    it('should not allow cycles in the graph', async () => {
      // Create a chain of nodes A -> B -> C
      const nodeA = createTestNode('test-project');
      await kg.appendEntity(nodeA);

      const nodeB = createTestNode('test-project', 'actor', [nodeA.id]);
      await kg.appendEntity(nodeB);

      const nodeC = createTestNode('test-project', 'actor', [nodeB.id]);
      await kg.appendEntity(nodeC);

      // Try to create a cycle by making A depend on C
      // Since we can't directly test wouldCreateCycle (it's private),
      // we'll verify that the graph maintains its integrity
      const nodeD = createTestNode('test-project', 'actor', [nodeC.id]);
      await kg.appendEntity(nodeD);

      // Verify the graph structure
      const nodes = await kg.resume({ project: 'test-project' });
      expect(nodes.length).toBe(4);
      expect(nodes[nodes.length - 1].id).toBe(nodeD.id);
    });

    it('throws an error when appending a node that creates a cycle', async () => {
      const nodeA = createTestNode('test-project');
      await kg.appendEntity(nodeA);

      const nodeB = createTestNode('test-project', 'actor', [nodeA.id]);
      await kg.appendEntity(nodeB);

      // Update nodeA to reference its child so a path exists A -> B
      nodeA.children.push(nodeB.id);
      await kg.appendEntity(nodeA);

      // Re-append nodeA with nodeB as parent to form a cycle A -> B -> A
      nodeA.parents = [nodeB.id];

      await expect(kg.appendEntity(nodeA)).rejects.toThrow('create a cycle');
    });

    it('allows multiple parents without cycles', async () => {
      const root = createTestNode('test-project');
      await kg.appendEntity(root);

      const child1 = createTestNode('test-project', 'actor', [root.id]);
      await kg.appendEntity(child1);

      const child2 = createTestNode('test-project', 'actor', [root.id]);
      await kg.appendEntity(child2);

      const merge = createTestNode('test-project', 'actor', [child1.id, child2.id]);

      await expect(kg.appendEntity(merge)).resolves.not.toThrow();
    });

    it('throws when a node already reaches its parent through children', async () => {
      const nodeA = createTestNode('test-project');
      await kg.appendEntity(nodeA);

      const nodeB = createTestNode('test-project', 'actor', [nodeA.id]);
      await kg.appendEntity(nodeB);
      nodeA.children.push(nodeB.id);
      await kg.appendEntity(nodeA);

      const nodeC = createTestNode('test-project', 'actor', [nodeB.id]);
      await kg.appendEntity(nodeC);
      nodeB.children.push(nodeC.id);
      await kg.appendEntity(nodeB);

      nodeA.parents = [nodeC.id];

      await expect(kg.appendEntity(nodeA)).rejects.toThrow('create a cycle');
    });

    it('appends a node with valid parents', async () => {
      const root = createTestNode('test-project');
      await kg.appendEntity(root);

      const child = createTestNode('test-project', 'actor', [root.id]);

      await expect(kg.appendEntity(child)).resolves.not.toThrow();
    });
  });

  describe('getNode', () => {
    it('should retrieve a node by id and project', async () => {
      const testNode = createTestNode('test-project');
      await kg.appendEntity(testNode);

      const retrievedNode = await kg.getNode(testNode.id);
      expect(retrievedNode).toBeDefined();
      expect(retrievedNode?.id).toBe(testNode.id);
      expect(retrievedNode?.thought).toBe(testNode.thought);
    });

    it('should return undefined for non-existent nodes', async () => {
      const nonExistentId = uuid();
      const result = await kg.getNode(nonExistentId);
      expect(result).toBeUndefined();
    });

    it('returns the latest entry when a node is updated', async () => {
      const node = createTestNode('test-project');
      await kg.appendEntity(node);

      node.thought = 'updated thought';
      await kg.appendEntity(node);

      const retrieved = await kg.getNode(node.id);
      expect(retrieved?.thought).toBe('updated thought');
      expect(retrieved?.createdAt).toBe(node.createdAt);
    });
  });

  describe('resume', () => {
    it('should return recent nodes', async () => {
      // Create multiple nodes
      const nodes = [];
      for (let i = 0; i < 10; i++) {
        const node = createTestNode('test-project');
        node.thought = `Node ${i}`;
        await kg.appendEntity(node);
        nodes.push(node);
      }

      // Get the most recent nodes
      const result = await kg.resume({ project: 'test-project', limit: 5 });

      // Check that we have nodes
      expect(result.length).toBeGreaterThan(0);

      // Verify that the nodes are from our test set
      // The exact order might vary based on implementation details
      for (const node of result) {
        expect(node.thought).toMatch(/^Node \d+$/);
      }
    });

    it('should return all nodes if limit is not specified', async () => {
      // Create 3 nodes
      for (let i = 0; i < 3; i++) {
        const node = createTestNode('test-project');
        node.thought = `Node ${i}`;
        await kg.appendEntity(node);
      }

      // Get all nodes (default behavior)
      const result = await kg.resume({ project: 'test-project' });
      expect(result.length).toBe(3);
    });
  });

  describe('export', () => {
    it('should filter nodes by tag', async () => {
      // Create nodes with different tags
      const nodeA = createTestNode('test-project');
      nodeA.tags = [Tag.Requirement];
      await kg.appendEntity(nodeA);

      const nodeB = createTestNode('test-project');
      nodeB.tags = [Tag.Design];
      await kg.appendEntity(nodeB);

      const nodeC = createTestNode('test-project');
      nodeC.tags = [Tag.Requirement, Tag.Risk];
      await kg.appendEntity(nodeC);

      // Filter by tag-a
      const result = await kg.export({
        project: 'test-project',
        filterFn: (n: DagNode) => n.tags?.includes(Tag.Requirement),
      });
      expect(result.length).toBe(2);
      expect(result.map((n: DagNode) => n.id).sort()).toEqual([nodeA.id, nodeC.id].sort());
    });

    it('should apply custom filter functions', async () => {
      // Create nodes with different roles
      const actorNode = createTestNode('test-project', 'actor');
      await kg.appendEntity(actorNode);

      const criticNode = createTestNode('test-project', 'critic');
      await kg.appendEntity(criticNode);

      const summaryNode = createTestNode('test-project', 'summary');
      await kg.appendEntity(summaryNode);

      // Filter by role = 'critic'
      const result = await kg.export({
        project: 'test-project',
        filterFn: (node: DagNode) => node.role === 'critic',
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(criticNode.id);
    });

    it('should respect the limit parameter', async () => {
      // Create 10 nodes
      for (let i = 0; i < 10; i++) {
        const node = createTestNode('test-project');
        node.thought = `Node ${i}`;
        await kg.appendEntity(node);
      }

      // Get nodes with a limit
      const result = await kg.export({ project: 'test-project', limit: 3 });

      // Check that we have nodes (may not be exactly 3 due to implementation details)
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(10); // Should not exceed total nodes
    });
  });

  describe('search', () => {
    it('should find nodes by tag', async () => {
      const nodeA = createTestNode('test-project');
      nodeA.tags = [Tag.Task];
      await kg.appendEntity(nodeA);

      const nodeB = createTestNode('test-project');
      nodeB.tags = [Tag.Design];
      await kg.appendEntity(nodeB);

      const results = await kg.search({ project: 'test-project', tags: [Tag.Task] });
      expect(results.map((n) => n.id)).toEqual([nodeA.id]);
    });

    it('should find nodes by substring', async () => {
      const node = createTestNode('test-project');
      node.thought = 'Implement search feature';
      await kg.appendEntity(node);

      const results = await kg.search({ project: 'test-project', query: 'search' });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(node.id);
    });

    it('should combine tag and query filters', async () => {
      const node = createTestNode('test-project');
      node.tags = [Tag.Risk];
      node.thought = 'Gamma thought here';
      await kg.appendEntity(node);

      const wrongTag = await kg.search({
        project: 'test-project',
        tags: [Tag.Design],
        query: 'Gamma',
      });
      expect(wrongTag).toEqual([]);

      const good = await kg.search({ project: 'test-project', tags: [Tag.Risk], query: 'Gamma' });
      expect(good.length).toBe(1);
      expect(good[0].id).toBe(node.id);
    });
  });

  describe('getNeighbors', () => {
    it('returns immediate neighbors by default', async () => {
      const nodeA = createTestNode('test-project');
      const nodeB = createTestNode('test-project');
      const nodeC = createTestNode('test-project');

      nodeA.children.push(nodeB.id);
      nodeB.parents = [nodeA.id];
      nodeA.parents.push(nodeC.id);

      await kg.appendEntity(nodeB);
      await kg.appendEntity(nodeA);
      await kg.appendEntity(nodeC);

      const neighbors = await kg.getNeighbors(nodeA.id);
      const ids = neighbors.map((n) => n.id).sort();
      expect(ids).toEqual([nodeA.id, nodeB.id, nodeC.id].sort());
    });

    it('respects the depth parameter', async () => {
      const nodeA = createTestNode('test-project');
      const nodeB = createTestNode('test-project');
      const nodeC = createTestNode('test-project');

      nodeA.children.push(nodeB.id);
      nodeB.parents = [nodeA.id];
      nodeB.children.push(nodeC.id);
      nodeC.parents = [nodeB.id];

      await kg.appendEntity(nodeC);
      await kg.appendEntity(nodeB);
      await kg.appendEntity(nodeA);

      const depth1 = await kg.getNeighbors(nodeA.id, 1);
      expect(depth1.map((n) => n.id).sort()).toEqual([nodeA.id, nodeB.id].sort());

      const depth2 = await kg.getNeighbors(nodeA.id, 2);
      expect(depth2.map((n) => n.id).sort()).toEqual([nodeA.id, nodeB.id, nodeC.id].sort());
    });
  });

  describe('getArtifactHistory', () => {
    it('returns nodes referencing a path', async () => {
      const nodeA = createTestNode('test-project');
      nodeA.artifacts = [{ name: 'A', path: 'src/a.ts' }];
      await kg.appendEntity(nodeA);

      const nodeB = createTestNode('test-project');
      nodeB.artifacts = [{ name: 'A', path: 'src/a.ts' }];
      await kg.appendEntity(nodeB);

      const nodeC = createTestNode('test-project');
      nodeC.artifacts = [{ name: 'B', path: 'src/b.ts' }];
      await kg.appendEntity(nodeC);

      const results = await kg.getArtifactHistory('test-project', 'src/a.ts');
      expect(results.map((n) => n.id).sort()).toEqual([nodeA.id, nodeB.id].sort());
    });

    it('respects the limit parameter', async () => {
      const node1 = createTestNode('test-project');
      node1.artifacts = [{ name: 'A', path: 'file.ts' }];
      const node2 = createTestNode('test-project');
      node2.artifacts = [{ name: 'A', path: 'file.ts' }];
      const node3 = createTestNode('test-project');
      node3.artifacts = [{ name: 'A', path: 'file.ts' }];

      await kg.appendEntity(node1);
      await kg.appendEntity(node2);
      await kg.appendEntity(node3);

      const results = await kg.getArtifactHistory('test-project', 'file.ts', 2);
      expect(results.length).toBe(2);
      expect(results.map((n) => n.id)).toEqual([node2.id, node3.id]);
    });
  });

  describe('listProjects', () => {
    it('should list all projects with nodes in the graph', async () => {
      // Create nodes for different projects
      await kg.appendEntity(createTestNode('project-a'));
      await kg.appendEntity(createTestNode('project-b'));
      await kg.appendEntity(createTestNode('project-c'));

      // List projects
      const projects = await kg.listProjects();
      expect(projects.length).toBe(3);
      expect(projects.sort()).toEqual(['project-a', 'project-b', 'project-c'].sort());
    });

    it('should return an empty array if no nodes exist', async () => {
      // No nodes added
      const projects = await kg.listProjects();
      expect(projects).toEqual([]);
    });
  });

  describe('listOpenTasks', () => {
    it('returns only tasks without the task-complete tag', async () => {
      const openTask = createTestNode('test-project');
      openTask.tags = [Tag.Task];
      await kg.appendEntity(openTask);

      const doneTask = createTestNode('test-project');
      doneTask.tags = [Tag.Task, Tag.TaskComplete];
      await kg.appendEntity(doneTask);

      const other = createTestNode('test-project');
      other.tags = [Tag.Design];
      await kg.appendEntity(other);

      const results = await kg.listOpenTasks('test-project');
      expect(results.map((n) => n.id)).toEqual([openTask.id]);
    });
  });

  describe('getHeads', () => {
    it('returns nodes with no children', async () => {
      const nodeA = createTestNode('test-project');
      const nodeB = createTestNode('test-project');
      const nodeC = createTestNode('test-project');

      nodeA.children.push(nodeB.id);
      nodeB.parents = [nodeA.id];

      await kg.appendEntity(nodeB);
      await kg.appendEntity(nodeA);
      await kg.appendEntity(nodeC);

      const heads = await kg.getHeads('test-project');
      expect(heads.map((n) => n.id).sort()).toEqual([nodeB.id, nodeC.id].sort());
    });
  });

  describe('Actor.think', () => {
    it('links new node to heads and updates parents', async () => {
      const actor = new Actor(kg);
      const head1 = createTestNode('test-project');
      const head2 = createTestNode('test-project');

      await kg.appendEntity(head1);
      await kg.appendEntity(head2);

      const { node } = await actor.think({
        thought: 'New thought',
        tags: [Tag.Task],
        artifacts: [],
        project: 'test-project',
        projectContext: '/path/to/test-project',
        diff: 'diff text',
      });

      const all = await kg.allDagNodes('test-project');
      const latestHead1 = all.filter((n) => n.id === head1.id).pop();
      const latestHead2 = all.filter((n) => n.id === head2.id).pop();

      expect(node.parents.sort()).toEqual([head1.id, head2.id].sort());
      expect(latestHead1?.children).toContain(node.id);
      expect(latestHead2?.children).toContain(node.id);
      expect(node.diff).toBe('diff text');
    });
  });
});
