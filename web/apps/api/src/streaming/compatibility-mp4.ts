import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPlaybackRequestHeaders } from "./proxy";

export const compatibilityMp4CacheDir = path.join(os.tmpdir(), "relay-compat-mp4");
const COMPATIBILITY_MP4_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function buildFfmpegHeaderString(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join("");
}

export async function fileExists(filePath: string) {
  try {
    await access(filePath);
    const details = await stat(filePath);
    return details.isFile() && details.size > 0;
  } catch {
    return false;
  }
}

export async function ensureCompatibilityMp4CacheDir() {
  await mkdir(compatibilityMp4CacheDir, { recursive: true });
  void cleanupCompatibilityMp4Cache();
}

async function cleanupCompatibilityMp4Cache() {
  try {
    const entries = await readdir(compatibilityMp4CacheDir, { withFileTypes: true });
    const expirationCutoff = Date.now() - COMPATIBILITY_MP4_CACHE_TTL_MS;

    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const filePath = path.join(compatibilityMp4CacheDir, entry.name);
          const details = await stat(filePath).catch(() => null);
          if (!details || details.mtimeMs >= expirationCutoff) {
            return;
          }

          await rm(filePath, { force: true }).catch(() => undefined);
        }),
    );
  } catch {
    // Best-effort cache cleanup; playback should not fail because cleanup could not run.
  }
}

export function createCompatibilityMp4TranscodeJob(
  target: {
    providerId: string;
    upstreamUrl: string;
    headers: Record<string, string>;
    cookies: Record<string, string>;
  },
  outputPath: string,
  onLog: (message: string) => void,
) {
  const ffmpegHeaders = buildFfmpegHeaderString(buildPlaybackRequestHeaders(target));
  const tempOutputPath = `${outputPath}.tmp.mp4`;
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-nostdin",
      "-allowed_extensions",
      "ALL",
      "-extension_picky",
      "0",
      "-headers",
      ffmpegHeaders,
      "-i",
      target.upstreamUrl,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-dn",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-profile:a",
      "aac_low",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      tempOutputPath,
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_000);
  });

  return new Promise<string>((resolve, reject) => {
    ffmpeg.on("error", async (error) => {
      await rm(tempOutputPath, { force: true }).catch(() => undefined);
      reject(error);
    });

    ffmpeg.on("close", async (code) => {
      if (code === 0) {
        await rename(tempOutputPath, outputPath);
        resolve(outputPath);
        return;
      }

      onLog(
        `FFmpeg compatibility transcode failed for provider "${target.providerId}" with code ${code}. ${stderr.trim()}`.trim(),
      );
      await rm(tempOutputPath, { force: true }).catch(() => undefined);
      reject(new Error("Compatibility transcode failed."));
    });
  });
}

export function parseByteRange(rangeHeader: string, fileSize: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return null;
  }

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    const start = Math.max(0, fileSize - suffixLength);
    return { start, end: fileSize - 1 };
  }

  const start = Number.parseInt(rawStart, 10);
  const requestedEnd = rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd)) {
    return null;
  }

  if (start < 0 || start >= fileSize || requestedEnd < start) {
    return null;
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1),
  };
}
