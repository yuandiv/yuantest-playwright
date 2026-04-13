import express, { Application } from 'express';
import request from 'supertest';
import { z } from 'zod';
import {
  asyncHandler,
  validateBody,
  validateQuery,
  validateParams,
  errorHandler,
  notFoundHandler,
  createAppError
} from '../../src/middleware';
import { PlaywrightRunnerError, ErrorCode } from '../../src/types';
import { HTTP_STATUS } from '../../src/constants';

describe('Middleware Module', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('asyncHandler', () => {
    it('should handle async errors and pass to error handler', async () => {
      app.get('/test', asyncHandler(async () => {
        throw new Error('Test error');
      }));
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HTTP_STATUS.INTERNAL_ERROR);
      expect(response.body).toEqual({
        error: 'Internal server error',
        message: 'Test error'
      });
    });

    it('should pass through on success', async () => {
      app.get('/test', asyncHandler(async (_req, res) => {
        res.json({ success: true });
      }));

      const response = await request(app).get('/test');

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toEqual({ success: true });
    });

    it('should handle PlaywrightRunnerError', async () => {
      app.get('/test', asyncHandler(async () => {
        throw new PlaywrightRunnerError('Custom error', ErrorCode.INVALID_CONFIG, undefined, 400);
      }));
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Custom error',
        code: 'INVALID_CONFIG'
      });
    });
  });

  describe('validateBody', () => {
    const schema = z.object({ name: z.string(), age: z.number() });

    it('should pass valid body', async () => {
      app.post('/test', validateBody(schema), (req, res) => {
        res.json({ received: req.body });
      });

      const response = await request(app)
        .post('/test')
        .send({ name: 'John', age: 25 });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.received).toEqual({ name: 'John', age: 25 });
    });

    it('should reject invalid body', async () => {
      app.post('/test', validateBody(schema), (req, res) => {
        res.json({ error: 'should not reach' });
      });

      const response = await request(app)
        .post('/test')
        .send({ name: 'John', age: 'not-a-number' });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details).toHaveLength(1);
      expect(response.body.details[0]).toMatchObject({
        path: 'age',
        message: expect.stringContaining('number')
      });
    });

    it('should reject missing required fields', async () => {
      app.post('/test', validateBody(schema), (req, res) => {
        res.json({ error: 'should not reach' });
      });

      const response = await request(app)
        .post('/test')
        .send({ name: 'John' });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });
  });

  describe('validateQuery', () => {
    const schema = z.object({ page: z.string(), limit: z.coerce.number() });

    it('should pass valid query', async () => {
      app.get('/test', validateQuery(schema), (req, res) => {
        res.json({ received: req.query });
      });

      const response = await request(app)
        .get('/test')
        .query({ page: '1', limit: '10' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.received).toEqual({ page: '1', limit: 10 });
    });

    it('should reject invalid query', async () => {
      app.get('/test', validateQuery(schema), (req, res) => {
        res.json({ error: 'should not reach' });
      });

      const response = await request(app)
        .get('/test')
        .query({ limit: 'not-a-number' });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should reject missing required query params', async () => {
      app.get('/test', validateQuery(schema), (req, res) => {
        res.json({ error: 'should not reach' });
      });

      const response = await request(app)
        .get('/test')
        .query({ page: '1' });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('validateParams', () => {
    const schema = z.object({ id: z.string() });

    it('should pass valid params', async () => {
      app.get('/test/:id', validateParams(schema), (req, res) => {
        res.json({ received: req.params });
      });

      const response = await request(app).get('/test/123');

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.received).toEqual({ id: '123' });
    });

    it('should reject invalid params type', async () => {
      const numberSchema = z.object({ id: z.number() });
      app.get('/test/:id', validateParams(numberSchema), (req, res) => {
        res.json({ error: 'should not reach' });
      });

      const response = await request(app).get('/test/abc');

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });
  });

  describe('errorHandler', () => {
    it('should handle PlaywrightRunnerError', async () => {
      app.get('/test', () => {
        throw new PlaywrightRunnerError('Test error', ErrorCode.INVALID_CONFIG, undefined, 400);
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Test error',
        code: 'INVALID_CONFIG'
      });
    });

    it('should handle ZodError', async () => {
      app.get('/test', () => {
        const schema = z.object({ name: z.string() });
        schema.parse({ name: 123 });
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should handle generic Error', async () => {
      app.get('/test', () => {
        throw new Error('Generic error');
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HTTP_STATUS.INTERNAL_ERROR);
      expect(response.body).toEqual({
        error: 'Internal server error',
        message: 'Generic error'
      });
    });

    it('should hide error message in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      app.get('/test', () => {
        throw new Error('Secret error');
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HTTP_STATUS.INTERNAL_ERROR);
      expect(response.body).toEqual({
        error: 'Internal server error'
      });
      expect(response.body.message).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should use default status code for PlaywrightRunnerError', async () => {
      app.get('/test', () => {
        throw new PlaywrightRunnerError('Test error', ErrorCode.FILE_NOT_FOUND);
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HTTP_STATUS.INTERNAL_ERROR);
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 for unknown routes', async () => {
      app.use(notFoundHandler);

      const response = await request(app).get('/nonexistent');

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.body).toEqual({
        error: 'Not found',
        path: '/nonexistent'
      });
    });

    it('should return 404 with correct path', async () => {
      app.use(notFoundHandler);

      const response = await request(app).get('/api/unknown/endpoint');

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.body).toEqual({
        error: 'Not found',
        path: '/api/unknown/endpoint'
      });
    });
  });

  describe('createAppError', () => {
    it('should create PlaywrightRunnerError with all parameters', () => {
      const error = createAppError('Test error', ErrorCode.FILE_NOT_FOUND, 404);

      expect(error).toBeInstanceOf(PlaywrightRunnerError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('should use default status code when not provided', () => {
      const error = createAppError('Test error', ErrorCode.IO_ERROR);

      expect(error).toBeInstanceOf(PlaywrightRunnerError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('IO_ERROR');
      expect(error.statusCode).toBe(HTTP_STATUS.INTERNAL_ERROR);
    });

    it('should accept string error codes', () => {
      const error = createAppError('Custom error', 'CUSTOM_CODE', 403);

      expect(error).toBeInstanceOf(PlaywrightRunnerError);
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete request flow with validation', async () => {
      const bodySchema = z.object({ name: z.string(), age: z.number() });
      const querySchema = z.object({ verbose: z.enum(['true', 'false']).optional() });

      app.post(
        '/users/:id',
        validateParams(z.object({ id: z.string() })),
        validateQuery(querySchema),
        validateBody(bodySchema),
        asyncHandler(async (req, res) => {
          res.json({
            id: req.params.id,
            data: req.body,
            verbose: req.query.verbose
          });
        })
      );
      app.use(errorHandler);

      const response = await request(app)
        .post('/users/123?verbose=true')
        .send({ name: 'John', age: 25 });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toEqual({
        id: '123',
        data: { name: 'John', age: 25 },
        verbose: 'true'
      });
    });

    it('should handle validation errors in complete flow', async () => {
      const bodySchema = z.object({ email: z.string().email() });

      app.post(
        '/users',
        validateBody(bodySchema),
        asyncHandler(async (_req, res) => {
          res.json({ success: true });
        })
      );
      app.use(errorHandler);

      const response = await request(app)
        .post('/users')
        .send({ email: 'invalid-email' });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle async errors in complete flow', async () => {
      app.get(
        '/test',
        asyncHandler(async () => {
          throw new PlaywrightRunnerError('Not found', ErrorCode.NOT_FOUND, undefined, 404);
        })
      );
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.body).toEqual({
        error: 'Not found',
        code: 'NOT_FOUND'
      });
    });
  });
});
