export type DependencyType = 'direct' | 'dev' | 'peer' | 'transitive';

export interface DeclaredDependency {
  name: string;
  versionSpec: string;
  type: DependencyType;
  manifestPath: string;
}

export interface DuplicatePackage {
  name: string;
  versions: string[];
}

export interface SuspiciousDependency {
  name: string;
  versionSpec: string;
  reason: string;
  manifestPath: string;
}

export interface UnusedDependency {
  name: string;
  manifestPath: string;
  confidence: number;
}

export interface VulnerabilityAdvisory {
  id: string;
  packageName: string;
  affectedVersion: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  url?: string | undefined;
}

export interface OutdatedDependency {
  packageName: string;
  currentVersion: string;
  latestVersion: string;
}

export interface DependencyIntelligenceSummary {
  manifests: string[];
  lockfiles: string[];
  directCount: number;
  devCount: number;
  transitiveCount: number;
  duplicates: DuplicatePackage[];
  suspicious: SuspiciousDependency[];
  unused: UnusedDependency[];
  vulnerabilities: VulnerabilityAdvisory[];
  outdated: OutdatedDependency[];
  isOnline: boolean;
}
