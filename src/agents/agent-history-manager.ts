import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { AgentHealResult } from '../types';

/**
 * 历史记录管理器。
 * 负责 Heal 历史记录的持久化读写和容量管理，
 * 从 AgentService 中解耦。
 */
export class AgentHistoryManager {
  private readonly MAX_HISTORY_SIZE = 100;
  private readonly HISTORY_FILE = 'agent-heal-history.json';
  private log = logger.child('AgentHistoryManager');

  constructor(private dataDir: string) {}

  /** 读取全部修复历史 */
  async getHealHistory(): Promise<AgentHealResult[]> {
    const historyPath = this.getHistoryPath();
    try {
      if (!fs.existsSync(historyPath)) {
        return [];
      }
      const content = fs.readFileSync(historyPath, 'utf-8');
      return JSON.parse(content) as AgentHealResult[];
    } catch {
      return [];
    }
  }

  /** 保存一条修复结果到历史 */
  async saveHealResult(result: AgentHealResult): Promise<void> {
    const historyPath = this.getHistoryPath();
    try {
      let history = await this.getHealHistory();
      history.push(result);
      if (history.length > this.MAX_HISTORY_SIZE) {
        history = history.slice(-this.MAX_HISTORY_SIZE);
      }
      await fs.promises.mkdir(path.dirname(historyPath), { recursive: true });
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (error) {
      this.log.warn(
        `Failed to save heal history: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private getHistoryPath(): string {
    return path.join(this.dataDir, this.HISTORY_FILE);
  }
}
