import { z } from "zod";
import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { setFollowPreferences } from "@/lib/follow";

const schema = z.object({
  priority: z.enum(["low", "normal", "high", "must_see"]).optional(),
  mode: z
    .enum([
      "always",
      "within_distance",
      "only_countries",
      "only_new_tours",
      "only_with_tickets",
      "dashboard_only",
    ])
    .optional(),
  countryCodes: z.array(z.string().length(2)).optional(),
});

/** PATCH /api/user-artists/:id/preferences — `:id` is the artist id (brief §11). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("invalid preferences");
  await setFollowPreferences(user.id, id, parsed.data);
  return json({ ok: true });
}
