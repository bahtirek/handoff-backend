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

  if (statusCode >= 500) {
    console.error("Unhandled server error:", error);

    return res.status(500).json({
      error: "internal_error"
    });
  }

  const message =
    typeof error?.message === "string"
      ? error.message
      : "internal_error";

  return res.status(statusCode).json({
    error: message
  });
}