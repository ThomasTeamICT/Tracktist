import { z } from "zod";
import { apiUser, badRequest, json, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  label: z.string().min(1).max(60).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
  radiusKm: z.number().int().min(1).max(5000).optional(),
  active: z.boolean().optional(),
});

async function owned(userId: string, id: string) {
  const a = await prisma.userLocation.findUnique({ where: { id } });
  return a && a.userId === userId ? a : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await owned(user.id, id))) return notFound();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("invalid update");
  const data = { ...parsed.data };
  // Coarse-location promise: store anchors at ~1 km precision (brief §14).
  if (data.latitude !== undefined) data.latitude = Math.round(data.latitude * 100) / 100;
  if (data.longitude !== undefined) data.longitude = Math.round(data.longitude * 100) / 100;
  const anchor = await prisma.userLocation.update({ where: { id }, data });
  return json({ anchor });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await owned(user.id, id))) return notFound();
  await prisma.userLocation.delete({ where: { id } });
  return json({ ok: true });
}
