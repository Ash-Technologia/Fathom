/**
 * Framework detection.
 *
 * Frameworks are detected from package.json dependencies,
 * config files, and directory structure.
 * Never claims a framework without evidence.
 */

export interface FrameworkDetection {
  name: string;
  confidence: number;
  evidence: string[];
}

interface FrameworkSignature {
  name: string;
  /** npm package names that indicate this framework */
  packages?: string[];
  /** Config files that indicate this framework */
  configFiles?: string[];
  /** Directory indicators */
  directories?: string[];
  /** File patterns */
  filePatterns?: RegExp[];
}

const FRAMEWORK_SIGNATURES: FrameworkSignature[] = [
  // Frontend JS
  {
    name: 'Next.js',
    packages: ['next'],
    configFiles: ['next.config.js', 'next.config.ts', 'next.config.mjs'],
    directories: ['.next'],
  },
  {
    name: 'React',
    packages: ['react', 'react-dom'],
    filePatterns: [/\.(jsx|tsx)$/],
  },
  {
    name: 'Vue',
    packages: ['vue'],
    configFiles: ['vue.config.js', 'vue.config.ts', 'vite.config.ts'],
    filePatterns: [/\.vue$/],
  },
  {
    name: 'Nuxt',
    packages: ['nuxt', 'nuxt3'],
    configFiles: ['nuxt.config.js', 'nuxt.config.ts'],
    directories: ['.nuxt'],
  },
  {
    name: 'Angular',
    packages: ['@angular/core'],
    configFiles: ['angular.json', '.angular-cli.json'],
  },
  {
    name: 'Svelte',
    packages: ['svelte'],
    configFiles: ['svelte.config.js'],
    filePatterns: [/\.svelte$/],
  },
  {
    name: 'Remix',
    packages: ['@remix-run/node', '@remix-run/react'],
    configFiles: ['remix.config.js'],
  },
  {
    name: 'Astro',
    packages: ['astro'],
    configFiles: ['astro.config.mjs', 'astro.config.js'],
  },
  // Backend JS/TS
  {
    name: 'Express',
    packages: ['express'],
  },
  {
    name: 'NestJS',
    packages: ['@nestjs/core', '@nestjs/common'],
  },
  {
    name: 'Fastify',
    packages: ['fastify'],
  },
  {
    name: 'Hono',
    packages: ['hono'],
  },
  // Python
  {
    name: 'FastAPI',
    packages: ['fastapi'],
    filePatterns: [/main\.py$/, /app\.py$/],
  },
  {
    name: 'Django',
    packages: ['django', 'Django'],
    configFiles: ['manage.py'],
    filePatterns: [/settings\.py$/],
  },
  {
    name: 'Flask',
    packages: ['flask', 'Flask'],
  },
  // Java
  {
    name: 'Spring Boot',
    configFiles: ['pom.xml'],
    filePatterns: [/Application\.java$/, /SpringApplication\.java$/],
  },
  // Build tools (informational)
  {
    name: 'Vite',
    packages: ['vite'],
    configFiles: ['vite.config.ts', 'vite.config.js', 'vite.config.mts'],
  },
];

/**
 * Detect frameworks from package dependencies and file indicators.
 */
export function detectFrameworks(params: {
  dependencies: string[];
  devDependencies: string[];
  rootFiles: string[];
  allFiles: string[];
}): FrameworkDetection[] {
  const { dependencies, devDependencies, rootFiles, allFiles } = params;

  const allPackages = new Set([...dependencies, ...devDependencies]);
  const rootFileNames = new Set(rootFiles.map((f) => f.split('/').pop() ?? f));
  const allFileNames = allFiles.map((f) => f.replace(/\\/g, '/'));

  const detections: FrameworkDetection[] = [];

  for (const sig of FRAMEWORK_SIGNATURES) {
    const evidence: string[] = [];
    let confidence = 0;

    // Check packages
    for (const pkg of sig.packages ?? []) {
      if (allPackages.has(pkg)) {
        evidence.push(`dependency: ${pkg}`);
        confidence = Math.max(confidence, 0.95);
      }
    }

    // Check config files
    for (const cfgFile of sig.configFiles ?? []) {
      if (rootFileNames.has(cfgFile) || allFileNames.some((f) => f.endsWith(cfgFile))) {
        evidence.push(`config: ${cfgFile}`);
        confidence = Math.max(confidence, confidence > 0 ? confidence : 0.8);
      }
    }

    // Check directories
    for (const dir of sig.directories ?? []) {
      if (allFileNames.some((f) => f.startsWith(dir + '/'))) {
        evidence.push(`directory: ${dir}/`);
        confidence = Math.max(confidence, confidence > 0 ? confidence : 0.7);
      }
    }

    // Check file patterns
    for (const pattern of sig.filePatterns ?? []) {
      const match = allFileNames.find((f) => pattern.test(f));
      if (match) {
        evidence.push(`files matching ${pattern.source}`);
        confidence = Math.max(confidence, confidence > 0 ? confidence : 0.65);
      }
    }

    if (confidence > 0) {
      detections.push({ name: sig.name, confidence, evidence });
    }
  }

  return detections.sort((a, b) => b.confidence - a.confidence);
}
