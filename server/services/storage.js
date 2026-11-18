import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

dotenv.config();

const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './storage/uploads');

export const isS3Configured = Boolean(
  process.env.AWS_ENDPOINT_URL_S3 &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
);

export const S3_BUCKET = process.env.S3_BUCKET || 'assets';

const s3Client = isS3Configured
  ? new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

if (!isS3Configured && !fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

export const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.zip',
]);

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_ROOT);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeKey = `${uuidv4()}${ext}`;
    cb(null, safeKey);
  },
});

export const uploadMiddleware = multer({
  storage: isS3Configured ? multer.memoryStorage() : diskStorage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(
        new Error(
          `Unsupported file extension (${ext}). Allowed: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, PNG, JPG/JPEG, ZIP.`
        )
      );
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported MIME type (${file.mimetype}).`));
    }
    cb(null, true);
  },
});

export function resolveSafeStoragePath(storageKey) {
  const sanitized = path.basename(storageKey);
  const fullPath = path.resolve(UPLOAD_ROOT, sanitized);
  if (!fullPath.startsWith(UPLOAD_ROOT)) {
    throw new Error('Invalid storage key path');
  }
  return fullPath;
}

let bucketVerified = false;

async function ensureBucketExists() {
  if (!isS3Configured || !s3Client || bucketVerified) return;
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    bucketVerified = true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchBucket') {
      await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
      bucketVerified = true;
    } else {
      throw err;
    }
  }
}

export async function saveUploadedFile(file, prefix = 'uploads') {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const objectFileName = `${uuidv4()}${ext}`;

  if (isS3Configured && s3Client) {
    await ensureBucketExists();
    const key = `${prefix}/${objectFileName}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
      })
    );
    return {
      storageProvider: 'neon_s3',
      storageKey: key,
      storedName: objectFileName,
    };
  }

  return {
    storageProvider: 'local_object_store',
    storageKey: file.filename,
    storedName: file.filename,
  };
}

export async function getPresignedDownloadUrl(storageKey, expiresIn = 3600) {
  if (!isS3Configured || !s3Client) return null;
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: storageKey }),
    { expiresIn }
  );
}

export async function streamFileToResponse(record, res) {
  res.setHeader('Content-Type', record.mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(record.original_name)}"`
  );

  if (record.storage_provider === 'neon_s3' && s3Client) {
    const obj = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: record.storage_key,
      })
    );
    if (typeof obj.Body?.pipe === 'function') {
      obj.Body.pipe(res);
    } else {
      const bytes = await obj.Body.transformToByteArray();
      res.send(Buffer.from(bytes));
    }
    return;
  }

  const filePath = resolveSafeStoragePath(record.storage_key);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Stored file payload missing from object storage.' });
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

export async function deleteStoredFile(recordOrKey) {
  try {
    if (
      typeof recordOrKey === 'object' &&
      recordOrKey?.storage_provider === 'neon_s3' &&
      s3Client
    ) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: recordOrKey.storage_key,
        })
      );
      return;
    }

    const key = typeof recordOrKey === 'string' ? recordOrKey : recordOrKey?.storage_key;
    if (!key) return;
    const fullPath = resolveSafeStoragePath(key);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn('[Storage] Failed to delete object:', err.message);
  }
}
