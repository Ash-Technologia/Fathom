import type { Category } from '../rules/categories.js';

/**
 * Scoring weights for each category.
 * Must sum to 1.0 (100%).
 */
export const CATEGORY_WEIGHTS: Record<Category, number> = {
  security: 0.2,
  git: 0.15,
  project: 0.15,
  dependencies: 0.1,
  testing: 0.15,
  documentation: 0.1,
  quality: 0.1,
  cicd: 0.05,
  architecture: 0.0, // Architecture is observational in v0.1; doesn't affect score
};

/**
 * Penalty points deducted from a category score per finding severity.
 */
export const SEVERITY_PENALTIES: Record<string, number> = {
  critical: 30,
  high: 15,
  medium: 8,
  low: 3,
  info: 0,
};
