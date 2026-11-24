import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toggleService } from '../../bookings/engagementForm';
import {
  TESDA_NC2_DROPDOWN_OPTIONS,
  TESDA_NC2_HELPER_NOTE,
  TESDA_NOT_YET_CERTIFIED,
  applyTesdaCertSelection,
  getTesdaCertSelection,
  type WorkerDraft,
} from './workerCv';
import THEME from '../../../shared/theme/theme';

const STEP2_SERVICES = [
  { id: 'Cleaning', label: 'Cleaning' },
  { id: 'Child_care', label: 'Childcare' },
  { id: 'Cooking', label: 'Cooking' },
  { id: 'Caregiver', label: 'Caregiver' },
  { id: 'Laundry', label: 'Laundry' },
  { id: 'All-around', label: 'All-around' },
];

const STEP2_WORK_LOOKING_FOR = [
  { label: 'Part-time / Daily (1–7 days) · Stay-out (Goes home)', engagement: 'short_term', setup: 'stay_out' },
  { label: 'Part-time / Daily (1–7 days) · Stay-in (Live-in)', engagement: 'short_term', setup: 'stay_in' },
  { label: 'Full-time / Monthly (30+ days) · Stay-in (Live-in)', engagement: 'long_term', setup: 'stay_in' },
  { label: 'Full-time / Monthly (30+ days) · Stay-out (Goes home)', engagement: 'long_term', setup: 'stay_out' },
  { label: 'Both (Part-time & Full-time)', engagement: 'both', setup: 'either' },
];

const STEP2_LANGUAGES = ['Bisaya', 'Tagalog', 'English'];

const STEP2_HOUSEHOLD_WORK_BEFORE = [
  { label: 'First-time worker', id: 'new' },
  { label: 'In my household', id: 'household' },
  { label: 'Previous paid worker', id: 'paid' },
];

const STEP2_APPROXIMATE_EXPERIENCE = [
  { label: 'Less than 1 year', id: 'under_1' },
  { label: '1–3 years', id: '1_to_3' },
  { label: 'More than 3 years', id: 'over_3' },
];

const STEP2_PRACTICAL_SKILLS = [
  'Meal preparation',
  'Ironing',
  'Deep cleaning',
  'Infant care',
  'Child supervision',
  'Older adult assistance',
  'Laundry care',
  'Household organization',
];

const STEP2_CIVIL_STATUS = ['Single', 'Married', 'Widowed', 'Separated'];

const STEP2_EDUCATION = [
  'Elementary Graduate',
  'High School Graduate',
  'Senior High Graduate',
  'College / Vocational',
  'College Graduate',
];

const STEP2_NUMBER_OF_CHILDREN = [
  { label: 'None', value: '0' },
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3+', value: '3' },
];

type ActiveDropdown =
  | 'services'
  | 'workLookingFor'
  | 'languages'
  | 'householdWorkBefore'
  | 'approximateExperience'
  | 'practicalSkills'
  | 'education'
  | 'tesdaCert'
  | 'civilStatus'
  | 'numberOfChildren'
  | null;

interface Props {
  value: WorkerDraft;
  onChange: (value: WorkerDraft) => void;
  page?: number;
  disabled?: boolean;
}

export function WorkerCvForm({ value, onChange, disabled = false }: Props) {
  const { tr: uiText } = useUiLanguage();
  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
  const [tesdaNotYetSelected, setTesdaNotYetSelected] = useState(false);

  const toggleDropdown = (key: ActiveDropdown) => {
    if (disabled) return;
    setActiveDropdown((current) => (current === key ? null : key));
  };

  const setField = <K extends keyof WorkerDraft>(key: K, fieldValue: WorkerDraft[K]) => {
    onChange({ ...value, [key]: fieldValue });
  };

  // 1. Services Display Text
  const servicesDisplayText =
    value.service_categories && value.service_categories.length > 0
      ? value.service_categories
          .map((id) => STEP2_SERVICES.find((s) => s.id === id)?.label || id)
          .join(', ')
      : uiText('Choose all that apply');

  // 2. Work Looking For Display Text
  const matchedLookingFor = STEP2_WORK_LOOKING_FOR.find(
    (opt) => opt.engagement === value.engagement_preference && opt.setup === value.work_setup
  );
  const workLookingForDisplayText =
    matchedLookingFor?.label ||
    (value.engagement_preference === 'both' ? 'Both (Part-time & Full-time)' : '') ||
    uiText('Choose');

  const selectedTesdaCert = getTesdaCertSelection(value.training || []);
  const tesdaCertDisplayText =
    selectedTesdaCert || (tesdaNotYetSelected ? TESDA_NOT_YET_CERTIFIED : uiText('Choose'));

  // 5. Spoken Languages Display Text
  const languagesDisplayText =
    value.languages && value.languages.length > 0
      ? value.languages.join(', ')
      : uiText('Choose all that apply');

  // 6. Household Work Before Display Text
  const matchedHwBefore = STEP2_HOUSEHOLD_WORK_BEFORE.find((opt) => opt.id === value.experience_level);
  const hwBeforeDisplayText = matchedHwBefore?.label || uiText('Choose');

  // 7. Approximate Experience Display Text
  const matchedApproxExp = STEP2_APPROXIMATE_EXPERIENCE.find((opt) => opt.id === value.experience_duration);
  const approxExpDisplayText = matchedApproxExp?.label || uiText('Choose');

  // 8. Practical Skills Display Text
  const practicalSkillsDisplayText =
    value.practical_skills && value.practical_skills.length > 0
      ? value.practical_skills.join(', ')
      : uiText('Choose (Optional)');

  // 9. Civil Status Display Text
  const civilStatusDisplayText = value.civil_status || uiText('Choose');

  // 10. Number of Children Display Text
  const matchedChildren = STEP2_NUMBER_OF_CHILDREN.find((opt) => opt.value === String(value.number_of_children));
  const childrenDisplayText =
    matchedChildren?.label ||
    (value.number_of_children === '0'
      ? 'None'
      : value.number_of_children
      ? String(value.number_of_children)
      : uiText('Choose'));

  return (
    <View style={styles.formContainer}>
      {/* 1. SERVICES YOU OFFER */}
      <Text style={styles.fieldSubLabel}>{uiText('SERVICES YOU OFFER')}</Text>
      <Pressable
        disabled={disabled}
        style={styles.step2SelectButton}
        onPress={() => toggleDropdown('services')}
      >
        <Ionicons name="briefcase-outline" size={18} color="#1F2937" style={styles.inputIcon} />
        <Text
          style={[
            styles.step2SelectButtonText,
            servicesDisplayText === uiText('Choose all that apply') && styles.step2PlaceholderText,
          ]}
          numberOfLines={1}
        >
          {servicesDisplayText}
        </Text>
        <Ionicons
          name={activeDropdown === 'services' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </Pressable>
      {activeDropdown === 'services' && (
        <View style={styles.inlineDropdownMenu}>
          {STEP2_SERVICES.map((option) => {
            const isSelected = value.service_categories?.includes(option.id);
            return (
              <Pressable
                key={option.id}
                style={styles.inlineDropdownOption}
                onPress={() => {
                  const nextServices = toggleService(value.service_categories || [], option.id);
                  setField('service_categories', nextServices);
                }}
              >
                <Text
                  style={[
                    styles.inlineDropdownOptionText,
                    isSelected && styles.inlineDropdownOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={isSelected ? '#FFB380' : '#9CA3AF'}
                />
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 2. WORK YOU ARE LOOKING FOR */}
      <Text style={styles.fieldSubLabel}>{uiText('WORK YOU ARE LOOKING FOR')}</Text>
      <Pressable
        disabled={disabled}
        style={styles.step2SelectButton}
        onPress={() => toggleDropdown('workLookingFor')}
      >
        <Ionicons name="time-outline" size={18} color="#1F2937" style={styles.inputIcon} />
        <Text
          style={[
            styles.step2SelectButtonText,
            workLookingForDisplayText === uiText('Choose') && styles.step2PlaceholderText,
          ]}
          numberOfLines={1}
        >
          {workLookingForDisplayText}
        </Text>
        <Ionicons
          name={activeDropdown === 'workLookingFor' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </Pressable>
      {activeDropdown === 'workLookingFor' && (
        <View style={styles.inlineDropdownMenu}>
          {STEP2_WORK_LOOKING_FOR.map((option) => {
            const isSelected =
              value.engagement_preference === option.engagement && value.work_setup === option.setup;
            return (
              <Pressable
                key={option.label}
                style={[
                  styles.inlineDropdownOption,
                  isSelected && styles.inlineDropdownOptionSelected,
                ]}
                onPress={() => {
                  onChange({
                    ...value,
                    engagement_preference: option.engagement,
                    work_setup: option.setup,
                  });
                  setActiveDropdown(null);
                }}
              >
                <Text
                  style={[
                    styles.inlineDropdownOptionText,
                    isSelected && styles.inlineDropdownOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 3. EXPECTED MONTHLY SALARY */}
      <Text style={styles.fieldSubLabel}>{uiText('EXPECTED MONTHLY SALARY')}</Text>
      <View style={styles.step2SelectButton}>
        <Text style={styles.step2PesoSymbol}>₱</Text>
        <TextInput
          editable={!disabled}
          style={styles.step2Input}
          placeholder="e.g. ₱8000"
          placeholderTextColor="#6B7280"
          keyboardType="numeric"
          value={value.desired_monthly_rate}
          onChangeText={(text) => setField('desired_monthly_rate', text)}
        />
        <Text style={styles.step2SuffixText}>/ month</Text>
      </View>

      {/* 4. EXPECTED DAILY RATE */}
      <Text style={styles.fieldSubLabel}>{uiText('EXPECTED DAILY RATE')}</Text>
      <View style={styles.step2SelectButton}>
        <Text style={styles.step2PesoSymbol}>₱</Text>
        <TextInput
          editable={!disabled}
          style={styles.step2Input}
          placeholder="e.g. ₱800"
          placeholderTextColor="#6B7280"
          keyboardType="numeric"
          value={value.desired_daily_rate}
          onChangeText={(text) => setField('desired_daily_rate', text)}
        />
        <Text style={styles.step2SuffixText}>/ day</Text>
      </View>

      {/* 5. SPOKEN LANGUAGES */}
      <Text style={styles.fieldSubLabel}>{uiText('SPOKEN LANGUAGES')}</Text>
      <Pressable
        disabled={disabled}
        style={styles.step2SelectButton}
        onPress={() => toggleDropdown('languages')}
      >
        <Ionicons name="language-outline" size={18} color="#1F2937" style={styles.inputIcon} />
        <Text
          style={[
            styles.step2SelectButtonText,
            languagesDisplayText === uiText('Choose all that apply') && styles.step2PlaceholderText,
          ]}
          numberOfLines={1}
        >
          {languagesDisplayText}
        </Text>
        <Ionicons
          name={activeDropdown === 'languages' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </Pressable>
      {activeDropdown === 'languages' && (
        <View style={styles.inlineDropdownMenu}>
          {STEP2_LANGUAGES.map((lang) => {
            const isSelected = value.languages?.includes(lang);
            return (
              <Pressable
                key={lang}
                style={styles.inlineDropdownOption}
                onPress={() => {
                  const current = value.languages || [];
                  const next = current.includes(lang)
                    ? current.filter((l) => l !== lang)
                    : [...current, lang];
                  setField('languages', next);
                }}
              >
                <Text
                  style={[
                    styles.inlineDropdownOptionText,
                    isSelected && styles.inlineDropdownOptionTextSelected,
                  ]}
                >
                  {lang}
                </Text>
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={isSelected ? '#FFB380' : '#9CA3AF'}
                />
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 6. HOUSEHOLD WORK BEFORE */}
      <Text style={styles.fieldSubLabel}>{uiText('HOUSEHOLD WORK BEFORE')}</Text>
      <Pressable
        disabled={disabled}
        style={styles.step2SelectButton}
        onPress={() => toggleDropdown('householdWorkBefore')}
      >
        <Ionicons name="briefcase-outline" size={18} color="#1F2937" style={styles.inputIcon} />
        <Text
          style={[
            styles.step2SelectButtonText,
            hwBeforeDisplayText === uiText('Choose') && styles.step2PlaceholderText,
          ]}
          numberOfLines={1}
        >
          {hwBeforeDisplayText}
        </Text>
        <Ionicons
          name={activeDropdown === 'householdWorkBefore' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </Pressable>
      {activeDropdown === 'householdWorkBefore' && (
        <View style={styles.inlineDropdownMenu}>
          {STEP2_HOUSEHOLD_WORK_BEFORE.map((option) => {
            const isSelected = value.experience_level === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.inlineDropdownOption,
                  isSelected && styles.inlineDropdownOptionSelected,
                ]}
                onPress={() => {
                  setField('experience_level', option.id);
                  setActiveDropdown(null);
                }}
              >
                <Text
                  style={[
                    styles.inlineDropdownOptionText,
                    isSelected && styles.inlineDropdownOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 7. APPROXIMATE EXPERIENCE (hidden for first-time workers) */}
      {value.experience_level !== 'new' && (
        <>
          <Text style={styles.fieldSubLabel}>{uiText('APPROXIMATE EXPERIENCE')}</Text>
          <Pressable
            disabled={disabled}
            style={styles.step2SelectButton}
            onPress={() => toggleDropdown('approximateExperience')}
          >
            <Ionicons name="calendar-outline" size={18} color="#1F2937" style={styles.inputIcon} />
            <Text
              style={[
                styles.step2SelectButtonText,
                approxExpDisplayText === uiText('Choose') && styles.step2PlaceholderText,
              ]}
              numberOfLines={1}
            >
              {approxExpDisplayText}
            </Text>
            <Ionicons
              name={activeDropdown === 'approximateExperience' ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#6B7280"
            />
          </Pressable>
          {activeDropdown === 'approximateExperience' && (
            <View style={styles.inlineDropdownMenu}>
              {STEP2_APPROXIMATE_EXPERIENCE.map((option) => {
                const isSelected = value.experience_duration === option.id;
                return (
                  <Pressable
                    key={option.id}
                    style={[
                      styles.inlineDropdownOption,
                      isSelected && styles.inlineDropdownOptionSelected,
                    ]}
                    onPress={() => {
                      setField('experience_duration', option.id);
                      setActiveDropdown(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.inlineDropdownOptionText,
                        isSelected && styles.inlineDropdownOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* 8. PRACTICAL SKILLS */}
      <Text style={styles.fieldSubLabel}>{uiText('PRACTICAL SKILLS')}</Text>
      <Pressable
        disabled={disabled}
        style={styles.step2SelectButton}
        onPress={() => toggleDropdown('practicalSkills')}
      >
        <Ionicons name="barbell-outline" size={18} color="#1F2937" style={styles.inputIcon} />
        <Text
          style={[
            styles.step2SelectButtonText,
            practicalSkillsDisplayText === uiText('Choose (Optional)') && styles.step2PlaceholderText,
          ]}
          numberOfLines={1}
        >
          {practicalSkillsDisplayText}
        </Text>
        <Ionicons
          name={activeDropdown === 'practicalSkills' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </Pressable>
      {activeDropdown === 'practicalSkills' && (
        <View style={styles.inlineDropdownMenu}>
          {STEP2_PRACTICAL_SKILLS.map((skill) => {
            const isSelected = value.practical_skills?.includes(skill);
            return (
              <Pressable
                key={skill}
                style={styles.inlineDropdownOption}
                onPress={() => {
                  const current = value.practical_skills || [];
                  const next = current.includes(skill)
                    ? current.filter((s) => s !== skill)
                    : [...current, skill];
                  setField('practical_skills', next);
                }}
              >
                <Text
                  style={[
                    styles.inlineDropdownOptionText,
                    isSelected && styles.inlineDropdownOptionTextSelected,
                  ]}
                >
                  {skill}
                </Text>
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={isSelected ? '#FFB380' : '#9CA3AF'}
                />
              </Pressable>
            );
          })}
        </View>
      )}

      {/* HIGHEST EDUCATION */}
      <Text style={styles.fieldSubLabel}>{uiText('HIGHEST EDUCATION')}</Text>
      <Pressable
        disabled={disabled}
        style={styles.step2SelectButton}
        onPress={() => toggleDropdown('education')}
      >
        <Ionicons name="school-outline" size={18} color="#1F2937" style={styles.inputIcon} />
        <Text
          style={[
            styles.step2SelectButtonText,
            !value.education && styles.step2PlaceholderText,
          ]}
          numberOfLines={1}
        >
          {value.education || uiText('Choose')}
        </Text>
        <Ionicons
          name={activeDropdown === 'education' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </Pressable>
      {activeDropdown === 'education' && (
        <View style={styles.inlineDropdownMenu}>
          {STEP2_EDUCATION.map((edu) => {
            const isSelected = value.education === edu;
            return (
              <Pressable
                key={edu}
                style={[
                  styles.inlineDropdownOption,
                  isSelected && styles.inlineDropdownOptionSelected,
                ]}
                onPress={() => {
                  setField('education', edu);
                  setActiveDropdown(null);
                }}
              >
                <Text
                  style={[
                    styles.inlineDropdownOptionText,
                    isSelected && styles.inlineDropdownOptionTextSelected,
                  ]}
                >
                  {edu}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* TESDA NC II CERTIFICATION */}
      <Text style={styles.fieldSubLabel}>{uiText('TESDA NC II CERTIFICATION')}</Text>
      <Pressable
        disabled={disabled}
        style={[styles.step2SelectButton, { marginBottom: 6 }]}
        onPress={() => toggleDropdown('tesdaCert')}
      >
        <Ionicons name="ribbon-outline" size={18} color="#1F2937" style={styles.inputIcon} />
        <Text
          style={[
            styles.step2SelectButtonText,
            tesdaCertDisplayText === uiText('Choose') && styles.step2PlaceholderText,
          ]}
          numberOfLines={1}
        >
          {uiText(tesdaCertDisplayText)}
        </Text>
        <Ionicons
          name={activeDropdown === 'tesdaCert' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </Pressable>
      <Text style={styles.step2HelperText}>{uiText(TESDA_NC2_HELPER_NOTE)}</Text>
      {activeDropdown === 'tesdaCert' && (
        <View style={styles.inlineDropdownMenu}>
          {TESDA_NC2_DROPDOWN_OPTIONS.map((cert) => {
            const isSelected = tesdaCertDisplayText === cert;
            return (
              <Pressable
                key={cert}
                style={[
                  styles.inlineDropdownOption,
                  isSelected && styles.inlineDropdownOptionSelected,
                ]}
                onPress={() => {
                  setTesdaNotYetSelected(cert === TESDA_NOT_YET_CERTIFIED);
                  setField('training', applyTesdaCertSelection(value.training || [], cert));
                  setActiveDropdown(null);
                }}
              >
                <Text
                  style={[
                    styles.inlineDropdownOptionText,
                    isSelected && styles.inlineDropdownOptionTextSelected,
                  ]}
                >
                  {uiText(cert)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 9. CIVIL STATUS */}
      <Text style={styles.fieldSubLabel}>{uiText('CIVIL STATUS')}</Text>
      <Pressable
        disabled={disabled}
        style={styles.step2SelectButton}
        onPress={() => toggleDropdown('civilStatus')}
      >
        <Ionicons name="information-circle-outline" size={18} color="#1F2937" style={styles.inputIcon} />
        <Text
          style={[
            styles.step2SelectButtonText,
            civilStatusDisplayText === uiText('Choose') && styles.step2PlaceholderText,
          ]}
          numberOfLines={1}
        >
          {civilStatusDisplayText}
        </Text>
        <Ionicons
          name={activeDropdown === 'civilStatus' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </Pressable>
      {activeDropdown === 'civilStatus' && (
        <View style={styles.inlineDropdownMenu}>
          {STEP2_CIVIL_STATUS.map((status) => {
            const isSelected = value.civil_status === status;
            return (
              <Pressable
                key={status}
                style={[
                  styles.inlineDropdownOption,
                  isSelected && styles.inlineDropdownOptionSelected,
                ]}
                onPress={() => {
                  setField('civil_status', status);
                  setActiveDropdown(null);
                }}
              >
                <Text
                  style={[
                    styles.inlineDropdownOptionText,
                    isSelected && styles.inlineDropdownOptionTextSelected,
                  ]}
                >
                  {status}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 10. NUMBER OF CHILDREN */}
      <Text style={styles.fieldSubLabel}>{uiText('NUMBER OF CHILDREN')}</Text>
      <Pressable
        disabled={disabled}
        style={styles.step2SelectButton}
        onPress={() => toggleDropdown('numberOfChildren')}
      >
        <Ionicons name="happy-outline" size={18} color="#1F2937" style={styles.inputIcon} />
        <Text
          style={[
            styles.step2SelectButtonText,
            childrenDisplayText === uiText('Choose') && styles.step2PlaceholderText,
          ]}
          numberOfLines={1}
        >
          {childrenDisplayText}
        </Text>
        <Ionicons
          name={activeDropdown === 'numberOfChildren' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </Pressable>
      {activeDropdown === 'numberOfChildren' && (
        <View style={styles.inlineDropdownMenu}>
          {STEP2_NUMBER_OF_CHILDREN.map((opt) => {
            const isSelected = String(value.number_of_children) === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[
                  styles.inlineDropdownOption,
                  isSelected && styles.inlineDropdownOptionSelected,
                ]}
                onPress={() => {
                  setField('number_of_children', opt.value);
                  setActiveDropdown(null);
                }}
              >
                <Text
                  style={[
                    styles.inlineDropdownOptionText,
                    isSelected && styles.inlineDropdownOptionTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    paddingVertical: 10,
  },
  fieldSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 2,
    fontFamily: THEME.typography.fontFamily.mainBold,
  },
  step2SelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECECEC',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 48,
    marginBottom: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  step2SelectButtonText: {
    flex: 1,
    fontSize: 14,
    fontFamily: THEME.typography.fontFamily.mainMedium,
    color: '#111827',
  },
  step2PlaceholderText: {
    color: '#6B7280',
    fontFamily: THEME.typography.fontFamily.mainRegular,
  },
  step2HelperText: {
    fontSize: 11.5,
    color: '#6B7280',
    lineHeight: 16,
    marginBottom: 14,
    marginLeft: 2,
  },
  step2PesoSymbol: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0D0D11',
    marginRight: 8,
  },
  step2Input: {
    flex: 1,
    fontSize: 14,
    fontFamily: THEME.typography.fontFamily.mainRegular,
    color: '#111827',
    height: '100%',
    padding: 0,
  },
  step2SuffixText: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: THEME.typography.fontFamily.mainMedium,
    marginLeft: 8,
  },
  inlineDropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 6,
    marginBottom: 14,
    marginTop: -8,
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  inlineDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inlineDropdownOptionSelected: {
    backgroundColor: '#ECECEC',
  },
  inlineDropdownOptionText: {
    fontSize: 14,
    color: '#374151',
    fontFamily: THEME.typography.fontFamily.mainRegular,
  },
  inlineDropdownOptionTextSelected: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    color: '#0D0D11',
    fontWeight: '700',
  },
});
