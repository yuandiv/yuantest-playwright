import * as fs from 'fs';
import * as path from 'path';

import { HealerPatch } from '../types';
import { logger } from '../logger';

/**
 * Unified patch application module that consolidates the logic from
 * HealerAgent.applyPatchToFile() and AgentService.applyPatch().
 */
export class PatchApplier {
  private log = logger.child('PatchApplier');

  /**
   * Apply a patch to content in memory (no disk write).
   * Returns the patched content, or null if the patch could not be applied.
   * Use this for transactional patch workflows where disk writes should only
   * happen after all patches are confirmed.
   */
  applyPatchToContent(currentContent: string, patch: HealerPatch): string | null {
    try {
      // Exact match first
      if (currentContent.includes(patch.originalCode)) {
        const newContent = currentContent.replace(patch.originalCode, patch.patchedCode);
        if (newContent === currentContent) {
          this.log.warn(`Patch replacement had no effect`);
          return null;
        }
        return newContent;
      }

      // Try normalized whitespace match
      const normalizedContent = this.normalizeWhitespace(currentContent);
      const normalizedOriginal = this.normalizeWhitespace(patch.originalCode);
      if (normalizedContent.includes(normalizedOriginal)) {
        const index = normalizedContent.indexOf(normalizedOriginal);
        const originalIndex = this.mapNormalizedIndexToOriginal(
          currentContent,
          normalizedContent,
          index,
          patch.originalCode
        );
        if (originalIndex !== -1) {
          return (
            currentContent.slice(0, originalIndex) +
            patch.patchedCode +
            currentContent.slice(originalIndex + patch.originalCode.length)
          );
        }
      }

      this.log.warn(`Original code not found in content, patch skipped`);
      return null;
    } catch (error) {
      this.log.error(
        `Failed to apply patch to content: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Apply a patch to file content (simpler version, no security check, no line number matching).
   * Used internally by HealerAgent.
   *
   * Strategy: exact match first, then normalized whitespace match with position mapping.
   *
   * @deprecated Use applyPatchToContent for in-memory operations to avoid intermediate disk writes.
   */
  applyPatchToFile(filePath: string, currentContent: string, patch: HealerPatch): boolean {
    try {
      if (!currentContent.includes(patch.originalCode)) {
        // Try normalized whitespace match
        const normalizedContent = this.normalizeWhitespace(currentContent);
        const normalizedOriginal = this.normalizeWhitespace(patch.originalCode);
        if (normalizedContent.includes(normalizedOriginal)) {
          const index = normalizedContent.indexOf(normalizedOriginal);
          // Map normalized position back to original position
          const originalIndex = this.mapNormalizedIndexToOriginal(
            currentContent,
            normalizedContent,
            index,
            patch.originalCode
          );
          if (originalIndex !== -1) {
            const newContent =
              currentContent.slice(0, originalIndex) +
              patch.patchedCode +
              currentContent.slice(originalIndex + patch.originalCode.length);
            fs.writeFileSync(filePath, newContent, 'utf-8');
            return true;
          }
        }
        this.log.warn(`Original code not found in file, patch skipped: ${filePath}`);
        return false;
      }

      const newContent = currentContent.replace(patch.originalCode, patch.patchedCode);
      if (newContent === currentContent) {
        this.log.warn(`Patch replacement had no effect: ${filePath}`);
        return false;
      }
      fs.writeFileSync(filePath, newContent, 'utf-8');
      return true;
    } catch (error) {
      this.log.error(
        `Failed to apply patch to file: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Apply a patch to a file on disk (full version with security checks and all strategies).
   *
   * Strategy 1: line number based matching (if patch.lineNumber exists)
   * Strategy 2: content matching with uniqueness check
   * Strategy 3: context-based matching (if patch.context exists and multiple matches)
   * Falls back to normalized whitespace matching with position mapping
   */
  applyPatch(patch: HealerPatch, projectRoot: string): boolean {
    try {
      const resolvedFilePath = path.resolve(projectRoot, patch.filePath);

      // Security check: patch target must be within project root
      if (!PatchApplier.isWithinProjectRoot(resolvedFilePath, projectRoot)) {
        this.log.error(`Security: patch target outside project root: ${resolvedFilePath}`);
        return false;
      }

      if (!fs.existsSync(resolvedFilePath)) {
        this.log.error(`File not found for patch: ${resolvedFilePath}`);
        return false;
      }

      const currentContent = fs.readFileSync(resolvedFilePath, 'utf-8');

      // Strategy 1: line number based matching
      if (patch.lineNumber && patch.lineNumber > 0) {
        const lines = currentContent.split('\n');
        const targetLineIndex = patch.lineNumber - 1; // 0-based index
        if (targetLineIndex < lines.length) {
          const originalLines = patch.originalCode.split('\n');
          const startLine = targetLineIndex;
          const endLine = Math.min(startLine + originalLines.length, lines.length);
          const actualLines = lines.slice(startLine, endLine).join('\n');

          // Compare with normalized whitespace for line number matching
          if (
            this.normalizeWhitespace(actualLines) === this.normalizeWhitespace(patch.originalCode)
          ) {
            const newLines = [...lines];
            newLines.splice(startLine, originalLines.length, ...patch.patchedCode.split('\n'));
            fs.writeFileSync(resolvedFilePath, newLines.join('\n'), 'utf-8');
            patch.appliedAt = Date.now();
            patch.appliedBy = 'manual';
            this.log.info(`Patch applied by line number to: ${resolvedFilePath}`);
            return true;
          }
        }
        this.log.warn(
          `Line number ${patch.lineNumber} did not match, falling back to content match`
        );
      }

      // Strategy 2: content matching with uniqueness check
      const normalizedContent = this.normalizeWhitespace(currentContent);
      const normalizedOriginal = this.normalizeWhitespace(patch.originalCode);

      if (!normalizedContent.includes(normalizedOriginal)) {
        this.log.warn(
          `Original code not found in file, patch may be outdated: ${resolvedFilePath}`
        );
        return false;
      }

      // Check match uniqueness
      const matchCount = this.countOccurrences(normalizedContent, normalizedOriginal);
      if (matchCount > 1) {
        // Strategy 3: context-based matching when multiple matches found
        if (patch.context) {
          const contextIndex = currentContent.indexOf(patch.context);
          if (contextIndex !== -1) {
            // Search for originalCode near the context
            const searchStart = Math.max(0, contextIndex - 500);
            const searchEnd = Math.min(
              currentContent.length,
              contextIndex + patch.context.length + 500
            );
            const searchRegion = currentContent.slice(searchStart, searchEnd);
            const localIndex = searchRegion.indexOf(patch.originalCode);
            if (localIndex !== -1) {
              const globalIndex = searchStart + localIndex;
              const newContent =
                currentContent.slice(0, globalIndex) +
                patch.patchedCode +
                currentContent.slice(globalIndex + patch.originalCode.length);
              fs.writeFileSync(resolvedFilePath, newContent, 'utf-8');
              patch.appliedAt = Date.now();
              patch.appliedBy = 'manual';
              this.log.info(`Patch applied with context to: ${resolvedFilePath}`);
              return true;
            }
          }
        }
        this.log.warn(
          `Original code found ${matchCount} times in file, cannot apply patch uniquely: ${resolvedFilePath}`
        );
        return false;
      }

      // Unique match — safe to replace
      // Try exact match replacement first; fall back to normalized match with position mapping
      if (currentContent.includes(patch.originalCode)) {
        const newContent = currentContent.replace(patch.originalCode, patch.patchedCode);
        fs.writeFileSync(resolvedFilePath, newContent, 'utf-8');
      } else {
        // Normalized match succeeded but exact match failed — map position back to original
        const normalizedIndex = normalizedContent.indexOf(normalizedOriginal);
        const originalIndex = this.mapNormalizedIndexToOriginal(
          currentContent,
          normalizedContent,
          normalizedIndex,
          patch.originalCode
        );
        if (originalIndex === -1) {
          this.log.warn(
            `Normalized match found but failed to map to original position: ${resolvedFilePath}`
          );
          return false;
        }
        const newContent =
          currentContent.slice(0, originalIndex) +
          patch.patchedCode +
          currentContent.slice(originalIndex + patch.originalCode.length);
        fs.writeFileSync(resolvedFilePath, newContent, 'utf-8');
      }

      patch.appliedAt = Date.now();
      patch.appliedBy = 'manual';
      this.log.info(`Patch applied to: ${resolvedFilePath}`);

      return true;
    } catch (error) {
      this.log.error(
        `Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Normalize whitespace by collapsing all consecutive whitespace into a single space.
   */
  normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Map an index in normalized (whitespace-collapsed) content back to the original content.
   * Returns -1 if mapping fails.
   */
  mapNormalizedIndexToOriginal(
    original: string,
    normalized: string,
    normalizedIndex: number,
    originalSnippet: string
  ): number {
    const snippetNorm = originalSnippet.replace(/\s+/g, ' ');

    let origIdx = 0;
    let normIdx = 0;

    while (origIdx < original.length && normIdx < normalized.length) {
      if (normIdx === normalizedIndex) {
        // Verify that the content from this position matches
        const remaining = normalized.slice(normIdx, normIdx + snippetNorm.length);
        if (remaining === snippetNorm) {
          return origIdx;
        }
      }

      const origChar = original[origIdx];
      const normChar = normalized[normIdx];

      if (origChar === normChar) {
        origIdx++;
        normIdx++;
      } else if (/\s/.test(origChar) && normChar === ' ') {
        // Multiple whitespace chars in original collapsed to one space in normalized
        origIdx++;
        while (origIdx < original.length && /\s/.test(original[origIdx])) {
          origIdx++;
        }
        normIdx++;
      } else {
        origIdx++;
        normIdx++;
      }
    }

    return -1;
  }

  /**
   * Count non-overlapping occurrences of `search` in `text`.
   */
  countOccurrences(text: string, search: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(search, pos)) !== -1) {
      count++;
      pos += search.length;
    }
    return count;
  }

  /**
   * Check whether a resolved path is within the project root directory.
   */
  static isWithinProjectRoot(resolvedPath: string, projectRoot: string): boolean {
    const normalized = path.normalize(resolvedPath);
    const normalizedRoot = path.normalize(projectRoot);
    return normalized.startsWith(normalizedRoot + path.sep) || normalized === normalizedRoot;
  }
}
