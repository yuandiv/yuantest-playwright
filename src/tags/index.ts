import { TagConfig, TagInfo } from '../types';
import * as path from 'path';
import { walkDirAsync } from '../utils/filesystem';
import { StorageProvider, getStorage } from '../storage';

const TAG_PATTERN = /@tag\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const TAG_ALT_PATTERN =
  /@(smoke|regression|critical|p0|p1|p2|sanity|e2e|unit|integration|slow|fast|flaky)\b/g;

export class TagManager {
  private config: TagConfig;
  private tags: Map<string, TagInfo> = new Map();
  private testTags: Map<string, string[]> = new Map();
  private storage: StorageProvider;

  constructor(config?: Partial<TagConfig>, storage?: StorageProvider) {
    this.config = {
      enabled: true,
      ...config,
    };
    this.storage = storage || getStorage();
  }

  async scanDirectory(testDir: string): Promise<TagInfo[]> {
    if (!(await this.storage.exists(testDir))) {
      return [];
    }

    const files = await walkDirAsync(
      testDir,
      {
        extensions: ['.ts'],
      },
      this.storage
    );

    for (const file of files) {
      await this.scanFile(file);
    }

    return Array.from(this.tags.values());
  }

  async scanFile(filePath: string): Promise<void> {
    const content = await this.storage.readText(filePath);
    if (!content) {
      return;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      TAG_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = TAG_PATTERN.exec(line)) !== null) {
        const tagName = match[1];
        const testName = this.findTestName(lines, i);
        const testId = `${filePath}::${testName}`;

        this.addTag(tagName, testId, testName);
      }

      TAG_ALT_PATTERN.lastIndex = 0;
      while ((match = TAG_ALT_PATTERN.exec(line)) !== null) {
        const tagName = match[1];
        const testName = this.findTestName(lines, i);
        const testId = `${filePath}::${testName}`;

        this.addTag(tagName, testId, testName);
      }
    }
  }

  private addTag(tagName: string, testId: string, testName: string): void {
    if (!this.tags.has(tagName)) {
      this.tags.set(tagName, {
        name: tagName,
        testIds: [],
      });
    }

    const tag = this.tags.get(tagName)!;
    if (!tag.testIds.includes(testId)) {
      tag.testIds.push(testId);
    }

    const existingTags = this.testTags.get(testId) || [];
    if (!existingTags.includes(tagName)) {
      existingTags.push(tagName);
      this.testTags.set(testId, existingTags);
    }
  }

  private findTestName(lines: string[], lineIndex: number): string {
    for (let i = lineIndex; i < Math.min(lineIndex + 5, lines.length); i++) {
      const match = lines[i].match(/(?:test|it)\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (match) {
        return match[1];
      }
    }
    return `line-${lineIndex}`;
  }

  getTags(): TagInfo[] {
    return Array.from(this.tags.values());
  }

  getTestsByTag(tagName: string): string[] {
    return this.tags.get(tagName)?.testIds || [];
  }

  getTagsForTest(testId: string): string[] {
    return this.testTags.get(testId) || [];
  }

  getFilteredTests(
    allTestIds: string[],
    include?: string[],
    exclude?: string[],
    require?: string[]
  ): string[] {
    let filtered = [...allTestIds];

    if (include && include.length > 0) {
      const includeSet = new Set<string>();
      for (const tag of include) {
        const tests = this.getTestsByTag(tag);
        tests.forEach((t) => includeSet.add(t));
      }
      filtered = filtered.filter((id) => includeSet.has(id));
    }

    if (exclude && exclude.length > 0) {
      const excludeSet = new Set<string>();
      for (const tag of exclude) {
        const tests = this.getTestsByTag(tag);
        tests.forEach((t) => excludeSet.add(t));
      }
      filtered = filtered.filter((id) => !excludeSet.has(id));
    }

    if (require && require.length > 0) {
      filtered = filtered.filter((id) => {
        const testTags = this.getTagsForTest(id);
        return require.every((tag) => testTags.includes(tag));
      });
    }

    return filtered;
  }

  buildGrepPattern(include?: string[], exclude?: string[]): string {
    const parts: string[] = [];

    if (include && include.length > 0) {
      parts.push(include.join('|'));
    }

    return parts.join('|') || '';
  }

  getSummary(): {
    totalTags: number;
    totalTaggedTests: number;
    tags: { name: string; count: number }[];
  } {
    const tags = Array.from(this.tags.values()).map((tag) => ({
      name: tag.name,
      count: tag.testIds.length,
    }));

    tags.sort((a, b) => b.count - a.count);

    return {
      totalTags: this.tags.size,
      totalTaggedTests: this.testTags.size,
      tags,
    };
  }

  async generateTagReport(outputPath: string): Promise<string> {
    const summary = this.getSummary();
    const report = {
      generatedAt: new Date().toISOString(),
      summary,
      tags: Array.from(this.tags.values()),
    };

    await this.storage.writeJSON(outputPath, report);
    return outputPath;
  }
}
