import path from 'node:path';

/**
 * Detected programming ecosystem.
 */
export interface EcosystemDetection {
  name: string;
  confidence: number;
  evidence: string[];
}

/**
 * Ecosystem detection signatures.
 * Each ecosystem has a set of indicator files/extensions.
 */
const ECOSYSTEM_SIGNATURES: Array<{
  name: string;
  files: string[];
  extensions: string[];
}> = [
  {
    name: 'Node.js',
    files: [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '.nvmrc',
      '.node-version',
    ],
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
  },
  {
    name: 'Python',
    files: [
      'requirements.txt',
      'setup.py',
      'setup.cfg',
      'pyproject.toml',
      'Pipfile',
      'Pipfile.lock',
      'poetry.lock',
      'conda.yaml',
    ],
    extensions: ['.py', '.pyw'],
  },
  {
    name: 'Go',
    files: ['go.mod', 'go.sum'],
    extensions: ['.go'],
  },
  {
    name: 'Rust',
    files: ['Cargo.toml', 'Cargo.lock'],
    extensions: ['.rs'],
  },
  {
    name: 'Java',
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle'],
    extensions: ['.java'],
  },
  {
    name: 'PHP',
    files: ['composer.json', 'composer.lock'],
    extensions: ['.php'],
  },
  {
    name: 'Ruby',
    files: ['Gemfile', 'Gemfile.lock', '.ruby-version'],
    extensions: ['.rb'],
  },
  {
    name: 'C#',
    files: [],
    extensions: ['.cs', '.csproj', '.sln'],
  },
];

/**
 * Detect ecosystems from the file list and root files.
 */
export function detectLanguages(rootFiles: string[], allFiles: string[]): EcosystemDetection[] {
  const rootFilenames = new Set(rootFiles.map((f) => path.basename(f)));
  const allExtensions = new Map<string, number>();

  for (const f of allFiles) {
    const ext = path.extname(f).toLowerCase();
    if (ext) allExtensions.set(ext, (allExtensions.get(ext) ?? 0) + 1);
  }

  const detections: EcosystemDetection[] = [];

  for (const sig of ECOSYSTEM_SIGNATURES) {
    const evidence: string[] = [];
    let confidence = 0;

    // Check indicator files
    for (const indicatorFile of sig.files) {
      if (rootFilenames.has(indicatorFile)) {
        evidence.push(indicatorFile);
        confidence = Math.max(confidence, 0.9);
      }
    }

    // Check extensions
    for (const ext of sig.extensions) {
      const count = allExtensions.get(ext) ?? 0;
      if (count > 0) {
        evidence.push(`${count} ${ext} file${count > 1 ? 's' : ''}`);
        confidence = Math.max(confidence, 0.7);
      }
    }

    if (confidence > 0) {
      detections.push({ name: sig.name, confidence, evidence });
    }
  }

  return detections.sort((a, b) => b.confidence - a.confidence);
}
