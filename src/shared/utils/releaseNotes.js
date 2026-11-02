// Shared by the app and release automation. Questionable notes are omitted,
// never shown as raw developer text. No markdown/HTML renderer is involved.
const DEFAULT_RELEASE_NOTE = 'General improvements and bug fixes to make SerbiSure run smoother.';

function sanitizeReleaseNotes(value) {
  if (typeof value !== 'string') return [DEFAULT_RELEASE_NOTE];
  const lines = value.slice(0, 12000).replace(/```[\s\S]*?(?:```|$)/g, '').split(/\r?\n/);
  const notes = [];
  for (let line of lines) {
    if (/full\s+changelog|what['’]?s\s+changed|what['’]?s\s+new|contributors?/i.test(line)) continue;
    if (/[a-z0-9]_[a-z0-9]/i.test(line)) continue;
    line = line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
      .replace(/\b(?:github\.com|gitlab\.com)\S*/gi, '')
      .replace(/@\w[\w-]*/g, '')
      .replace(/\b(?:PR|pull request)\s*#?\d+\b/gi, '')
      .replace(/#\d+\b/g, '')
      .replace(/\b[a-f\d]{7,40}\b/gi, '')
      .replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '')
      .replace(/^(?:feat|fix|perf|refactor|build|chore|ci|docs|test|style)(?:\([^)]*\))?!?:\s*/i, '')
      .replace(/[*_#~]/g, '')
      .replace(/\s+by\s*(?:in\s*)?$/i, '')
      .replace(/\s+in\s*$/i, '')
      .replace(/\s+/g, ' ').trim();
    // Reject code, filenames, links, identifiers and developer terminology that
    // survived cleanup. The friendly default is safer than a damaged sentence.
    if (/\b(?:github|gitlab|changelog|commit|pull request|repository|repo|frontend|backend|api|apk|sdk|uuid|ota|runtime|serializer|migration|dependency|dependencies|workflow|typescript|javascript|django|react|expo|groq|version|permission|install|ci\/cd)\b/i.test(line)
      || /(?:\b\w+\.(?:tsx?|jsx?|cjs|json|py|yml|yaml|md)\b|[{}<>`@=:;\/\\]|\b\d+\.\d+\.\d+\b)/i.test(line)
      || /\b\S+\.(?:com|net|org|dev|io|app|tech)\b/i.test(line)
      || /\b[A-Za-z0-9]{24,}\b/.test(line)
      || /\b[a-z]+[A-Z][A-Za-z0-9]*\b/.test(line.replace(/SerbiSure/g, 'Serbisure'))
      || !/^[A-Za-z][A-Za-z0-9\s.,!?'’()–—-]*$/.test(line)
      || line.length < 15 || line.length > 160 || line.split(' ').length < 3) continue;
    if (!notes.includes(line)) notes.push(line);
    if (notes.length === 3) break;
  }
  return notes.length ? notes : [DEFAULT_RELEASE_NOTE];
}

module.exports = { sanitizeReleaseNotes, DEFAULT_RELEASE_NOTE };
