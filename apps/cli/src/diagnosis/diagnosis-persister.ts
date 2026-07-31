/**
 * 诊断结果持久化 — 将诊断结果保存/加载到磁盘
 */
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import type { AIDiagnosis } from '../types';

const log = logger.child('DiagnosisPersister');

export class DiagnosisPersister {
  constructor(private dataDir: string) {}

  private getDiagnosisDir(): string {
    return path.join(this.dataDir, 'diagnosis');
  }

  async saveDiagnosis(runId: string, testId: string, diagnosis: AIDiagnosis): Promise<void> {
    try {
      const dir = this.getDiagnosisDir();
      await fs.promises.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${runId}.json`);

      let store: Record<string, AIDiagnosis> = {};
      try {
        if (fs.existsSync(filePath)) {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          store = JSON.parse(content);
        }
      } catch {
        store = {};
      }

      store[testId] = diagnosis;
      await fs.promises.writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
      log.debug(`Diagnosis persisted for runId=${runId}, testId=${testId}`);
    } catch (error) {
      log.warn(
        `Failed to persist diagnosis: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async loadDiagnosis(runId: string, testId: string): Promise<AIDiagnosis | null> {
    try {
      const filePath = path.join(this.getDiagnosisDir(), `${runId}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const store = JSON.parse(content) as Record<string, AIDiagnosis>;
      return store[testId] ?? null;
    } catch {
      return null;
    }
  }

  async saveClusterResult(runId: string, clusters: unknown[]): Promise<void> {
    try {
      const dir = this.getDiagnosisDir();
      await fs.promises.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${runId}-clusters.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(clusters, null, 2), 'utf-8');
      log.debug(`Cluster result persisted for runId=${runId}`);
    } catch (error) {
      log.warn(
        `Failed to persist cluster result: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async loadClusterResult(runId: string): Promise<unknown[] | null> {
    try {
      const filePath = path.join(this.getDiagnosisDir(), `${runId}-clusters.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as unknown[];
    } catch {
      return null;
    }
  }
}
