import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "./session.js";

/** Shared helpers for API route handlers (brief §11). */

export async function apiUser() {
  return getCurrentUser();
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
export const forbidden = (message = "forbidden") =>
  NextResponse.json({ error: message }, { status: 403 });
export const badRequest = (message: string) => NextResponse.json({ error: message }, { status: 400 });
export const notFound = (message = "not found") => NextResponse.json({ error: message }, { status: 404 });
export const serverError = (message = "internal error") =>
  NextResponse.json({ error: message }, { status: 500 });
