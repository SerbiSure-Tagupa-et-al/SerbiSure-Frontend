/** Daily availability for an advertisement, without calendar/contract terms. */
export function publicPostHours(hours: string) {
  if (!hours.trim()) throw new Error('Choose your working hours before continuing.');
  const clocks = hours.split(/\s*[-–]\s*/);
  const parse = (value: string | undefined) => {
    const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value?.trim() || '');
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) {
      throw new Error('Select valid working hours.');
    }
    const hour = Number(match[1]) % 12 + (match[3]?.toUpperCase() === 'PM' ? 12 : 0);
    return `${String(hour).padStart(2, '0')}:${match[2]}:00`;
  };
  if (clocks.length !== 2) throw new Error('Select valid working hours.');
  const start = parse(clocks[0]);
  const end = parse(clocks[1]);
  if (start >= end) throw new Error('Daily work hours must end after they start.');
  return { daily_start_time: start, daily_end_time: end };
}
