type SubtitleFormat = "vtt" | "srt" | "ass";

type AssCue = {
  start: string;
  end: string;
  text: string;
  originalIndex: number;
  position: { x: number; y: number } | null;
};

function normalizeNewlines(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function padTimeSegment(value: number, size = 2) {
  return value.toString().padStart(size, "0");
}

function formatVttTimestamp(hours: number, minutes: number, seconds: number, milliseconds: number) {
  return `${padTimeSegment(hours)}:${padTimeSegment(minutes)}:${padTimeSegment(seconds)}.${padTimeSegment(milliseconds, 3)}`;
}

function srtTimestampToVtt(value: string) {
  return value.replace(",", ".");
}

function assTimestampToVtt(value: string) {
  const match = value.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds, centiseconds] = match;
  return formatVttTimestamp(
    Number.parseInt(hours, 10),
    Number.parseInt(minutes, 10),
    Number.parseInt(seconds, 10),
    Number.parseInt(centiseconds, 10) * 10,
  );
}

function stripAssStyling(value: string) {
  return value
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\N/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\h/g, " ")
    .replace(/\\\\/g, "\\")
    .trim();
}

function splitAssFields(value: string, count: number) {
  const fields: string[] = [];
  let remaining = value;

  for (let index = 0; index < count - 1; index += 1) {
    const commaIndex = remaining.indexOf(",");
    if (commaIndex === -1) {
      fields.push(remaining);
      while (fields.length < count) {
        fields.push("");
      }
      return fields;
    }

    fields.push(remaining.slice(0, commaIndex));
    remaining = remaining.slice(commaIndex + 1);
  }

  fields.push(remaining);
  return fields;
}

function parseAssResolution(lines: string[]) {
  let playResX = 1280;
  let playResY = 720;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(/^PlayRes([XY]):\s*(\d+)/i);
    if (!match) {
      continue;
    }

    const axis = match[1]?.toUpperCase();
    const value = Number.parseInt(match[2] ?? "", 10);
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }

    if (axis === "X") {
      playResX = value;
    } else if (axis === "Y") {
      playResY = value;
    }
  }

  return { playResX, playResY };
}

function extractAssPosition(value: string) {
  const match = value.match(/\\pos\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)/i);
  if (!match) {
    return null;
  }

  const x = Number.parseFloat(match[1] ?? "");
  const y = Number.parseFloat(match[2] ?? "");
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, value));
}

function buildAssCueSettings(
  position: AssCue["position"],
  resolution: ReturnType<typeof parseAssResolution>,
) {
  if (!position) {
    return "";
  }

  const line = clampPercentage((position.y / resolution.playResY) * 100);
  const cuePosition = clampPercentage((position.x / resolution.playResX) * 100);

  return ` line:${line.toFixed(1)}% position:${cuePosition.toFixed(1)}% align:middle size:100%`;
}

function assTimestampToMs(value: string) {
  const match = value.match(/^(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,2})$/);
  if (!match) {
    return Number.NaN;
  }

  const [, hours, minutes, seconds, centiseconds] = match;
  return (
    Number.parseInt(hours, 10) * 3_600_000 +
    Number.parseInt(minutes, 10) * 60_000 +
    Number.parseInt(seconds, 10) * 1_000 +
    Number.parseInt(centiseconds, 10) * 10
  );
}

function vttTimestampToMs(value: string) {
  const match = value.match(/^(\d+):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) {
    return Number.NaN;
  }

  const [, hours, minutes, seconds, milliseconds] = match;
  return (
    Number.parseInt(hours, 10) * 3_600_000 +
    Number.parseInt(minutes, 10) * 60_000 +
    Number.parseInt(seconds, 10) * 1_000 +
    Number.parseInt(milliseconds, 10)
  );
}

function convertSrtToVtt(source: string) {
  const blocks = normalizeNewlines(source).trim().split(/\n{2,}/);
  const cues: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    if (lines.length === 0) {
      continue;
    }

    const timestampIndex = lines.findIndex((line) => line.includes("-->"));
    if (timestampIndex === -1) {
      continue;
    }

    const timing = lines[timestampIndex]
      .split("-->")
      .map((part) => srtTimestampToVtt(part.trim()))
      .join(" --> ");
    const text = lines.slice(timestampIndex + 1).join("\n").trim();
    if (!text) {
      continue;
    }

    cues.push(`${timing}\n${text}`);
  }

  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

function convertAssToVtt(source: string) {
  const lines = normalizeNewlines(source).split("\n");
  const cues: AssCue[] = [];
  let inEvents = false;
  let formatFields: string[] | null = null;
  const resolution = parseAssResolution(lines);
  let originalIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^\[events\]$/i.test(line)) {
      inEvents = true;
      continue;
    }

    if (inEvents && /^\[.+\]$/.test(line)) {
      break;
    }

    if (!inEvents) {
      continue;
    }

    if (/^format:/i.test(line)) {
      formatFields = line
        .slice(line.indexOf(":") + 1)
        .split(",")
        .map((field) => field.trim().toLowerCase());
      continue;
    }

    if (!/^dialogue:/i.test(line) || !formatFields) {
      continue;
    }

    const values = splitAssFields(line.slice(line.indexOf(":") + 1).trim(), formatFields.length);
    const startIndex = formatFields.indexOf("start");
    const endIndex = formatFields.indexOf("end");
    const textIndex = formatFields.indexOf("text");
    if (startIndex === -1 || endIndex === -1 || textIndex === -1) {
      continue;
    }

    const start = assTimestampToVtt(values[startIndex] ?? "");
    const end = assTimestampToVtt(values[endIndex] ?? "");
    const rawText = values[textIndex] ?? "";
    const text = stripAssStyling(rawText);
    if (!start || !end || !text) {
      continue;
    }

    cues.push({
      start,
      end,
      text,
      originalIndex,
      position: extractAssPosition(rawText),
    });
    originalIndex += 1;
  }

  const orderedCues = cues.sort((left, right) => {
    const leftStartMs = vttTimestampToMs(left.start);
    const rightStartMs = vttTimestampToMs(right.start);
    if (leftStartMs !== rightStartMs) {
      return leftStartMs - rightStartMs;
    }

    const leftEndMs = vttTimestampToMs(left.end);
    const rightEndMs = vttTimestampToMs(right.end);
    if (leftEndMs !== rightEndMs) {
      return leftEndMs - rightEndMs;
    }

    if (left.position && right.position) {
      if (left.position.y !== right.position.y) {
        return right.position.y - left.position.y;
      }
      if (left.position.x !== right.position.x) {
        return left.position.x - right.position.x;
      }
    }

    return left.originalIndex - right.originalIndex;
  });

  return `WEBVTT\n\n${orderedCues
    .map(
      (cue) =>
        `${cue.start} --> ${cue.end}${buildAssCueSettings(cue.position, resolution)}\n${cue.text}`,
    )
    .join("\n\n")}\n`;
}

export function convertSubtitleToVtt(source: string, format: SubtitleFormat) {
  const normalized = normalizeNewlines(source);
  if (format === "vtt") {
    if (/^\s*\[script info\]/im.test(normalized) || /^\s*\[events\]/im.test(normalized)) {
      return convertAssToVtt(normalized);
    }

    if (/^\s*\d+\s*\n\s*\d{1,2}:\d{2}:\d{2},\d{3}\s*-->/m.test(normalized)) {
      return convertSrtToVtt(normalized);
    }
  }

  if (format === "vtt") {
    return normalized.startsWith("WEBVTT") ? normalized : `WEBVTT\n\n${normalized}`;
  }

  if (format === "srt") {
    return convertSrtToVtt(normalized);
  }

  return convertAssToVtt(normalized);
}
