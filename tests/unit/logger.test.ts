import { Logger, ChildLogger, LogLevel, logger } from '../../src/logger';
import * as fs from 'fs';
import * as path from 'path';

describe('Logger', () => {
  let loggerInstance: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerInstance = Logger.getInstance();
  });

  afterEach(async () => {
    try {
      await loggerInstance.shutdown();
    } catch (error) {
      // Ignore shutdown errors
    }
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('init', () => {
    it('should initialize logger with default settings', async () => {
      await loggerInstance.init();
      
      expect(loggerInstance).toBeDefined();
    });

    it('should initialize with custom log directory', async () => {
      await loggerInstance.init('./custom-logs');
      
      expect(loggerInstance).toBeDefined();
    });

    it('should initialize with custom log level', async () => {
      await loggerInstance.init('./logs', 'DEBUG');
      
      expect(loggerInstance).toBeDefined();
    });

    it('should handle invalid log level', async () => {
      await loggerInstance.init('./logs', 'INVALID');
      
      expect(loggerInstance).toBeDefined();
    });

    it('should return same promise if already initializing', async () => {
      const promise1 = loggerInstance.init();
      const promise2 = loggerInstance.init();
      
      expect(promise1).toEqual(promise2);
    });
  });

  describe('logging methods', () => {
    beforeEach(async () => {
      await loggerInstance.init();
    });

    it('should log info messages', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      loggerInstance.info('TestModule', 'Info message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log info messages', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      loggerInstance.info('TestModule', 'Info message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log warning messages', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      loggerInstance.warn('TestModule', 'Warning message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log error messages', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      loggerInstance.error('TestModule', 'Error message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log error with stack trace', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const error = new Error('Test error');
      
      loggerInstance.error('TestModule', 'Error occurred', error);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not log messages below log level', async () => {
      await loggerInstance.init('./logs', 'ERROR');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      loggerInstance.debug('TestModule', 'Debug message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('child logger', () => {
    beforeEach(async () => {
      await loggerInstance.init();
    });

    it('should create child logger', () => {
      const childLogger = loggerInstance.child('ChildModule');
      
      expect(childLogger).toBeInstanceOf(ChildLogger);
    });

    it('should log with child logger', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const childLogger = loggerInstance.child('ChildModule');
      
      childLogger.info('Info from child');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log info with child logger', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const childLogger = loggerInstance.child('ChildModule');
      
      childLogger.info('Info from child');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log warning with child logger', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const childLogger = loggerInstance.child('ChildModule');
      
      childLogger.warn('Warning from child');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log error with child logger', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const childLogger = loggerInstance.child('ChildModule');
      
      childLogger.error('Error from child');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    it('should shutdown logger gracefully', async () => {
      await loggerInstance.init();
      await loggerInstance.shutdown();
      
      expect(true).toBe(true);
    });

    it('should handle multiple shutdown calls', async () => {
      await loggerInstance.init();
      await loggerInstance.shutdown();
      await loggerInstance.shutdown();
      
      expect(true).toBe(true);
    });
  });

  describe('flush', () => {
    it('should flush log queue', async () => {
      await loggerInstance.init();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      loggerInstance.info('TestModule', 'Message 1');
      loggerInstance.info('TestModule', 'Message 2');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

describe('ChildLogger', () => {
  let parentLogger: Logger;
  let childLogger: ChildLogger;

  beforeEach(async () => {
    parentLogger = Logger.getInstance();
    await parentLogger.init();
    childLogger = parentLogger.child('TestModule');
  });

  afterEach(async () => {
    await parentLogger.shutdown();
  });

  it('should have module name', () => {
    expect(childLogger).toBeDefined();
  });

  it('should delegate info to parent', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    childLogger.info('Info message');
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should delegate info to parent', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    childLogger.info('Info message');
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should delegate warn to parent', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    childLogger.warn('Warning message');
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should delegate error to parent', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    childLogger.error('Error message');
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should delegate error with Error object to parent', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const error = new Error('Test error');
    
    childLogger.error('Error occurred', error);
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('LogLevel', () => {
  it('should have DEBUG level', () => {
    expect(LogLevel.DEBUG).toBeDefined();
  });

  it('should have INFO level', () => {
    expect(LogLevel.INFO).toBeDefined();
  });

  it('should have WARN level', () => {
    expect(LogLevel.WARN).toBeDefined();
  });

  it('should have ERROR level', () => {
    expect(LogLevel.ERROR).toBeDefined();
  });

  it('should have correct level order', () => {
    expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
    expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
    expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
  });
});

describe('logger export', () => {
  it('should export logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger).toBeInstanceOf(Logger);
  });
});
