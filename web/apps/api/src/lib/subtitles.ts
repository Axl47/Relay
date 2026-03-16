type SubtitleFormat = "vtt" | "srt" | "ass";

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
  const cues: string[] = [];
  let inEvents = false;
  let formatFields: string[] | null = null;

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
    const text = stripAssStyling(values[textIndex] ?? "");
    if (!start || !end || !text) {
      continue;
    }

    cues.push(`${start} --> ${end}\n${text}`);
  }

  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function convertSubtitleToVtt(source: string, format: SubtitleFormat) {
  const normalized = normalizeNewlines(source);
  if (format === "vtt") {
    return normalized.startsWith("WEBVTT") ? normalized : `WEBVTT\n\n${normalized}`;
  }

  if (format === "srt") {
    return convertSrtToVtt(normalized);
  }

  return convertAssToVtt(normalized);
}
