import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export async function putObject(key: string, body: Buffer | Readable, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Body: body as any,
    ContentType: contentType,
  }));
  return { key };
}

