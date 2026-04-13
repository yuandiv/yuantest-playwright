import { AnnotationConfig, Annotation, AnnotationType } from '../types';
import * as path from 'path';
import { walkDirAsync } from '../utils/filesystem';
import { StorageProvider, getStorage } from '../storage';

const ANNOTATION_PATTERNS: Record<AnnotationType, RegExp> = {
  skip: /(?:test|it|describe)\s*\.\s*skip\s*\(/,
  only: /(?:test|it|describe)\s*\.\s*only\s*\(/,
  fail: /(?:test|it)\s*\.\s*fail\s*\(/,
  slow: /(?:test|it)\s*\.\s*slow\s*\(/,
  fixme: /(?:test|it|describe)\s*\.\s*fixme\s*\(/,
  todo: /(?:test|it)\s*\.\s*todo\s*\(/,
  serial: /(?:describe)\s*\.\s*serial\s*\(/,
  parallel: /(?:describe)\s*\.\s*parallel\s*\(/,
};

const ANNOTATION_COMMENT_PATTERN =
  /@(skip|only|fail|slow|fixme|todo|serial|parallel)\b(?:\s+(.+?))?(?:\s*\*\/|\s*$)/g;

export class AnnotationManager {
  private config: AnnotationConfig;
  private annotations: Map<string, Annotation> = new Map();
  private storage: StorageProvider;

  constructor(config?: Partial<AnnotationConfig>, storage?: StorageProvider) {
    this.config = {
      enabled: true,
      respectSkip: true,
      respectOnly: true,
      respectFail: true,
      respectSlow: false,
      respectFixme: true,
      customAnnotations: {},
      ...config,
    };
    this.storage = storage || getStorage();
  }

  async scanDirectory(testDir: string): Promise<Annotation[]> {
    if (!(await this.storage.exists(testDir))) {
      return [];
    }

    const files = await walkDirAsync(
      testDir,
      {
        extensions: ['.ts', '.spec.ts', '.test.ts'],
      },
      this.storage
    );

    const annotations: Annotation[] = [];
    for (const file of files) {
      const fileAnnotations = await this.scanFile(file);
      annotations.push(...fileAnnotations);
    }

    return annotations;
  }

  async scanFile(filePath: string): Promise<Annotation[]> {
    const content = await this.storage.readText(filePath);
    if (!content) {
      return [];
    }

    const annotations: Annotation[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const [type, pattern] of Object.entries(ANNOTATION_PATTERNS)) {
        if (pattern.test(line)) {
          const testName = this.extractTestName(lines, i);
          annotations.push({
            type: type as AnnotationType,
            description: this.extractDescription(lines, i),
            testId: `${filePath}::${testName}`,
            testName,
            file: filePath,
          });
        }
      }

      let commentMatch: RegExpExecArray | null;
      ANNOTATION_COMMENT_PATTERN.lastIndex = 0;
      while ((commentMatch = ANNOTATION_COMMENT_PATTERN.exec(line)) !== null) {
        const type = commentMatch[1] as AnnotationType;
        const description = commentMatch[2]?.trim();

        const testName = this.extractTestName(lines, i + 1);
        annotations.push({
          type,
          description,
          testId: `${filePath}::${testName}`,
          testName,
          file: filePath,
        });
      }
    }

    return annotations;
  }

  private extractTestName(lines: string[], lineIndex: number): string {
    for (let i = lineIndex; i < Math.min(lineIndex + 5, lines.length); i++) {
      const match = lines[i].match(/(?:test|it|describe)\s*\(?['"`]([^'"`]+)['"`]/);
      if (match) {
        return match[1];
      }
      const match2 = lines[i].match(/(?:test|it|describe)\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (match2) {
        return match2[1];
      }
    }
    return `line-${lineIndex}`;
  }

  private extractDescription(lines: string[], lineIndex: number): string | undefined {
    const match = lines[lineIndex].match(
      /(?:skip|only|fail|slow|fixme|todo)\s*\(\s*['"`]([^'"`]+)['"`]/
    );
    return match ? match[1] : undefined;
  }

  getAnnotationsByType(type: AnnotationType): Annotation[] {
    return Array.from(this.annotations.values()).filter((a) => a.type === type);
  }

  getAnnotationsByFile(file: string): Annotation[] {
    return Array.from(this.annotations.values()).filter((a) => a.file === file);
  }

  getSummary(): {
    total: number;
    byType: Record<AnnotationType, number>;
    byFile: Record<string, number>;
  } {
    const all = Array.from(this.annotations.values());
    const byType: Record<string, number> = {};
    const byFile: Record<string, number> = {};

    for (const a of all) {
      byType[a.type] = (byType[a.type] || 0) + 1;
      byFile[a.file] = (byFile[a.file] || 0) + 1;
    }

    return {
      total: all.length,
      byType: byType as Record<AnnotationType, number>,
      byFile,
    };
  }

  shouldSkipTest(testId: string): boolean {
    const annotation = this.annotations.get(testId);
    if (!annotation) {
      return false;
    }

    if (annotation.type === 'skip' && this.config.respectSkip) {
      return true;
    }
    if (annotation.type === 'fixme' && this.config.respectFixme) {
      return true;
    }

    const customConfig = this.config.customAnnotations[annotation.type];
    if (customConfig && customConfig.action === 'skip') {
      return true;
    }

    return false;
  }

  shouldExpectFail(testId: string): boolean {
    const annotation = this.annotations.get(testId);
    if (!annotation) {
      return false;
    }

    if (annotation.type === 'fail' && this.config.respectFail) {
      return true;
    }

    const customConfig = this.config.customAnnotations[annotation.type];
    if (customConfig && customConfig.action === 'fail') {
      return true;
    }

    return false;
  }

  isSlowTest(testId: string): boolean {
    const annotation = this.annotations.get(testId);
    if (!annotation) {
      return false;
    }

    if (annotation.type === 'slow' && this.config.respectSlow) {
      return true;
    }

    return false;
  }

  getPlaywrightAnnotations(): Record<string, any> {
    const annotations: Record<string, any> = {};

    if (this.config.respectSkip) {
      annotations.skip = true;
    }
    if (this.config.respectFixme) {
      annotations.fixme = true;
    }
    if (this.config.respectSlow) {
      annotations.slow = true;
    }

    for (const [key, value] of Object.entries(this.config.customAnnotations)) {
      if (value.action === 'skip') {
        annotations[key] = true;
      }
    }

    return annotations;
  }

  async generateAnnotationReport(outputPath: string): Promise<string> {
    const summary = this.getSummary();
    const allAnnotations = Array.from(this.annotations.values());

    const report = {
      generatedAt: new Date().toISOString(),
      summary,
      annotations: allAnnotations.map((a) => ({
        type: a.type,
        testName: a.testName,
        file: a.file,
        description: a.description,
      })),
    };

    await this.storage.writeJSON(outputPath, report);
    return outputPath;
  }
}
