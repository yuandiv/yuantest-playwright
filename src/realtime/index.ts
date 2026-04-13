import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { RealTimeMessage, RunProgress, RunResult, TestResult } from '../types';
import dayjs from 'dayjs';
import { logger } from '../logger';
import { CACHE_CONFIG, WEBSOCKET_CONFIG } from '../constants';

export class RealtimeReporter extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private runProgress: Map<string, RunProgress> = new Map();
  private server: Server | null = null;
  private log = logger.child('RealtimeReporter');
  private maxCompletedRuns: number = CACHE_CONFIG.MAX_COMPLETED_RUNS;
  private completedRunIds: string[] = [];
  private testResultBatch: Map<string, TestResult[]> = new Map();
  private batchFlushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_FLUSH_INTERVAL = 100;
  private readonly BATCH_MAX_SIZE = 10;

  constructor() {
    super();
  }

  private cleanupCompletedRuns(): void {
    while (this.completedRunIds.length > this.maxCompletedRuns) {
      const oldestId = this.completedRunIds.shift();
      if (oldestId) {
        this.runProgress.delete(oldestId);
        this.log.debug(`Cleaned up completed run: ${oldestId}`);
      }
    }
  }

  initialize(server: Server): void {
    if (this.wss) {
      this.log.warn('WebSocketServer already initialized, cleaning up previous instance');
      this.shutdown();
    }

    this.server = server;
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

      if (pathname === '/ws') {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      this.log.info(`Client connected (total: ${this.clients.size})`);
      this.sendToClient(ws, {
        type: 'connected',
        payload: { message: 'Connected to YuanTest Realtime Reporter' },
        timestamp: Date.now(),
        runId: '',
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.log.info(`Client disconnected (total: ${this.clients.size})`);
      });

      ws.on('error', (error) => {
        this.log.error(
          'WebSocket client error',
          error instanceof Error ? error : new Error(String(error))
        );
        this.clients.delete(ws);
      });
    });

    this.wss.on('error', (error) => {
      this.log.error(
        'WebSocket server error',
        error instanceof Error ? error : new Error(String(error))
      );
    });

    this.log.info('WebSocket server initialized');
  }

  private sendToClient(ws: WebSocket, message: RealTimeMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: RealTimeMessage): void {
    this.clients.forEach((client) => {
      this.sendToClient(client, message);
    });
  }

  broadcastRunStarted(runId: string, version: string, totalTests: number = 0): void {
    const progress: RunProgress = {
      runId,
      status: 'running',
      progress: 0,
      totalTests,
      passed: 0,
      failed: 0,
      skipped: 0,
      flakyTests: [],
      startTime: Date.now(),
    };
    this.runProgress.set(runId, progress);

    const message: RealTimeMessage = {
      type: 'run_started',
      payload: { runId, version, startTime: progress.startTime },
      timestamp: Date.now(),
      runId,
    };
    this.broadcast(message);
    this.log.debug(`Broadcast run_started: ${runId}`);
  }

  broadcastRunProgress(runId: string, progress: Partial<RunProgress>): void {
    const current = this.runProgress.get(runId);
    if (current) {
      Object.assign(current, progress);
      const message: RealTimeMessage = {
        type: 'run_progress',
        payload: current,
        timestamp: Date.now(),
        runId,
      };
      this.broadcast(message);
    }
  }

  broadcastTestResult(runId: string, result: TestResult): void {
    const current = this.runProgress.get(runId);

    if (!current) {
      this.runProgress.set(runId, {
        runId,
        status: 'running',
        progress: 0,
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        startTime: Date.now(),
      });
    }

    const progress = this.runProgress.get(runId)!;
    progress.passed += result.status === 'passed' ? 1 : 0;
    progress.failed += result.status === 'failed' ? 1 : 0;
    progress.skipped += result.status === 'skipped' ? 1 : 0;

    const total = progress.passed + progress.failed + progress.skipped;
    progress.progress =
      progress.totalTests > 0 ? Math.min((total / progress.totalTests) * 100, 100) : 0;

    if (result.status === 'failed') {
      progress.flakyTests.push(result.id);
    }

    if (!this.testResultBatch.has(runId)) {
      this.testResultBatch.set(runId, []);
    }

    const batch = this.testResultBatch.get(runId)!;
    batch.push(result);

    if (batch.length >= this.BATCH_MAX_SIZE) {
      this.flushTestResultBatch(runId);
    } else if (!this.batchFlushTimer) {
      this.batchFlushTimer = setTimeout(() => {
        this.flushAllBatches();
        this.batchFlushTimer = null;
      }, this.BATCH_FLUSH_INTERVAL);
    }
  }

  private flushTestResultBatch(runId: string): void {
    const batch = this.testResultBatch.get(runId);
    if (!batch || batch.length === 0) {
      return;
    }

    this.testResultBatch.delete(runId);

    const progress = this.runProgress.get(runId);
    const message: RealTimeMessage = {
      type: 'test_result_batch',
      payload: {
        results: batch,
        currentProgress: progress,
      },
      timestamp: Date.now(),
      runId,
    };
    this.broadcast(message);
  }

  private flushAllBatches(): void {
    for (const runId of this.testResultBatch.keys()) {
      this.flushTestResultBatch(runId);
    }
  }

  broadcastSuiteCompleted(runId: string, suiteName: string): void {
    const message: RealTimeMessage = {
      type: 'suite_completed',
      payload: { suiteName, timestamp: Date.now() },
      timestamp: Date.now(),
      runId,
    };
    this.broadcast(message);
  }

  broadcastRunCompleted(runId: string, result: RunResult): void {
    const current = this.runProgress.get(runId);
    if (current) {
      current.status = 'completed';
      current.progress = 100;
      current.estimatedTimeRemaining = 0;
      this.completedRunIds.push(runId);
      this.cleanupCompletedRuns();
    }

    const message: RealTimeMessage = {
      type: 'run_completed',
      payload: result,
      timestamp: Date.now(),
      runId,
    };
    this.broadcast(message);
    this.log.info(`Broadcast run_completed: ${runId}`);
  }

  broadcastFlakyDetected(runId: string, test: TestResult): void {
    const message: RealTimeMessage = {
      type: 'flaky_detected',
      payload: {
        testId: test.id,
        title: test.title,
        failureRate: 0.5,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
      runId,
    };
    this.broadcast(message);
  }

  broadcastError(runId: string, error: string): void {
    const message: RealTimeMessage = {
      type: 'error',
      payload: { error },
      timestamp: Date.now(),
      runId,
    };
    this.broadcast(message);
  }

  /** 广播日志消息，支持区分 stdout/stderr/info 等日志类型 */
  broadcastLog(runId: string, message: string, logType?: string): void {
    const msg: RealTimeMessage = {
      type: 'log',
      payload: { message, timestamp: Date.now(), logType: logType || 'info' },
      timestamp: Date.now(),
      runId,
    };
    this.broadcast(msg);
  }

  getProgress(runId: string): RunProgress | undefined {
    return this.runProgress.get(runId);
  }

  getAllProgress(): RunProgress[] {
    return Array.from(this.runProgress.values());
  }

  getConnectedClients(): number {
    return this.clients.size;
  }

  shutdown(): void {
    if (this.wss) {
      try {
        this.wss.close();
        this.log.info('WebSocket server shut down');
      } catch (e: unknown) {
        this.log.warn(
          `Error shutting down WebSocket server: ${e instanceof Error ? e.message : String(e)}`
        );
      }
      this.wss = null;
    }

    if (this.server) {
      this.server.removeAllListeners('close');
      this.server.removeAllListeners('upgrade');
      this.server = null;
    }

    this.clients.clear();
    this.runProgress.clear();
    this.completedRunIds = [];
  }
}

export class RealtimeReporterClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = WEBSOCKET_CONFIG.MAX_RECONNECT_ATTEMPTS;
  private baseReconnectDelay: number = WEBSOCKET_CONFIG.RECONNECT_BASE_DELAY;
  private maxReconnectDelay: number = WEBSOCKET_CONFIG.RECONNECT_MAX_DELAY;
  private log = logger.child('RealtimeClient');

  constructor(url: string = 'ws://localhost:3001') {
    super();
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          this.log.info('Connected to server');
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: string) => {
          try {
            const message: RealTimeMessage = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error: unknown) {
            this.log.warn(
              `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        });

        this.ws.on('close', () => {
          this.log.info('Disconnected from server');
          this.emit('disconnected');
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          this.log.error(
            'WebSocket error',
            error instanceof Error ? error : new Error(String(error))
          );
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: RealTimeMessage): void {
    this.emit(message.type, message.payload);
    this.emit('message', message);
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log.error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached, giving up`);
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
    const jitter = delay * (0.5 + Math.random() * 0.5);
    this.log.info(
      `Reconnecting in ${Math.round(jitter)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    setTimeout(() => {
      this.connect().catch(() => {});
    }, jitter);
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
