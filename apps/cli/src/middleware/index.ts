import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { PlaywrightRunnerError, ErrorCode } from '../types';
import { HTTP_STATUS } from '../constants';

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function validateBody<T>(schema: z.ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Validation failed',
        details: result.error.issues.map((issue: z.ZodIssue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: z.ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Validation failed',
        details: result.error.issues.map((issue: z.ZodIssue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
}

export function validateParams<T>(schema: z.ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Validation failed',
        details: result.error.issues.map((issue: z.ZodIssue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    req.params = result.data as typeof req.params;
    next();
  };
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof PlaywrightRunnerError) {
    const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
    res.status(statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err instanceof z.ZodError) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation failed',
      details: err.issues.map((issue: z.ZodIssue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  res.status(HTTP_STATUS.INTERNAL_ERROR).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: 'Not found',
    path: req.path,
  });
}

export function createAppError(
  message: string,
  code: ErrorCode | string,
  statusCode: number = HTTP_STATUS.INTERNAL_ERROR
): PlaywrightRunnerError {
  return new PlaywrightRunnerError(message, code, undefined, statusCode);
}
