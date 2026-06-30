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
  const anchor = await prisma.userLocation.update({ where: { id }, data: parsed.data });
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
