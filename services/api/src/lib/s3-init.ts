import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

export async function ensureBucket() {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  const Bucket = process.env.S3_BUCKET!;
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket }));
    } catch {
      // ignore
    }
  }
}


