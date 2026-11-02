import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { WorkHoursPickerModal } from '../../../shared/ui/WorkHoursPickerModal';
import { WORK_SHIFTS, type WorkShift } from '../../bookings/engagementForm';

export function PublicWorkHoursFields({ hours, shift, shortTerm, disabled, error, onChange }: {
  hours: string;
  shift: WorkShift | null;
  shortTerm: boolean;
  disabled: boolean;
  error?: boolean;
  onChange: (hours: string, shift: WorkShift) => void;
}) {
  const { tr } = useLanguage();
  const [showPicker, setShowPicker] = useState(false);
  useEffect(() => { if (disabled) setShowPicker(false); }, [disabled]);

  return <View style={styles.section}>
    <Text style={styles.label}>{tr('Work hours')}</Text>
    {shortTerm && <View style={styles.shifts}>
      {WORK_SHIFTS.map(item => <Pressable key={item.value} accessibilityRole="button"
        accessibilityLabel={tr(item.label)} accessibilityState={{ selected: shift === item.value, disabled }}
        disabled={disabled} onPress={() => onChange(item.hours, item.value)}
        style={[styles.shift, shift === item.value && styles.selected]}>
        <Text style={styles.value}>{tr(item.label)}</Text>
        <Text style={styles.hint}>{item.hours}</Text>
      </Pressable>)}
    </View>}
    <Pressable accessibilityRole="button" accessibilityLabel={tr('Work hours')}
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => setShowPicker(true)}
      style={[styles.hours, error && styles.error]}>
      <Ionicons name="time-outline" size={19} color="#4B5563" />
      <Text style={styles.value}>{hours || tr('Choose your working hours before continuing.')}</Text>
      <Ionicons name="chevron-down" size={16} color="#4B5563" />
    </Pressable>
    <WorkHoursPickerModal visible={showPicker} currentValue={hours}
      onSelect={value => { onChange(value, 'custom'); setShowPicker(false); }}
      onClose={() => setShowPicker(false)} />
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  shifts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shift: { flexGrow: 1, padding: 10, borderRadius: 12, backgroundColor: '#FFFFFF', minHeight: 48 },
  selected: { backgroundColor: '#FFAB73' },
  value: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', flexShrink: 1 },
  hint: { fontSize: 11, color: '#4B5563', marginTop: 4 },
  hours: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, padding: 14,
    backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  error: { borderColor: '#EF4444' },
});
