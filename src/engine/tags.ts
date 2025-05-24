import { z } from 'zod';

export enum Tag {
  Requirement = 'requirement',
  Task = 'task',
  Design = 'design',
  Risk = 'risk',
  TaskComplete = 'task-complete',
  Summary = 'summary',
}

export const TagEnum = z.nativeEnum(Tag);
export const TAGS = Object.values(Tag) as [string, ...string[]];
