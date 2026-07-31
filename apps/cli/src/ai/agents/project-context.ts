import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@yuantest/core';
import { ProjectContext } from '@yuantest/contracts';

export class ProjectContextLoader {
  private log = logger.child('ProjectContextLoader');

  load(projectRoot: string): ProjectContext {
    const context: ProjectContext = {
      projectRoot,
    };

    // 解析 playwright.config
    const configFiles = [
      path.join(projectRoot, 'playwright.config.ts'),
      path.join(projectRoot, 'playwright.config.js'),
      path.join(projectRoot, 'playwright.config.mts'),
    ];

    let configFilePath: string | undefined;
    for (const f of configFiles) {
      if (fs.existsSync(f)) {
        configFilePath = f;
        break;
      }
    }

    if (configFilePath) {
      try {
        const configContent = fs.readFileSync(configFilePath, 'utf-8');

        const baseURLMatch = configContent.match(/baseURL\s*:\s*['"`]([^'"`]+)['"`]/);
        if (baseURLMatch) {
          context.baseURL = baseURLMatch[1];
        }

        const timeoutMatch = configContent.match(/timeout\s*:\s*(\d+)/);
        if (timeoutMatch) {
          context.timeout = parseInt(timeoutMatch[1], 10);
        }

        const testDirMatch = configContent.match(/testDir\s*:\s*['"`]([^'"`]+)['"`]/);
        if (testDirMatch) {
          context.testDir = testDirMatch[1];
        }

        const viewportMatch = configContent.match(
          /viewport\s*:\s*\{\s*width\s*:\s*(\d+)\s*,\s*height\s*:\s*(\d+)\s*\}/
        );
        if (viewportMatch) {
          context.useViewport = {
            width: parseInt(viewportMatch[1], 10),
            height: parseInt(viewportMatch[2], 10),
          };
        }

        this.log.info(
          `Loaded project context: baseURL=${context.baseURL || 'N/A'}, timeout=${context.timeout || 'N/A'}`
        );
      } catch (error) {
        this.log.warn(
          `Failed to read playwright config: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // 解析 package.json
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        context.packageJson = {
          name: pkg.name,
          dependencies: pkg.dependencies,
          devDependencies: pkg.devDependencies,
        };

        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        const techStack: string[] = [];
        if (allDeps.react || allDeps['react-dom']) {
          techStack.push('React');
        }
        if (allDeps.vue || allDeps['vue-router']) {
          techStack.push('Vue');
        }
        if (allDeps.angular || allDeps['@angular/core']) {
          techStack.push('Angular');
        }
        if (allDeps.svelte || allDeps['@sveltejs/kit']) {
          techStack.push('Svelte');
        }
        if (allDeps.next || allDeps['next.js']) {
          techStack.push('Next.js');
        }
        if (allDeps.nuxt || allDeps['nuxt3']) {
          techStack.push('Nuxt');
        }
        if (allDeps.vite) {
          techStack.push('Vite');
        }
        if (allDeps.webpack) {
          techStack.push('Webpack');
        }
        if (techStack.length > 0) {
          context.technology = techStack.join(', ');
        }
      } catch {
        // ignore
      }
    }

    // 查找 fixtures
    const fixturePaths = [
      path.join(projectRoot, 'tests', 'fixtures.ts'),
      path.join(projectRoot, 'tests', 'fixtures.js'),
      path.join(projectRoot, 'test', 'fixtures.ts'),
      path.join(projectRoot, 'test', 'fixtures.js'),
    ];
    for (const fp of fixturePaths) {
      if (fs.existsSync(fp)) {
        context.fixtures = path.relative(projectRoot, fp).replace(/\\/g, '/');
        break;
      }
    }

    return context;
  }
}
