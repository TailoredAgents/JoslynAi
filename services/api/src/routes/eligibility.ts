import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest } from "../lib/child.js";

export default async function routes(app: FastifyInstance) {
  app.post("/eligibility/screener", async (req, reply) => {
    const { child_age, diagnosis_docs, household_size, income_band, state } = (req.body as any);
    const programs: any[] = [];
    if (child_age <= 21) programs.push({ name: "Medicaid EPSDT", checklist: ["Proof of age", "Residency", "Income", "Medical need"] });
    if (diagnosis_docs) programs.push({ name: "State Waiver", checklist: ["Diagnosis", "Severity", "Residency"] });
    if (income_band === "low") programs.push({ name: "CHIP", checklist: ["Income", "Residency"] });
    return reply.send({ programs });
  });

  app.post("/tools/form-fill/prefill", async (req, reply) => {
    const { form_id, answers } = (req.body as any);
    const PDFDocument = (await import("pdfkit" as any)).default;
    const fs = await import("node:fs");
    const id = Math.random().toString(36).slice(2);
    const tmp = (process.platform === 'win32' ? process.env.TEMP || 'C:/temp' : '/tmp') + `/${id}.pdf`;
    const doc = new (PDFDocument as any)({ margin: 50 });
    const stream = (doc as any).pipe(fs.createWriteStream(tmp));
    (doc as any).fontSize(14).text(`Form: ${form_id}`);
    (doc as any).moveDown();
    for (const k of Object.keys(answers || {})) (doc as any).text(`${k}: ${answers[k]}`);
    (doc as any).end();
    await new Promise((res) => stream.on("finish", res));
    const { putObject } = await import("../lib/s3.js");
    const orgId = orgIdFromRequest(req as any);
    const pdfKey = `org/${orgId}/forms/${id}.pdf`;
    const buf = fs.readFileSync(tmp);
    await putObject(pdfKey, buf, "application/pdf");
    return reply.send({ pdf_uri: pdfKey });
  });
}



