import { z } from "zod";
import { apiUser, badRequest, json, serverError, unauthorized } from "@/lib/api";
import { importFromText } from "@/lib/import";

const schema = z.object({ text: z.string().min(1) });

/** POST /api/import/csv — paste/CSV bulk import (brief §4.2, primary path). */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("text required");
  try {
    const outcome = await importFromText(user.id, parsed.data.text);
    return json({ outcome });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "import failed");
  }
}
