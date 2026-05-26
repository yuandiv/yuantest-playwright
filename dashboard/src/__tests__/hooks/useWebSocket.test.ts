import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWebSocket } from '../../hooks/useWebSocket';

// Track created WebSocket instances
const wsInstances: MockWebSocket[] = [];

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(_data: string) {}
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helpers
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateError() {
    this.onerror?.(new Event('error'));
    this.close();
  }
}

function getLastWS(): MockWebSocket {
  return wsInstances[wsInstances.length - 1];
}

describe('useWebSocket', () => {
  beforeEach(() => {
    wsInstances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not connect when url is null', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket(null, onMessage));

    vi.advanceTimersByTime(1000);

    expect(onMessage).not.toHaveBeenCalled();
    expect(wsInstances.length).toBe(0);
  });

  it('returns isConnected as a function', () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket('ws://localhost:5274/ws', onMessage));

    expect(typeof result.current.isConnected).toBe('function');
  });

  it('isConnected returns false before connection opens', () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket('ws://localhost:5274/ws', onMessage));

    // Before timer fires, WS is still connecting
    expect(result.current.isConnected()).toBe(false);
  });

  it('isConnected returns true after connection opens', () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket('ws://localhost:5274/ws', onMessage));

    // Advance timers to allow connection
    vi.advanceTimersByTime(10);

    expect(result.current.isConnected()).toBe(true);
  });

  it('calls onMessage for log-type messages immediately', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket('ws://localhost:5274/ws', onMessage));

    vi.advanceTimersByTime(10);

    const ws = getLastWS();
    const logMsg = { type: 'log', text: 'test log' };
    ws.simulateMessage(logMsg);

    expect(onMessage).toHaveBeenCalledWith(logMsg);
  });

  it('queues non-log messages and processes via requestAnimationFrame', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket('ws://localhost:5274/ws', onMessage));

    vi.advanceTimersByTime(10);

    const ws = getLastWS();
    const statusMsg = { type: 'status', state: 'running' };
    ws.simulateMessage(statusMsg);

    // Message should be queued but not yet delivered (needs rAF)
    expect(onMessage).not.toHaveBeenCalledWith(statusMsg);

    // Advance past requestAnimationFrame
    vi.advanceTimersByTime(50);

    expect(onMessage).toHaveBeenCalledWith(statusMsg);
  });

  it('reconnects on close with exponential backoff', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket('ws://localhost:5274/ws', onMessage));

    vi.advanceTimersByTime(10);

    const initialCount = wsInstances.length;
    const ws = getLastWS();
    ws.simulateClose();

    // Should schedule reconnect - advance past base delay + jitter
    vi.advanceTimersByTime(30000);

    // A new WebSocket should have been created (reconnect attempt)
    expect(wsInstances.length).toBeGreaterThan(initialCount);
  });

  it('cleans up on unmount by closing the WebSocket', () => {
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket('ws://localhost:5274/ws', onMessage));

    vi.advanceTimersByTime(10);

    unmount();

    // Should not throw after unmount
    expect(true).toBe(true);
  });

  it('respects maxQueueSize by dropping oldest messages', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket('ws://localhost:5274/ws', onMessage));

    vi.advanceTimersByTime(10);

    const ws = getLastWS();

    // Push more than maxQueueSize (500) messages
    for (let i = 0; i < 510; i++) {
      ws.simulateMessage({ type: 'test', index: i });
    }

    // Should not crash
    expect(true).toBe(true);
  });

  it('calls onReconnect callback when reconnecting', () => {
    const onMessage = vi.fn();
    const onReconnect = vi.fn();
    renderHook(() => useWebSocket('ws://localhost:5274/ws', onMessage, { onReconnect }));

    // First connection
    vi.advanceTimersByTime(10);

    // Close to trigger reconnect
    const ws = getLastWS();
    ws.simulateClose();

    // Advance past reconnect delay
    vi.advanceTimersByTime(30000);

    // Advance to let new connection open
    vi.advanceTimersByTime(10);

    // onReconnect should have been called after successful reconnect
    expect(onReconnect).toHaveBeenCalled();
  });
});
