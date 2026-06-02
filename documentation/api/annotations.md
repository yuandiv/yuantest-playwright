# AnnotationManager API Reference

AnnotationManager provides test annotation scanning and management, detecting Playwright annotation modifiers (`skip`, `fail`, `slow`, `fixme`, etc.) in test files and enabling annotation-based test filtering and reporting.

---

## Constructor

```typescript
new AnnotationManager(config?: Partial<AnnotationConfig>, storage?: StorageProvider)
```

### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `config` | `Partial<AnnotationConfig>` | — | Partial annotation configuration, merged with defaults |
| `storage` | `StorageProvider` | `getStorage()` | Storage provider instance |

### Default Configuration

| Field | Default Value |
|-------|---------------|
| `enabled` | `true` |
| `respectSkip` | `true` |
| `respectOnly` | `true` |
| `respectFail` | `true` |
| `respectSlow` | `false` |
| `respectFixme` | `true` |
| `customAnnotations` | `{}` |

### Example

```typescript
import { AnnotationManager } from 'yuantest-playwright';

const annotationManager = new AnnotationManager({
  enabled: true,
  respectSkip: true,
  respectFail: true,
  respectSlow: true,
});

const annotations = await annotationManager.scanDirectory('./tests');
```

---

## Instance Methods

### `scanDirectory(testDir: string): Promise<Annotation[]>`

Scan all test files in a directory for annotations. Recursively walks the directory looking for `.ts`, `.spec.ts`, and `.test.ts` files and scans each one for annotation patterns.

| Parameter | Type | Description |
|------|------|------|
| `testDir` | `string` | Path to the test directory to scan |

```typescript
const annotations = await annotationManager.scanDirectory('./tests');
console.log(`Found ${annotations.length} annotations`);
```

### `scanFile(filePath: string): Promise<Annotation[]>`

Scan a single test file for annotations. Detects both Playwright modifier patterns (e.g., `test.skip()`, `test.fail()`) and comment-based annotations (e.g., `@skip`, `@fail`).

| Parameter | Type | Description |
|------|------|------|
| `filePath` | `string` | Path to the test file to scan |

```typescript
const annotations = await annotationManager.scanFile('./tests/login.spec.ts');
for (const annotation of annotations) {
  console.log(`${annotation.type}: ${annotation.testName} in ${annotation.file}`);
}
```

### `getAnnotationsByType(type: AnnotationType): Annotation[]`

Get all annotations of a specific type.

| Parameter | Type | Description |
|------|------|------|
| `type` | `AnnotationType` | The annotation type to filter by |

```typescript
const skipAnnotations = annotationManager.getAnnotationsByType('skip');
const failAnnotations = annotationManager.getAnnotationsByType('fail');
```

### `getAnnotationsByFile(file: string): Annotation[]`

Get all annotations in a specific file.

| Parameter | Type | Description |
|------|------|------|
| `file` | `string` | The file path to filter by |

```typescript
const fileAnnotations = annotationManager.getAnnotationsByFile('./tests/login.spec.ts');
```

### `getSummary(): AnnotationSummary`

Get a summary of all scanned annotations, including totals grouped by type and by file.

```typescript
const summary = annotationManager.getSummary();
console.log(`Total annotations: ${summary.total}`);
console.log('By type:', summary.byType);
console.log('By file:', summary.byFile);
```

**Return Type:**

| Field | Type | Description |
|------|------|------|
| `total` | `number` | Total number of annotations |
| `byType` | `Record<AnnotationType, number>` | Annotation count grouped by type |
| `byFile` | `Record<string, number>` | Annotation count grouped by file |

### `shouldSkipTest(testId: string): boolean`

Check whether a test should be skipped based on its annotations. Returns `true` if the test has a `skip` annotation (and `respectSkip` is enabled), a `fixme` annotation (and `respectFixme` is enabled), or a custom annotation with action `'skip'`.

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | The test ID to check |

```typescript
if (annotationManager.shouldSkipTest('auth.spec.ts::login test')) {
  console.log('This test should be skipped');
}
```

### `shouldExpectFail(testId: string): boolean`

Check whether a test is expected to fail based on its annotations. Returns `true` if the test has a `fail` annotation (and `respectFail` is enabled) or a custom annotation with action `'fail'`.

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | The test ID to check |

```typescript
if (annotationManager.shouldExpectFail('auth.spec.ts::broken test')) {
  console.log('This test is expected to fail');
}
```

### `isSlowTest(testId: string): boolean`

Check whether a test is marked as slow based on its annotations. Returns `true` if the test has a `slow` annotation and `respectSlow` is enabled.

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | The test ID to check |

```typescript
if (annotationManager.isSlowTest('auth.spec.ts::heavy test')) {
  console.log('This test is marked as slow');
}
```

### `getPlaywrightAnnotations(): Record<string, unknown>`

Get the annotation configuration formatted as Playwright-compatible annotation flags. Returns an object mapping annotation types to `true` for all respected annotation types and custom annotations with `'skip'` action.

```typescript
const playwrightAnnotations = annotationManager.getPlaywrightAnnotations();
// { skip: true, fixme: true }
```

### `generateAnnotationReport(outputPath: string): Promise<string>`

Generate a JSON report of all scanned annotations. The report includes a timestamp, summary, and detailed annotation list. Returns the output file path.

| Parameter | Type | Description |
|------|------|------|
| `outputPath` | `string` | Path where the report JSON file will be written |

```typescript
const reportPath = await annotationManager.generateAnnotationReport('./annotation-report.json');
console.log(`Report saved to: ${reportPath}`);
```

**Report Format:**

```json
{
  "generatedAt": "2024-05-14T10:30:00.000Z",
  "summary": {
    "total": 5,
    "byType": { "skip": 3, "fail": 2 },
    "byFile": { "login.spec.ts": 2, "register.spec.ts": 3 }
  },
  "annotations": [
    {
      "type": "skip",
      "testName": "login test",
      "file": "tests/login.spec.ts",
      "description": "Skipping due to API changes"
    }
  ]
}
```

---

## Type Definitions

```typescript
type AnnotationType =
  | 'skip'
  | 'only'
  | 'fail'
  | 'slow'
  | 'fixme'
  | 'todo'
  | 'serial'
  | 'parallel';

interface Annotation {
  type: AnnotationType;
  description?: string;
  testId: string;
  testName: string;
  file: string;
}

interface AnnotationConfig {
  enabled: boolean;
  respectSkip: boolean;
  respectOnly: boolean;
  respectFail: boolean;
  respectSlow: boolean;
  respectFixme: boolean;
  customAnnotations: Record<string, { action: 'skip' | 'fail' | 'slow' | 'mark' }>;
}

interface AnnotationSummary {
  total: number;
  byType: Record<AnnotationType, number>;
  byFile: Record<string, number>;
}
```
