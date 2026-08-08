import { Request, Response, NextFunction } from "express";

export function errorHandler(
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode =
    typeof error?.statusCode === "number"
      ? error.statusCode
      : 500;

  const message =
    typeof error?.message === "string"
      ? error.message
      : "internal_error";

  res.status(statusCode).json({
    error: message
  });
}