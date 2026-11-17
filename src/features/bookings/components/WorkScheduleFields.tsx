import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorkHoursPickerModal } from '../../../shared/ui/WorkHoursPickerModal';
import {
  bookingSchedule, calendarDaysBetween, dayForDate, earliestLongTermEnd, latestShortTermEnd,
  LONG_TERM_MINIMUM_MESSAGE, SHORT_TERM_MAX_DAYS, SHORT_TERM_MAXIMUM_MESSAGE,
  WORK_DAYS, WORK_SHIFTS, type WorkShift,
} from '../engagementForm';

const ACCENT_PEACH = '#FFAB73';

function outsideShortTermRange(startDate: string, endDate: string) {
  const span = calendarDaysBetween(startDate, endDate);
  return span < 0 || span > SHORT_TERM_MAX_DAYS;
}

interface Props {
  bookingType: 'short_term' | 'long_term';
  startDate: string;
  endDate: string;
  workHours: string;
  days: string[];
  shift: WorkShift | null;
  onStartDate: (value: string) => void;
  onEndDate: (value: string) => void;
  onWorkHours: (value: string) => void;
  onDays: (value: string[]) => void;
  onShift: (value: WorkShift) => void;
  onBookingType?: (value: 'short_term' | 'long_term') => void;
  ongoing?: boolean;
  onOngoing?: (value: boolean) => void;
  readOnly?: boolean;
  disabled?: boolean;
  errors?: Record<string, boolean>;
}

export function WorkScheduleFields(props: Props) {
  const { tr: uiText, formatDate } = useUiLanguage();
  const { bookingType, startDate, endDate, workHours, days, shift, readOnly = false, disabled = false, errors = {} } = props;
  const short = bookingType === 'short_term';
  const locked = readOnly || disabled;
  const ongoing = !short && !!props.ongoing;
  const availableDays = useMemo(() => {
    if (ongoing) return WORK_DAYS.map(day => day.value);
    if (!startDate || (!short && !endDate)) return null;
    try {
      const daySpan = calendarDaysBetween(startDate, endDate || startDate);
      if (daySpan < 0 || (short && daySpan > SHORT_TERM_MAX_DAYS)) return null;
      const span = Math.min(daySpan + 1, WORK_DAYS.length);
      const first = WORK_DAYS.findIndex(day => day.value === dayForDate(startDate));
      return Array.from({ length: span }, (_, offset) => WORK_DAYS[(first + offset) % 7]!.value);
    } catch {
      // Keep selections while the dates are incomplete or being corrected.
      return null;
    }
  }, [startDate, endDate, ongoing, short]);
  const earliestEnd = startDate ? (short ? startDate : earliestLongTermEnd(startDate)) : '';
  const earliestEndStamp = earliestEnd ? bookingSchedule(earliestEnd, '12:00 PM').iso : '';
  const latestEndStamp = short && startDate ? bookingSchedule(latestShortTermEnd(startDate), '12:00 PM').iso : '';
  const endDateUnavailable = ongoing || (short && !startDate);
  const [target, setTarget] = useState<'start' | 'end' | null>(null);
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [showTime, setShowTime] = useState(false);
  useEffect(() => { if (locked) { setTarget(null); setShowTime(false); } }, [locked]);
  useEffect(() => {
    if (!locked && short && startDate && endDate && outsideShortTermRange(startDate, endDate)) {
      props.onEndDate('');
    }
  }, [locked, short, startDate, endDate, props.onEndDate]);
  useEffect(() => {
    if (locked || !availableDays) return;
    const next = availableDays.length === 1
      ? [...availableDays]
      : days.filter(day => availableDays.some(value => value === day));
    if (next.length !== days.length || next.some((day, index) => day !== days[index])) {
      props.onDays(next);
    }
  }, [availableDays, days, locked, props.onDays]);

  const openDate = (field: 'start' | 'end') => {
    if (locked || (field === 'end' && endDateUnavailable)) return;
    const selected = field === 'start' ? startDate : endDate || earliestEnd || startDate;
    const todayPH = new Date(Date.now() + 8 * 3600000);
    const match = /^(\d{2})\/\d{2}\/(\d{4})$/.exec(selected);
    setMonth(match ? Number(match[1]) - 1 : todayPH.getUTCMonth());
    setYear(match ? Number(match[2]) : todayPH.getUTCFullYear());
    setTarget(field);
  };
  const navigate = (direction: number) => {
    const next = new Date(Date.UTC(year, month + direction, 1));
    setYear(next.getUTCFullYear()); setMonth(next.getUTCMonth());
  };
  const openTime = () => {
    if (locked) return;
    setShowTime(true);
  };
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();

  return (
    <View style={styles.container}>
      {/* 1. End Date Toggle (With an end date / No end date) */}
      {!short && props.onOngoing && (
        <View style={styles.durationRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !ongoing, disabled: locked }}
            disabled={locked}
            style={[styles.durationPill, !ongoing && styles.durationPillActive]}
            onPress={() => {
              if (ongoing) {
                props.onOngoing?.(false);
              }
            }}
          >
            <Text style={[styles.durationText, !ongoing && styles.durationTextActive]}>
              {uiText("With an end date")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: ongoing, disabled: locked }}
            disabled={locked}
            style={[styles.durationPill, ongoing && styles.durationPillActive]}
            onPress={() => {
              if (!ongoing) {
                props.onOngoing?.(true);
                props.onEndDate('');
              }
            }}
          >
            <Text style={[styles.durationText, ongoing && styles.durationTextActive]}>
              {uiText("No end date")}
            </Text>
          </Pressable>
        </View>
      )}

      {/* 2. Start Date to End Date */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>{uiText("START DATE TO END DATE")}</Text>
        <View style={styles.dateRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uiText(short ? 'Service date' : 'Start date')}
            disabled={locked}
            onPress={() => openDate('start')}
            style={[styles.dateCard, errors.startDate && styles.fieldError]}
          >
            <Text style={styles.dateSmallLabel}>{uiText("START")}</Text>
            <View style={styles.dateInnerRow}>
              <Ionicons name="calendar-outline" size={17} color="#1A1A1A" />
              <Text style={styles.dateValueText}>{startDate || 'MM/DD/YYYY'}</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uiText('End date')}
            disabled={locked || endDateUnavailable}
            onPress={() => openDate('end')}
            style={[styles.dateCard, endDateUnavailable && styles.dateCardDisabled, errors.endDate && styles.fieldError]}
          >
            <Text style={styles.dateSmallLabel}>{uiText("END")}</Text>
            <View style={styles.dateInnerRow}>
              <Ionicons name="calendar-outline" size={17} color={ongoing ? '#9CA3AF' : '#1A1A1A'} />
              <Text style={[styles.dateValueText, ongoing && styles.dateValuePlaceholder]}>
                {ongoing ? uiText("No end date") : (endDate || 'MM/DD/YYYY')}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>


      {/* 4. Work Hours */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>{uiText("WORK HOURS")}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={locked}
          onPress={openTime}
          style={[
            styles.workHoursCard,
            !!workHours && styles.workHoursCardActive,
            errors.workHours && styles.fieldError,
          ]}
        >
          <Ionicons name="hourglass-outline" size={19} color="#1A1A1A" />
          <Text style={[styles.workHoursText, !workHours && styles.workHoursPlaceholder]}>
            {workHours || uiText("Select daily working hours")}
          </Text>
        </Pressable>
      </View>

      {/* 5. Work Schedule (Days) */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>{uiText("WORK SCHEDULE")}</Text>
        <View style={styles.daysRow}>
          {WORK_DAYS.map(day => {
            const selected = days.includes(day.value);
            const dayDisabled = locked || (availableDays !== null && !availableDays.includes(day.value));
            return (
              <Pressable
                key={day.value}
                accessibilityRole="button"
                accessibilityLabel={uiText(day.label)}
                disabled={dayDisabled}
                accessibilityState={{ selected, disabled: dayDisabled }}
                onPress={() => {
                  if (dayDisabled || (availableDays?.length === 1 && selected)) return;
                  const nextDays = selected
                    ? days.filter(d => d !== day.value)
                    : [...days, day.value];
                  props.onDays(nextDays);
                }}
                style={[styles.dayPill, selected && styles.dayPillActive, errors.days && !dayDisabled && styles.fieldError, dayDisabled && styles.dayPillDisabled]}
              >
                <Text style={[styles.dayPillText, selected && styles.dayPillTextActive, dayDisabled && styles.dayPillTextDisabled]}>
                  {uiText(day.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Calendar Picker Modal */}
      <Modal visible={target !== null} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <Pressable style={styles.overlay} onPress={() => setTarget(null)}>
          <Pressable style={styles.picker} onPress={event => event.stopPropagation()}>
            <Text style={styles.title}>{uiText(target === 'end' ? 'End date' : short ? 'Service date' : 'Start date')}</Text>
            {target === 'end' && <Text style={styles.hint}>{uiText(short ? SHORT_TERM_MAXIMUM_MESSAGE : LONG_TERM_MINIMUM_MESSAGE)}</Text>}
            <View style={styles.navigation}>
              <Pressable accessibilityLabel={uiText('Previous month')} hitSlop={12} onPress={() => navigate(-1)}>
                <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
              </Pressable>
              <Text style={styles.value}>{formatDate(new Date(Date.UTC(year, month, 1, 4)), 'monthYear')}</Text>
              <Pressable accessibilityLabel={uiText('Next month')} hitSlop={12} onPress={() => navigate(1)}>
                <Ionicons name="chevron-forward" size={24} color="#1A1A1A" />
              </Pressable>
            </View>
            <View style={styles.grid}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <Text key={day} style={styles.weekday}>{uiText(day)}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {Array.from({ length: offset }, (_, index) => <View key={`blank-${index}`} style={styles.cell} />)}
              {Array.from({ length: dayCount }, (_, index) => {
                const date = `${String(month + 1).padStart(2, '0')}/${String(index + 1).padStart(2, '0')}/${year}`;
                const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
                const past = iso < today;
                const stamp = target === 'end' ? bookingSchedule(date, '12:00 PM').iso : '';
                const outsideEndRange = target === 'end' &&
                  ((earliestEndStamp && stamp < earliestEndStamp) || (latestEndStamp && stamp > latestEndStamp));
                const unavailable = past || Boolean(outsideEndRange);
                const isSelected = (target === 'end' ? endDate : startDate) === date;
                return (
                  <Pressable
                    key={date}
                    accessibilityState={{ disabled: unavailable }}
                    disabled={unavailable}
                    style={[styles.cell, isSelected && styles.selectedCell, unavailable && styles.muted]}
                    onPress={() => {
                      if (unavailable) return;
                      if (target === 'end') props.onEndDate(date);
                      else {
                        props.onStartDate(date);
                        if (short && (!endDate || outsideShortTermRange(date, endDate))) props.onEndDate(date);
                        else if (!short && endDate && bookingSchedule(endDate, '12:00 PM').iso < bookingSchedule(earliestLongTermEnd(date), '12:00 PM').iso) {
                          props.onEndDate('');
                        }
                      }
                      setTarget(null);
                    }}
                  >
                    <Text style={[styles.cellText, isSelected && styles.selectedCellText]}>{index + 1}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.closeBtn} onPress={() => setTarget(null)}>
              <Text style={styles.closeBtnText}>{uiText("Cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Time Picker Modal */}
      <WorkHoursPickerModal
        visible={showTime}
        currentValue={workHours}
        onSelect={val => {
          props.onWorkHours(val);
          if (short) props.onShift('custom');
          setShowTime(false);
        }}
        onClose={() => setShowTime(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  durationPill: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  durationPillActive: {
    backgroundColor: ACCENT_PEACH,
  },
  durationText: {
    color: '#1A1A1A',
    fontSize: 13.5,
    fontWeight: '600',
  },
  durationTextActive: {
    fontWeight: '800',
  },
  formGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.6,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  dateCardDisabled: {
    opacity: 0.6,
  },
  dateSmallLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#8E8E93',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  dateInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateValueText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  dateValuePlaceholder: {
    color: '#8E8E93',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  termPill: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  termPillActive: {
    backgroundColor: ACCENT_PEACH,
  },
  termText: {
    color: '#1A1A1A',
    fontSize: 13.5,
    fontWeight: '600',
  },
  termTextActive: {
    fontWeight: '800',
  },
  workHoursCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  workHoursCardActive: {
    borderColor: '#0D0D11',
  },
  workHoursText: {
    color: '#1A1A1A',
    fontSize: 13.5,
    fontWeight: '600',
  },
  workHoursPlaceholder: {
    color: '#9CA3AF',
    fontWeight: '400',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayPill: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  dayPillActive: {
    backgroundColor: ACCENT_PEACH,
  },
  dayPillDisabled: {
    backgroundColor: '#E5E7EB',
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  dayPillText: {
    color: '#1A1A1A',
    fontSize: 12.5,
    fontWeight: '600',
  },
  dayPillTextActive: {
    fontWeight: '800',
  },
  dayPillTextDisabled: {
    color: '#6B7280',
  },
  fieldError: {
    borderColor: '#EF4444',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  picker: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 22,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    color: '#1A1A1A',
  },
  hint: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 10,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  value: {
    color: '#1A1A1A',
    fontWeight: '700',
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  weekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    color: '#6B7280',
    paddingVertical: 8,
    fontWeight: '600',
  },
  cell: {
    width: '14.28%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  selectedCell: {
    backgroundColor: ACCENT_PEACH,
  },
  cellText: {
    fontSize: 13,
    color: '#1A1A1A',
    fontWeight: '600',
  },
  selectedCellText: {
    fontWeight: '800',
  },
  muted: {
    opacity: 0.25,
  },
  closeBtn: {
    alignItems: 'center',
    padding: 13,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: '#F6F5F2',
  },
  closeBtnText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '700',
  },
  saveTimeBtn: {
    alignItems: 'center',
    padding: 14,
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#111315',
  },
  saveTimeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  timeField: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F6F5F2',
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  periodBtn: {
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F6F5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodBtnActive: {
    backgroundColor: ACCENT_PEACH,
  },
  periodText: {
    color: '#1A1A1A',
    fontWeight: '700',
    fontSize: 13,
  },
  periodTextActive: {
    color: '#1A1A1A',
    fontWeight: '800',
  },
  error: {
    color: '#DC2626',
    marginTop: 8,
    fontSize: 12,
  },
});
