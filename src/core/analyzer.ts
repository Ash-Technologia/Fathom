import type { Category } from '../rules/categories.js';
import type { AnalyzerResult } from './result.js';
import type { RepositoryContext } from './context.js';

/**
 * Every analyzer must implement this interface.
 *
 * Analyzers are pure in the sense that they read from context
 * and return findings — they never modify anything.
 */
export interface Analyzer {
  /** Unique identifier, e.g. "git" */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Which category this analyzer covers */
  readonly category: Category;
  /** Short description of what this analyzer checks */
  readonly description: string;
  /** Run the analysis and return results */
  analyze(context: RepositoryContext): Promise<AnalyzerResult>;
}

/**
 * Registry of all available analyzers.
 *
 * Future: support dynamic registration from plugins.
 */
export class AnalyzerRegistry {
  private readonly analyzers = new Map<string, Analyzer>();

  register(analyzer: Analyzer): this {
    this.analyzers.set(analyzer.id, analyzer);
    return this;
  }

  getAll(): Analyzer[] {
    return [...this.analyzers.values()];
  }

  get(id: string): Analyzer | undefined {
    return this.analyzers.get(id);
  }
}
