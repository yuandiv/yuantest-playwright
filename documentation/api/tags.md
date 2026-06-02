# TagManager API Reference

TagManager provides test tag scanning and management, detecting tags in test files using `@tag()` calls and built-in shorthand tags (e.g., `@smoke`, `@regression`), and enabling tag-based test filtering and reporting.

---

## Constructor

```typescript
new TagManager(config?: Partial<TagConfig>, storage?: StorageProvider)
```

### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `config` | `Partial<TagConfig>` | — | Partial tag configuration, merged with defaults |
| `storage` | `StorageProvider` | `getStorage()` | Storage provider instance |

### Default Configuration

| Field | Default Value |
|-------|---------------|
| `enabled` | `true` |
| `include` | `undefined` |
| `exclude` | `undefined` |
| `require` | `undefined` |

### Example

```typescript
import { TagManager } from 'yuantest-playwright';

const tagManager = new TagManager({
  enabled: true,
  include: ['smoke', 'critical'],
  exclude: ['flaky'],
});

const tags = await tagManager.scanDirectory('./tests');
```

---

## Instance Methods

### `scanDirectory(testDir: string): Promise<TagInfo[]>`

Scan all test files in a directory for tags. Recursively walks the directory looking for `.ts` files and scans each one for tag patterns.

| Parameter | Type | Description |
|------|------|------|
| `testDir` | `string` | Path to the test directory to scan |

```typescript
const tags = await tagManager.scanDirectory('./tests');
console.log(`Found ${tags.length} tags`);
```

### `scanFile(filePath: string): Promise<void>`

Scan a single test file for tags. Detects `@tag('name')` patterns and built-in shorthand tags (e.g., `@smoke`, `@regression`, `@p0`, `@critical`, etc.). Results are stored internally and accessible via `getTags()`.

| Parameter | Type | Description |
|------|------|------|
| `filePath` | `string` | Path to the test file to scan |

```typescript
await tagManager.scanFile('./tests/login.spec.ts');
const tags = tagManager.getTags();
```

### `getTags(): TagInfo[]`

Get all discovered tags.

```typescript
const tags = tagManager.getTags();
for (const tag of tags) {
  console.log(`Tag: ${tag.name}, Tests: ${tag.testIds.length}`);
}
```

### `getTestsByTag(tagName: string): string[]`

Get all test IDs associated with a specific tag.

| Parameter | Type | Description |
|------|------|------|
| `tagName` | `string` | The tag name to look up |

```typescript
const smokeTests = tagManager.getTestsByTag('smoke');
console.log(`Smoke tests: ${smokeTests.length}`);
```

### `getTagsForTest(testId: string): string[]`

Get all tags associated with a specific test.

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | The test ID to look up |

```typescript
const tags = tagManager.getTagsForTest('auth.spec.ts::login test');
console.log(`Tags for test: ${tags.join(', ')}`);
```

### `getFilteredTests(allTestIds: string[], include?: string[], exclude?: string[], require?: string[]): string[]`

Filter a list of test IDs based on tag criteria. Supports three filtering modes:

- **include**: Keep only tests that have at least one of the specified tags
- **exclude**: Remove tests that have any of the specified tags
- **require**: Keep only tests that have ALL of the specified tags

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `allTestIds` | `string[]` | — | The full list of test IDs to filter |
| `include` | `string[]` | — | Tags to include (OR logic) |
| `exclude` | `string[]` | — | Tags to exclude |
| `require` | `string[]` | — | Tags that must ALL be present (AND logic) |

```typescript
const allTests = ['test1', 'test2', 'test3', 'test4'];

const smokeTests = tagManager.getFilteredTests(allTests, ['smoke']);

const nonFlakyTests = tagManager.getFilteredTests(allTests, undefined, ['flaky']);

const criticalSmoke = tagManager.getFilteredTests(allTests, undefined, undefined, ['critical', 'smoke']);
```

### `buildGrepPattern(include?: string[], exclude?: string[]): string`

Build a grep pattern string from tag lists, suitable for use with Playwright's `--grep` option. Joins include tags with `|` (OR logic).

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `include` | `string[]` | — | Tags to include in the grep pattern |
| `exclude` | `string[]` | — | Tags to exclude (reserved for future use) |

```typescript
const pattern = tagManager.buildGrepPattern(['smoke', 'critical']);
console.log(pattern);
// "smoke|critical"
```

### `getSummary(): TagSummary`

Get a summary of all discovered tags, including total tag count, total tagged test count, and per-tag statistics sorted by count (descending).

```typescript
const summary = tagManager.getSummary();
console.log(`Total tags: ${summary.totalTags}`);
console.log(`Total tagged tests: ${summary.totalTaggedTests}`);
for (const tag of summary.tags) {
  console.log(`  ${tag.name}: ${tag.count} tests`);
}
```

**Return Type:**

| Field | Type | Description |
|------|------|------|
| `totalTags` | `number` | Total number of unique tags |
| `totalTaggedTests` | `number` | Total number of tests with at least one tag |
| `tags` | `Array<{ name: string; count: number }>` | Per-tag statistics sorted by count descending |

### `generateTagReport(outputPath: string): Promise<string>`

Generate a JSON report of all discovered tags. The report includes a timestamp, summary, and detailed tag information. Returns the output file path.

| Parameter | Type | Description |
|------|------|------|
| `outputPath` | `string` | Path where the report JSON file will be written |

```typescript
const reportPath = await tagManager.generateTagReport('./tag-report.json');
console.log(`Report saved to: ${reportPath}`);
```

**Report Format:**

```json
{
  "generatedAt": "2024-05-14T10:30:00.000Z",
  "summary": {
    "totalTags": 5,
    "totalTaggedTests": 12,
    "tags": [
      { "name": "smoke", "count": 8 },
      { "name": "critical", "count": 4 },
      { "name": "regression", "count": 3 }
    ]
  },
  "tags": [
    {
      "name": "smoke",
      "testIds": ["auth.spec.ts::login test", "auth.spec.ts::register test"]
    }
  ]
}
```

---

## Supported Shorthand Tags

The following shorthand tags are automatically recognized without requiring the `@tag()` syntax:

| Tag | Description |
|-----|-------------|
| `@smoke` | Smoke tests |
| `@regression` | Regression tests |
| `@critical` | Critical path tests |
| `@p0` | Priority 0 tests |
| `@p1` | Priority 1 tests |
| `@p2` | Priority 2 tests |
| `@sanity` | Sanity check tests |
| `@e2e` | End-to-end tests |
| `@unit` | Unit tests |
| `@integration` | Integration tests |
| `@slow` | Slow tests |
| `@fast` | Fast tests |
| `@flaky` | Flaky tests |

---

## Type Definitions

```typescript
interface TagConfig {
  enabled: boolean;
  include?: string[];
  exclude?: string[];
  require?: string[];
}

interface TagInfo {
  name: string;
  testIds: string[];
  description?: string;
}

interface TagSummary {
  totalTags: number;
  totalTaggedTests: number;
  tags: Array<{ name: string; count: number }>;
}
```
