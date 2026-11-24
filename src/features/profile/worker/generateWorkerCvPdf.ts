import type { WorkerCv } from '../api/workerCvApi';

export interface GenerateCvPdfOptions {
  imageHex?: string | null;
  imageWidth?: number;
  imageHeight?: number;
  email?: string | null;
}

function escapePdf(str?: string): string {
  return String(str || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = String(text || '').split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function utf8ByteLength(str: string): number {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) len += 1;
    else if (code <= 0x7ff) len += 2;
    else if (code >= 0xd800 && code <= 0xdbff) { len += 4; i++; }
    else len += 3;
  }
  return len;
}

/**
 * Generates an executive A4 PDF (PDF 1.4) matching the on-screen SerbiSure CV.
 * Proportioned to fill the A4 canvas elegantly and includes profile avatar frame.
 */
export function generateWorkerCvPdf(cv: WorkerCv, options?: GenerateCvPdfOptions): string {
  const model = cv.presentation;
  const details = cv.details || {};

  const displayName = (cv.name || model?.name || 'Worker').trim().toUpperCase();
  const servicesTitle = (model?.services || details.service_categories?.join(', ') || 'Household Worker').trim().toUpperCase();
  const locationText = (cv.location || model?.location || 'Location not provided').trim();
  const phoneText = (cv.contact_number || model?.phone || '').trim();
  const emailText = (options?.email || cv.email || cv.details?.email || model?.email || '').trim();

  // Rates
  const dailyRate = details.desired_daily_rate ? `PHP ${Number(details.desired_daily_rate).toLocaleString()} / day` : null;
  const monthlyRate = details.desired_monthly_rate ? `PHP ${Number(details.desired_monthly_rate).toLocaleString()} / month` : null;

  // Work Setup & Engagement
  const workSetupLabel = details.work_setup === 'stay_in' ? 'Stay-in (Live-in)' : details.work_setup === 'stay_out' ? 'Stay-out (Goes home)' : details.work_setup === 'either' ? 'Either (Stay-in / Stay-out)' : 'Not provided';
  const engagementLabel = details.engagement_preference === 'short_term' ? 'Part-time / Daily' : details.engagement_preference === 'long_term' ? 'Full-time / Monthly' : details.engagement_preference === 'both' ? 'Both (Part-time & Full-time)' : 'Not provided';

  // Experience
  const expLevel = details.experience_level === 'new'
    ? 'First-time Worker'
    : details.experience_level === 'household'
    ? 'Household Experience'
    : details.experience_level === 'paid' ? 'Previous Paid Work' : 'Not provided';

  const expDuration = details.experience_duration === 'under_1'
    ? 'Less than 1 year of experience'
    : details.experience_duration === '1_to_3'
    ? '1-3 years of experience'
    : details.experience_duration === 'over_3' || details.experience_duration === '3+'
    ? '3+ years of experience'
    : (details.experience_level === 'new' ? 'First-time experience' : 'Not provided');

  const rawSummary = details.experience_summary?.trim() || '';
  const profileText = rawSummary || 'No experience summary provided.';

  // Skills
  const skills: string[] = (details.practical_skills && details.practical_skills.length > 0)
    ? details.practical_skills.slice(0, 6)
    : [];

  // Education & Training
  const educationText = details.education?.trim() || 'Not provided';
  const trainingList: Array<{ name: string; provider?: string; year?: string | number }> = details.training || [];

  // Languages
  const languages: string[] = cv.languages
    ? cv.languages.split(',').map(s => s.trim()).filter(Boolean)
    : (details.languages && details.languages.length > 0)
    ? details.languages
    : [];

  // Personal
  const civilStatus = details.civil_status || 'Not provided';
  const childrenCount = details.number_of_children != null && details.number_of_children !== ''
    ? String(details.number_of_children)
    : 'Not provided';

  // Worker initials for avatar fallback
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('') || 'W';

  let s = '';

  // 1. HEADER SECTION (No avatar, clean executive top layout)
  s += '0.05 0.05 0.07 rg\n';
  s += `BT /F2 22 Tf 42 764 Td (${escapePdf(displayName)}) Tj ET\n`;

  s += '0.40 0.40 0.45 rg\n';
  s += `BT /F3 12 Tf 42 745 Td (${escapePdf(servicesTitle)}) Tj ET\n`;

  s += '0.25 0.25 0.30 rg\n';
  const contactSnippet = [phoneText, emailText, locationText].filter(Boolean).join('   |   ');
  if (contactSnippet) {
    s += `BT /F1 9.5 Tf 42 727 Td (${escapePdf(contactSnippet)}) Tj ET\n`;
  }

  // Header horizontal divider line
  s += '0.85 0.85 0.88 RG 1.5 w 42 706 m 553 706 l S\n';

  // 2. TWO-COLUMN BODY LAYOUT (50/50 Split centered at X = 297.5)
  // LEFT COLUMN: X = 42, width = 242 (from 42 to 284)
  const leftX = 42;
  let yL = 680;

  // PROFILE Section
  s += '0.05 0.05 0.07 rg\n';
  s += `BT /F2 12 Tf ${leftX} ${yL} Td (PROFILE) Tj ET\n`;
  yL -= 18;
  s += '0.25 0.25 0.30 rg\n';
  for (const line of wrapText(profileText, 36)) {
    s += `BT /F1 10.5 Tf ${leftX} ${yL} Td (${escapePdf(line)}) Tj ET\n`;
    yL -= 15.5;
  }
  yL -= 22;

  // CONTACT Section
  s += '0.05 0.05 0.07 rg\n';
  s += `BT /F2 12 Tf ${leftX} ${yL} Td (CONTACT) Tj ET\n`;
  yL -= 18;
  s += '0.25 0.25 0.30 rg\n';
  if (phoneText) {
    s += `BT /F1 10.5 Tf ${leftX} ${yL} Td (${escapePdf(phoneText)}) Tj ET\n`;
    yL -= 16;
  }
  if (emailText) {
    for (const line of wrapText(emailText, 34)) {
      s += `BT /F1 10.5 Tf ${leftX} ${yL} Td (${escapePdf(line)}) Tj ET\n`;
      yL -= 16;
    }
  }
  for (const line of wrapText(locationText, 34)) {
    s += `BT /F1 10.5 Tf ${leftX} ${yL} Td (${escapePdf(line)}) Tj ET\n`;
    yL -= 16;
  }
  yL -= 22;

  // SKILLS Section
  s += '0.05 0.05 0.07 rg\n';
  s += `BT /F2 12 Tf ${leftX} ${yL} Td (SKILLS) Tj ET\n`;
  yL -= 20;
  for (let i = 0; i < skills.length; i++) {
    const sk = skills[i];
    s += '0.20 0.20 0.25 rg\n';
    s += `BT /F1 10.5 Tf ${leftX} ${yL} Td (${escapePdf(sk)}) Tj ET\n`;
    yL -= 7;
    // Proficiency bar background spanning the full left half column
    s += `0.90 0.90 0.92 rg ${leftX} ${yL} 230 5 re f\n`;
    // Proficiency fill
    const fillWidth = Math.round(155 + (i % 3) * 26);
    s += `0.15 0.15 0.18 rg ${leftX} ${yL} ${fillWidth} 5 re f\n`;
    yL -= 16;
  }
  yL -= 16;

  // PERSONAL Section
  s += '0.05 0.05 0.07 rg\n';
  s += `BT /F2 12 Tf ${leftX} ${yL} Td (PERSONAL) Tj ET\n`;
  yL -= 18;
  s += '0.25 0.25 0.30 rg\n';
  s += `BT /F1 10.5 Tf ${leftX} ${yL} Td (Civil Status: ${escapePdf(civilStatus)}) Tj ET\n`;
  yL -= 16;
  s += `BT /F1 10.5 Tf ${leftX} ${yL} Td (Children: ${escapePdf(childrenCount === '0' ? 'None' : childrenCount)}) Tj ET\n`;
  yL -= 16;
  s += `BT /F1 10.5 Tf ${leftX} ${yL} Td (SerbiSure Verified Worker) Tj ET\n`;

  // RIGHT COLUMN: X = 311, width = 242 (from 311 to 553)
  const rightX = 311;
  let yR = 680;

  // PROFESSIONAL EXPERIENCE Section
  s += '0.05 0.05 0.07 rg\n';
  s += `BT /F2 12 Tf ${rightX} ${yR} Td (PROFESSIONAL EXPERIENCE) Tj ET\n`;
  yR -= 18;
  s += '0.10 0.10 0.12 rg\n';
  s += `BT /F2 11 Tf ${rightX} ${yR} Td (HOUSEHOLD WORKER | ${escapePdf(expLevel.toUpperCase())}) Tj ET\n`;
  yR -= 16;
  s += '0.45 0.45 0.50 rg\n';
  s += `BT /F3 10 Tf ${rightX} ${yR} Td (Experience duration: ${escapePdf(expDuration)}) Tj ET\n`;
  yR -= 16;

  s += '0.25 0.25 0.30 rg\n';
  const bullet1 = `\\225 Specializes in ${servicesTitle} with dependable household care standards.`;
  for (const line of wrapText(bullet1, 36)) {
    s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (${escapePdf(line).replace(/\\\\225/g, '\\225')}) Tj ET\n`;
    yR -= 16;
  }
  const bullet2 = '\\225 Maintains strict cleanliness, home safety, and respectful domestic etiquette.';
  for (const line of wrapText(bullet2, 36)) {
    s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (${escapePdf(line).replace(/\\\\225/g, '\\225')}) Tj ET\n`;
    yR -= 16;
  }
  const bullet3 = '\\225 Reliable in household routines, time management, and family confidentiality.';
  for (const line of wrapText(bullet3, 36)) {
    s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (${escapePdf(line).replace(/\\\\225/g, '\\225')}) Tj ET\n`;
    yR -= 16;
  }
  yR -= 22;

  // WORK PREFERENCES Section
  s += '0.05 0.05 0.07 rg\n';
  s += `BT /F2 12 Tf ${rightX} ${yR} Td (WORK PREFERENCES) Tj ET\n`;
  yR -= 18;
  s += '0.25 0.25 0.30 rg\n';
  s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (\\225 Work setup: ${escapePdf(workSetupLabel)}) Tj ET\n`;
  yR -= 16;
  s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (\\225 Looking for: ${escapePdf(engagementLabel)}) Tj ET\n`;
  yR -= 16;
  if (dailyRate) {
    s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (\\225 Expected Daily: ${escapePdf(dailyRate)}) Tj ET\n`;
    yR -= 16;
  }
  if (monthlyRate) {
    s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (\\225 Expected Monthly: ${escapePdf(monthlyRate)}) Tj ET\n`;
    yR -= 16;
  }
  yR -= 22;

  // EDUCATION Section
  s += '0.05 0.05 0.07 rg\n';
  s += `BT /F2 12 Tf ${rightX} ${yR} Td (EDUCATION & TRAINING) Tj ET\n`;
  yR -= 18;
  s += '0.25 0.25 0.30 rg\n';
  s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (\\225 ${escapePdf(educationText)}) Tj ET\n`;
  yR -= 16;
  if (trainingList.length > 0) {
    for (const tr of trainingList) {
      const trText = `\\225 ${tr.name}${tr.provider ? ` (${tr.provider})` : ''}${tr.year ? ` - ${tr.year}` : ''}`;
      for (const line of wrapText(trText, 36)) {
        s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (${escapePdf(line).replace(/\\\\225/g, '\\225')}) Tj ET\n`;
        yR -= 16;
      }
    }
  } else {
    s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (\\225 SerbiSure Verified Safety & Domestic Care Standards) Tj ET\n`;
    yR -= 16;
  }
  yR -= 22;

  // LANGUAGES Section
  s += '0.05 0.05 0.07 rg\n';
  s += `BT /F2 12 Tf ${rightX} ${yR} Td (LANGUAGES) Tj ET\n`;
  yR -= 18;
  s += '0.25 0.25 0.30 rg\n';
  for (let idx = 0; idx < languages.length; idx++) {
    const lang = languages[idx];
    const fluency = idx === 0 ? 'Fluent / Native' : 'Conversational';
    s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (\\225 ${escapePdf(lang)}: ${escapePdf(fluency)}) Tj ET\n`;
    yR -= 16;
  }

  // VERIFIED SERBISURE TRACK RECORD (only when completed jobs exist)
  const completedJobs = cv.performance?.completed_jobs ?? 0;
  const recommendedCount = cv.performance?.recommended_count ?? 0;
  if (completedJobs > 0 && yR > 120) {
    yR -= 16;
    s += '0.05 0.05 0.07 rg\n';
    s += `BT /F2 12 Tf ${rightX} ${yR} Td (SERBISURE TRACK RECORD) Tj ET\n`;
    yR -= 18;
    s += '0.25 0.25 0.30 rg\n';
    const summaryLine = `\\225 ${completedJobs} Completed ${completedJobs === 1 ? 'Job' : 'Jobs'}${recommendedCount > 0 ? ` | Recommended by ${recommendedCount} ${recommendedCount === 1 ? 'Homeowner' : 'Homeowners'}` : ''}`;
    for (const line of wrapText(summaryLine, 36)) {
      if (yR <= 82) break;
      s += `BT /F1 10.5 Tf ${rightX} ${yR} Td (${escapePdf(line).replace(/\\\\225/g, '\\225')}) Tj ET\n`;
      yR -= 15;
    }
    for (const job of (cv.work_history || []).slice(0, 2)) {
      if (yR <= 82) break;
      const title = (job.service_labels || []).join(', ') || 'Household Service';
      const term = job.booking_type === 'long_term' ? 'Full-time' : 'Part-time';
      const lineText = `\\225 ${[title, term, job.area].filter(Boolean).join(' - ')}${job.would_recommend ? ' (Recommended)' : ''}`;
      for (const line of wrapText(lineText, 36)) {
        if (yR <= 82) break;
        s += `BT /F1 10 Tf ${rightX} ${yR} Td (${escapePdf(line).replace(/\\\\225/g, '\\225')}) Tj ET\n`;
        yR -= 14;
      }
    }
  }

  // Vertical column separator line (Exactly centered at 297.5 pt across the 511 pt printable area)
  s += '0.88 0.88 0.90 RG 1 w 297.5 690 m 297.5 75 l S\n';

  // SerbiSure Verified Footer
  s += '0.88 0.88 0.90 RG 1 w 42 62 m 553 62 l S\n';
  s += '0.55 0.55 0.60 rg\n';
  s += 'BT /F3 9 Tf 42 44 Td (SerbiSure Verified Curriculum Vitae) Tj ET\n';
  s += 'BT /F1 9 Tf 495 44 Td (Page 1 of 1) Tj ET\n';

  // Build PDF 1.4 objects
  const streamLength = utf8ByteLength(s);

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>\nendobj',
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${s}\nendstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj',
    '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\nendobj',
  ];

  let offset = 9; // length of "%PDF-1.4\n"
  const offsets: number[] = [];
  let body = '%PDF-1.4\n';
  for (const obj of objects) {
    offsets.push(offset);
    body += obj + '\n';
    offset += utf8ByteLength(obj) + 1;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) {
    xref += String(o).padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return body + xref + trailer;
}
