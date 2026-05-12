import { LogLevel } from './config';

export interface ParsedLine {
  timestamp: string;
  frame: string;
  category: string;
  level: LogLevel | undefined;
  message: string;
}

// Category matches any leading word (UEFN has categories without the
// "Log" prefix too, e.g. "VerseBuild", "Cmd", "LocalizationService").
const LINE_RE =
  /^\[([\d.\-:]+)\]\[(\s*\d+)\](\w+):\s*(?:(Verbose|VeryVerbose|Log|Display|Warning|Error|Fatal):\s*)?(.*)$/;

export function parseLine(line: string): ParsedLine | undefined {
  const m = LINE_RE.exec(line);
  if (!m) return undefined;
  const [, timestamp, frame, category, level, rawMessage] = m;
  // Verse Print() arrives as `LogVerse: : payload` — the stray ": " is noise
  // from UEFN's diagnostics formatter, strip it.
  const message = rawMessage.replace(/^:\s+/, '');
  return {
    timestamp,
    frame,
    category,
    level: level as LogLevel | undefined,
    message,
  };
}

export function matchesPrefix(category: string, allowed: Iterable<string>): boolean {
  for (const prefix of allowed) {
    if (category.startsWith(prefix)) return true;
  }
  return false;
}
