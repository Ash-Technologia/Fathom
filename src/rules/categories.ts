/**
 * Analysis categories.
 * Each analyzer belongs to exactly one category.
 */
export type Category =
  | 'project'
  | 'git'
  | 'security'
  | 'dependencies'
  | 'quality'
  | 'testing'
  | 'documentation'
  | 'cicd'
  | 'architecture';

export const CATEGORIES: Category[] = [
  'project',
  'git',
  'security',
  'dependencies',
  'quality',
  'testing',
  'documentation',
  'cicd',
  'architecture',
];

export const CATEGORY_LABELS: Record<Category, string> = {
  project: 'Project',
  git: 'Git',
  security: 'Security',
  dependencies: 'Dependencies',
  quality: 'Code Quality',
  testing: 'Testing',
  documentation: 'Documentation',
  cicd: 'CI/CD',
  architecture: 'Architecture',
};
