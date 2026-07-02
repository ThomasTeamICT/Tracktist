import { z } from "zod";
import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  label: z.string().min(1).max(60),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  radiusKm: z.number().int().min(1).max(5000).default(150),
  active: z.boolean().default(true),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const dynamic = "force-dynamic";

/**
 * Coarse-location promise (brief §14 + the copy on the login page): anchors
 * are stored at ~1 km precision (2 decimals). Distance maths at radius scale
 * (25–5000 km) is unaffected.
 */
function coarsen(coord: number): number {
  return Math.round(coord * 100) / 100;
}

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const anchors = await prisma.userLocation.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return json({ anchors });
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("invalid location");
  const d = parsed.data;
  const anchor = await prisma.userLocation.create({
    data: {
      userId: user.id,
      label: d.label,
      latitude: coarsen(d.latitude),
      longitude: coarsen(d.longitude),
      city: d.city ?? null,
      country: d.country ?? null,
      countryCode: d.countryCode ?? null,
      radiusKm: d.radiusKm,
      active: d.active,
      startDate: d.startDate ? new Date(d.startDate) : null,
      endDate: d.endDate ? new Date(d.endDate) : null,
    },
  });
  return json({ anchor }, { status: 201 });
}
