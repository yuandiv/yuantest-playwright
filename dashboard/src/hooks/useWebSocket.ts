import { useEffect, useRef, useCallback } from 'react';

type MessageHandler = (data: any) => void;

interface UseWebSocketOptions {
  onReconnect?: () => void;
}

export function useWebSocket(url: string | null, onMessage: MessageHandler, options?: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnect = 50;
  const baseDelay = 1000;
  const maxDelay = 30000;
  const onMessageRef = useRef(onMessage);
  const onReconnectRef = useRef(options?.onReconnect);
  const messageQueueRef = useRef<any[]>([]);
  const processingRef = useRef(false);
  const maxQueueSize = 500;
  const wasConnectedRef = useRef(false);
  
  onMessageRef.current = onMessage;
  onReconnectRef.current = options?.onReconnect;

  const processQueue = useCallback(() => {
    if (processingRef.current || messageQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    
    requestAnimationFrame(() => {
      const startTime = performance.now();
      const maxProcessTime = 16;
      const maxMessagesPerFrame = 50;
      let processedCount = 0;
      
      while (messageQueueRef.current.length > 0 && processedCount < maxMessagesPerFrame) {
        const msg = messageQueueRef.current.shift();
        if (msg) {
          try {
            onMessageRef.current(msg);
          } catch (e) {
            console.error('WS message handler error:', e);
          }
        }
        processedCount++;
        
        if (performance.now() - startTime > maxProcessTime) {
          break;
        }
      }
      
      processingRef.current = false;
      
      if (messageQueueRef.current.length > 0) {
        requestAnimationFrame(() => processQueue());
      }
    });
  }, []);

  const connect = useCallback(() => {
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      const isReconnect = wasConnectedRef.current && reconnectAttemptsRef.current > 0;
      reconnectAttemptsRef.current = 0;
      wasConnectedRef.current = true;
      
      if (isReconnect && onReconnectRef.current) {
        try {
          onReconnectRef.current();
        } catch (e) {
          console.error('WS onReconnect handler error:', e);
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'log') {
          try {
            onMessageRef.current(msg);
          } catch (e) {
            console.error('WS log message handler error:', e);
          }
          return;
        }
        
        if (messageQueueRef.current.length >= maxQueueSize) {
          messageQueueRef.current.shift();
        }
        
        messageQueueRef.current.push(msg);
        processQueue();
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      if (reconnectAttemptsRef.current >= maxReconnect) return;
      const delay = Math.min(baseDelay * Math.pow(2, reconnectAttemptsRef.current), maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      reconnectAttemptsRef.current++;
      setTimeout(connect, jitter);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url, processQueue]);

  useEffect(() => {
    connect();
    return () => {
      reconnectAttemptsRef.current = maxReconnect;
      wsRef.current?.close();
      messageQueueRef.current = [];
    };
  }, [connect]);

  const isConnected = () => wsRef.current?.readyState === WebSocket.OPEN;

  return { isConnected };
}
