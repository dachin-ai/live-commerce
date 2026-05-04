import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 打印详细错误日志，线上环境可结合 Winston 或 Sentry
  console.error(`[Error Handler] ${req.method} ${req.originalUrl}:`, err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }

  // 针对某些已知库的异常（例如 JWT, SQLite）可以做特殊处理
  if (err.name === 'UnauthorizedError') { // express-jwt 的默认错误
    return res.status(401).json({
      error: 'Invalid or missing token',
      code: 'UNAUTHORIZED_TOKEN',
    });
  }

  // 默认兜底 500
  return res.status(500).json({
    error: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};
