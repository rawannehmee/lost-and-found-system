// s3.js - item photos on S3
// The server only signs URLs, the browser uploads/downloads directly.
// The bucket is private. On EC2 the SDK gets credentials from the instance
// role, no keys anywhere.

require("dotenv").config();
const crypto = require("node:crypto");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";

const UPLOAD_EXPIRY_SECONDS = 300;
const DOWNLOAD_EXPIRY_SECONDS = 3600;

const CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// keys we issue look like items/<uuid>.<ext>
const KEY_PATTERN = /^items\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const s3 = new S3Client({ region: REGION });

const isConfigured = () => Boolean(BUCKET);
const isValidContentType = (ct) => Object.hasOwn(CONTENT_TYPES, ct);
const isValidKey = (key) => typeof key === "string" && KEY_PATTERN.test(key);

async function presignUpload(contentType) {
  const key = `items/${crypto.randomUUID()}.${CONTENT_TYPES[contentType]}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const upload_url = await getSignedUrl(s3, command, { expiresIn: UPLOAD_EXPIRY_SECONDS });
  return { key, upload_url, expires_in: UPLOAD_EXPIRY_SECONDS };
}

async function presignDownload(key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: DOWNLOAD_EXPIRY_SECONDS });
}

async function deleteObject(key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.error(`S3 delete failed for ${key}:`, err.message);
  }
}

module.exports = { isConfigured, isValidContentType, isValidKey, presignUpload, presignDownload, deleteObject, CONTENT_TYPES };
