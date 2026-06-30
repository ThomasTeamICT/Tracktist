import { NextResponse } from "next/server";
import { apiUser, notFound } from "@/lib/api";
import { resolveTicketLink } from "@/lib/tickets";

/**
 * GET /api/events/:id/ticket-link — affiliate-wrap the outgoing ticket link,
 * log the click server-side, then redirect (brief §8, §11).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(); // optional — anonymous clicks are still logged
  const { id } = await params;
  const result = await resolveTicketLink(id, user?.id);
  if (!result) return notFound("no ticket link for this event");
  return NextResponse.redirect(result.url, 302);
}
