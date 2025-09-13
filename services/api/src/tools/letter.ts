import { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import Mustache from "mustache";
import { prisma } from "../lib/db";
import { OpenAI } from "openai";

const TPL_DIR = path.join(process.cwd(), "packages/core/templates/letters");

function loadTemplate(kind: string) {
  const file = fs.readFileSync(path.join(TPL_DIR, `${kind}.md`), "utf8");
  const parsed = matter(file);
  return { meta: parsed.data as any, body: parsed.content };
}

export default async function routes(app: FastifyInstance) {
  app.post("/tools/letter/draft", async (req, reply) => {
    const { kind, merge_fields, lang = "en" } = (req.body as any);
    const { meta, body } = loadTemplate(kind);
    for (const f of (meta.required || [])) {
      if (merge_fields?.[f] == null) return reply.status(400).send({ error: `Missing field: ${f}` });
    }
    const draft = Mustache.render(body, merge_fields);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await (openai as any).responses.create({
      model: process.env.OPENAI_MODEL_MINI || "gpt-5-mini",
      input: [
        { role: "system", content: "You are a helpful assistant. Make the letter clear, concise, and polite." },
        { role: "user", content: `Language: ${lang}\nPolish this letter text, keep facts unchanged:\n\n${draft}` }
      ]
    } as any);
    const polished = (resp as any)?.output?.[0]?.content?.[0]?.text || draft;

    const row = await (prisma as any).letters.create({
      data: {
        child_id: merge_fields.child_id,
        kind,
        status: "draft",
        draft_json: { merge_fields, text: polished }
      }
    });

    return reply.send({ letter_id: row.id, text: polished });
  });

  app.post("/tools/letter/render", async (req, reply) => {
    const { requireEntitlement } = await import("../mw/entitlements");
    await requireEntitlement(req, reply, "letters.render");
    const { letter_id } = (req.body as any);
    const letter = await (prisma as any).letters.findUnique({ where: { id: letter_id } });
    if (!letter) return reply.status(404).send({ error: "letter not found" });

    const PDFDocument = (await import("pdfkit" as any)).default;
    const tmp = (process.platform === 'win32' ? process.env.TEMP || 'C:/temp' : '/tmp') + `/${letter_id}.pdf`;
    const fs2 = await import("node:fs");
    const doc = new (PDFDocument as any)({ margin: 50 });
    const stream = (doc as any).pipe(fs2.createWriteStream(tmp));
    (doc as any).fontSize(12).text(letter.draft_json.text, { align: "left" });
    (doc as any).end();
    await new Promise((res) => stream.on("finish", res));

    const { putObject } = await import("../lib/s3");
    await putObject(`letters/${letter_id}.pdf`, fs2.readFileSync(tmp), "application/pdf");

    await (prisma as any).letters.update({ where: { id: letter_id }, data: { pdf_uri: `letters/${letter_id}.pdf` } });
    return reply.send({ pdf_uri: `letters/${letter_id}.pdf` });
  });

  app.post("/tools/letter/send", async (req, reply) => {
    const { requireEntitlement } = await import("../mw/entitlements");
    await requireEntitlement(req, reply, "letters.send");
    const { letter_id, to, subject } = (req.body as any);
    const letter = await (prisma as any).letters.findUnique({ where: { id: letter_id } });
    if (!letter?.pdf_uri) return reply.status(400).send({ error: "render first" });

    const nodemailer = (await import("nodemailer" as any)).default;
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || "localhost",
      port: Number(process.env.MAIL_PORT || 1025),
      secure: false,
    });

    const { S3_BUCKET } = process.env as any;
    const link = `https://${(process.env.S3_ENDPOINT || '').replace(/^https?:\/\//,"")}/${S3_BUCKET}/${letter.pdf_uri}`;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || "no-reply@iep-ally.local",
      to, subject: subject || "IEP Letter",
      text: (letter as any).draft_json.text + `\n\nPDF: ${link}`,
      attachments: [{ filename: "letter.pdf", path: link }]
    });

    await (prisma as any).letters.update({ where: { id: letter_id }, data: { status: "sent", sent_via: "email", sent_at: new Date() } });
    await (prisma as any).events.create({ data: { org_id: (req as any).orgId || null, type: "letter_send", payload_json: { letter_id, to } } });
    return reply.send({ ok: true });
  });
}
