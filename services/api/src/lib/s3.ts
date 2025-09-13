import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});
const Bucket = process.env.S3_BUCKET!;

export async function putObject(key: string, body: Buffer | Readable, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: body as any, ContentType: contentType }));
  return { key };
}

export async function signedGetUrl(key: string, ttlSec = 900) {
  const cmd = new GetObjectCommand({ Bucket, Key: key });
  return await getSignedUrl(s3, cmd, { expiresIn: ttlSec });
}
