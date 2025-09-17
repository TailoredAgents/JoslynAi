import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { OpenAI } from "openai";
import QRCode from "qrcode";
import { orgIdFromRequest } from "../lib/child.js";

export default async function routes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/children/:id/profile/save", async (req, reply) => {
    const child_id = (req.params as any).id;
    const org_id = orgIdFromRequest(req as any);
    const profile = (req.body as any) || {};
    await (prisma as any).child_profile.upsert({
      where: { child_id },
      update: { profile_json: profile, org_id },
      create: { child_id, org_id, profile_json: profile },
    });
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>("/children/:id/profile/render", async (req, reply) => {
    const child_id = (req.params as any).id;
    const { lang1 = "en", lang2 = "es" } = (req.body as any) || {};
    const row = await (prisma as any).child_profile.findFirst({ where: { child_id } });
    if (!row) return reply.status(400).send({ error: "profile not found" });

    const profile = row.profile_json || {};
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    async function translateBlock(text: string, target: string) {
      if (!text) return "";
      const r = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL_MINI || "gpt-5-mini",
        messages: [ { role: "system", content: `Translate to ${target}` }, { role: "user", content: text } ],
        temperature: 0.2,
      });
      return r.choices?.[0]?.message?.content || text;
    }
    const fields = ["preferred_name","strengths","sensory_supports","meltdown_plan","communication","accommodations"];
    const en: Record<string, any> = {}; const other: Record<string, any> = {};
    for (const k of fields) {
      const v = profile[k];
      const text = Array.isArray(v) ? v.join("; ") : (v || "");
      en[k] = (lang1 === "en") ? text : await translateBlock(text, lang1);
      other[k] = (lang2 === "en") ? text : await translateBlock(text, lang2);
    }

    const PDFDocument = (await import("pdfkit" as any)).default;
    const fs = await import("node:fs");
    const tmp = (process.platform === 'win32' ? process.env.TEMP || 'C:/temp' : '/tmp') + `/${child_id}-profile.pdf`;
    const doc = new (PDFDocument as any)({ margin: 50 });
    const stream = (doc as any).pipe(fs.createWriteStream(tmp));
    (doc as any).fontSize(16).text("About My Child", { align: "center" });
    (doc as any).moveDown();
    (doc as any).fontSize(12).text(`${lang1.toUpperCase()}`, { underline: true });
    for (const k of fields) (doc as any).text(`${k}: ${en[k] || ''}`);
    (doc as any).moveDown();
    (doc as any).fontSize(12).text(`${lang2.toUpperCase()}`, { underline: true });
    for (const k of fields) (doc as any).text(`${k}: ${other[k] || ''}`);
    (doc as any).end();
    await new Promise((res) => stream.on("finish", res));

    const { putObject } = await import("../lib/s3");
    const pdfKey = `profiles/${child_id}.pdf`;
    const buf = fs.readFileSync(tmp);
    await putObject(pdfKey, buf, "application/pdf");

    // share link
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const org_id = orgIdFromRequest(req as any);
    await (prisma as any).share_links.create({ data: { org_id: org_id || "", resource_type: "profile", resource_id: child_id, token } });
    const base = process.env.PUBLIC_BASE_URL || "http://localhost:8080";
    const share_url = `${base}/share/${token}`;
    const qr_base64 = await QRCode.toDataURL(share_url);

    // audit event
    await (prisma as any).events.create({ data: { org_id: "demo-org", type: "profile_render", payload_json: { child_id, pdfKey } } });

    return reply.send({ pdf_uri: pdfKey, share_url, qr_base64 });
  });

  app.get<{ Params: { token: string } }>("/share/:token", async (req, reply) => {
    const token = (req.params as any).token;
    const link = await (prisma as any).share_links.findUnique({ where: { token } });
    if (!link) return reply.status(404).send({ error: "not found" });
    if (link.resource_type !== "profile") return reply.status(400).send({ error: "unsupported" });
    const prof = await (prisma as any).child_profile.findFirst({ where: { child_id: link.resource_id } });
    return reply.send(prof?.profile_json || {});
  });
}


