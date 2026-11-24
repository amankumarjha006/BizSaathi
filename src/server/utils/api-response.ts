import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export function jsonOk<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

export function jsonCreated<T>(data: T): NextResponse<ApiSuccessResponse<T>> {
  return jsonOk(data, 201);
}

export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.flatten(),
        },
        timestamp: new Date().toISOString(),
      },
      { status: 400 }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        timestamp: new Date().toISOString(),
      },
      { status: error.statusCode }
    );
  }

  console.error("[API Error]", error);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected server error occurred",
      },
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  );
}
