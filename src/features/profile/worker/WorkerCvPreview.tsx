import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import THEME from '../../../shared/theme/theme';
import type { WorkerCv } from '../api/workerCvApi';

/**
 * Professional two-column Curriculum Vitae preview matching the standard
 * executive/professional resume format (Image reference).
 */
export function WorkerCvPreview({ cv }: { cv: WorkerCv }) {
  const { tr: uiText } = useUiLanguage();
  const model = cv.presentation;
  const details = cv.details || {};

  const displayName = (cv.name || model?.name || 'Worker').trim();
  const servicesTitle = (model?.services || details.service_categories?.join(', ') || 'Household Worker').trim();
  const locationText = (cv.location || model?.location || 'Location not provided').trim();
  const phoneText = (cv.contact_number || model?.phone || '').trim();
  const isVerified = cv.verification_status === 'Verified' || Boolean(model?.verified);
  const activePhoto = cv.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=FFB43B&color=fff&size=150`;

  // Rates
  const dailyRate = details.desired_daily_rate ? `PHP ${Number(details.desired_daily_rate).toLocaleString()} / day` : null;
  const monthlyRate = details.desired_monthly_rate ? `PHP ${Number(details.desired_monthly_rate).toLocaleString()} / month` : null;

  // Work Setup & Engagement
  const workSetupLabel = details.work_setup === 'stay_in' ? 'Stay-in (Live-in)' : details.work_setup === 'stay_out' ? 'Stay-out (Goes home)' : details.work_setup === 'either' ? 'Either (Stay-in / Stay-out)' : 'Not provided';
  const engagementLabel = details.engagement_preference === 'short_term' ? 'Part-time / Daily' : details.engagement_preference === 'long_term' ? 'Full-time / Monthly' : details.engagement_preference === 'both' ? 'Both (Part-time & Full-time)' : 'Not provided';
  const availabilityText = details.available_from || 'Not provided';

  // Experience
  const expLevel = details.experience_level === 'new'
    ? 'First-time Worker'
    : details.experience_level === 'household'
    ? 'Household Experience'
    : details.experience_level === 'paid' ? 'Previous Paid Work' : 'Not provided';

  const expDuration = details.experience_duration === 'under_1'
    ? 'Less than 1 year of experience'
    : details.experience_duration === '1_to_3'
    ? '1–3 years of experience'
    : details.experience_duration === 'over_3' || details.experience_duration === '3+'
    ? '3+ years of experience'
    : (details.experience_level === 'new' ? 'First-time worker' : 'Not provided');

  const expSummary = details.experience_summary?.trim() || '';
  const profileNarrative = expSummary || 'No experience summary provided.';

  // Practical Skills
  const practicalSkills: string[] = (details.practical_skills && details.practical_skills.length > 0)
    ? details.practical_skills
    : [];

  // Languages
  const languagesList: string[] = cv.languages
    ? cv.languages.split(',').map(s => s.trim()).filter(Boolean)
    : (details.languages && details.languages.length > 0)
    ? details.languages
    : [];

  // Education & Training
  const educationText = details.education?.trim() || 'Not provided';
  const trainingList: Array<{ name: string; provider?: string; year?: string | number }> = details.training || [];

  // Family details
  const civilStatus = details.civil_status || 'Not provided';
  const childrenCount = details.number_of_children != null && details.number_of_children !== ''
    ? String(details.number_of_children)
    : 'Not provided';

  return (
    <View style={styles.sheet}>
      {/* HEADER: Profile Photo in Circle Frame & Big Bold Name + Role */}
      <View style={styles.headerRow}>
        <Image
          accessibilityLabel="Worker profile photo"
          source={{ uri: activePhoto }}
          style={styles.photo}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.nameText} numberOfLines={2}>
            {displayName.toUpperCase()}
          </Text>
          <Text style={styles.jobTitleText} numberOfLines={2}>
            {servicesTitle.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.headerDivider} />

      {/* TWO-COLUMN RESUME BODY */}
      <View style={styles.columnsContainer}>
        {/* LEFT COLUMN: Profile, Contact, Skills, Personal */}
        <View style={styles.leftColumn}>
          {/* PROFILE */}
          <Text style={styles.sectionHeading}>{uiText("PROFILE")}</Text>
          <Text style={styles.profileText}>
            {uiText(profileNarrative)}
          </Text>

          {/* CONTACT */}
          <Text style={styles.sectionHeading}>{uiText("CONTACT")}</Text>
          <View style={styles.contactList}>
            {phoneText ? (
              <View style={styles.contactItem}>
                <Ionicons name="call" size={11} color="#0D0D11" style={styles.contactIcon} />
                <Text style={styles.contactText}>{phoneText}</Text>
              </View>
            ) : null}
            <View style={styles.contactItem}>
              <Ionicons name="location-sharp" size={11} color="#0D0D11" style={styles.contactIcon} />
              <Text style={styles.contactText}>{locationText}</Text>
            </View>
          </View>

          {/* SKILLS with horizontal proficiency bars */}
          <Text style={styles.sectionHeading}>{uiText("SKILLS")}</Text>
          <View style={styles.skillsContainer}>
            {practicalSkills.slice(0, 6).map((skill, idx) => (
              <View key={`${skill}-${idx}`} style={styles.skillItem}>
                <Text style={styles.skillName} numberOfLines={1}>{skill}</Text>
                <View style={styles.skillBarTrack}>
                  <View style={[styles.skillBarFill, { width: `${80 + (idx % 3) * 8}%` }]} />
                </View>
              </View>
            ))}
          </View>

          {/* PERSONAL / FAMILY DETAILS */}
          {(details.share_family_details !== false) && (
            <View style={styles.personalSection}>
              <Text style={styles.sectionHeading}>{uiText("PERSONAL")}</Text>
              <Text style={styles.personalLine}>
                <Text style={styles.personalLabel}>{uiText("Civil Status: ")}</Text>
                {civilStatus}
              </Text>
              <Text style={styles.personalLine}>
                <Text style={styles.personalLabel}>{uiText("Children: ")}</Text>
                {childrenCount === '0' ? 'None' : childrenCount}
              </Text>
            </View>
          )}
        </View>

        {/* RIGHT COLUMN: Experience, Preferences, Education, Languages */}
        <View style={styles.rightColumn}>
          {/* PROFESSIONAL EXPERIENCE */}
          <Text style={styles.sectionHeading}>{uiText("PROFESSIONAL EXPERIENCE")}</Text>
          <View style={styles.experienceBlock}>
            <Text style={styles.experienceRoleTitle}>
              HOUSEHOLD WORKER | {expLevel.toUpperCase()}
            </Text>
            <Text style={styles.experienceDates}>
              {uiText("Experience duration: ")}{expDuration}
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>
                • {uiText("Specializes in")} {servicesTitle} {uiText("with dependable household care standards.")}
              </Text>
              <Text style={styles.bulletItem}>
                • {uiText("Maintains strict cleanliness, home safety, and respectful domestic etiquette.")}
              </Text>
              {expSummary ? (
                <Text style={styles.bulletItem}>
                  • {expSummary}
                </Text>
              ) : null}
            </View>
          </View>

          {/* WORK PREFERENCES & RATES */}
          <Text style={styles.sectionHeading}>{uiText("WORK PREFERENCES")}</Text>
          <View style={styles.preferencesBlock}>
            <Text style={styles.bulletItem}>
              • <Text style={styles.boldSnippet}>{uiText("Work setup: ")}</Text>{workSetupLabel}
            </Text>
            <Text style={styles.bulletItem}>
              • <Text style={styles.boldSnippet}>{uiText("Looking for: ")}</Text>{engagementLabel}
            </Text>
            {dailyRate && (
              <Text style={styles.bulletItem}>
                • <Text style={styles.boldSnippet}>{uiText("Expected Daily: ")}</Text>{dailyRate}
              </Text>
            )}
            {monthlyRate && (
              <Text style={styles.bulletItem}>
                • <Text style={styles.boldSnippet}>{uiText("Expected Monthly: ")}</Text>{monthlyRate}
              </Text>
            )}
          </View>

          {/* EDUCATION */}
          <Text style={styles.sectionHeading}>{uiText("EDUCATION")}</Text>
          <View style={styles.educationBlock}>
            <Text style={styles.bulletItem}>
              • {educationText}
            </Text>
            {trainingList.map((tr, idx) => (
              <Text key={`tr-${idx}`} style={styles.bulletItem}>
                • {tr.name}{tr.provider ? ` (${tr.provider})` : ''}{tr.year ? ` - ${tr.year}` : ''}
              </Text>
            ))}
          </View>

          {/* LANGUAGES */}
          <Text style={styles.sectionHeading}>{uiText("LANGUAGES")}</Text>
          <View style={styles.languagesBlock}>
            {languagesList.map((lang, idx) => (
              <Text key={`lang-${idx}`} style={styles.bulletItem}>
                • {lang}: {idx === 0 ? uiText("Fluent / Native") : uiText("Conversational")}
              </Text>
            ))}
          </View>

          {/* VERIFIED SERBISURE TRACK RECORD & REFERRALS */}
          {(cv.performance?.completed_jobs ?? 0) > 0 && (
            <>
              <Text style={styles.sectionHeading}>{uiText("VERIFIED SERBISURE TRACK RECORD")}</Text>
              <View style={styles.languagesBlock}>
                <Text style={styles.bulletItem}>
                  • {cv.performance.completed_jobs === 1
                    ? uiText('1 Completed Job')
                    : uiText('{count} Completed Jobs', { count: cv.performance.completed_jobs })}
                  {(cv.performance.recommended_count ?? 0) > 0
                    ? ` · ${cv.performance.recommended_count === 1
                      ? uiText('Recommended by 1 Homeowner')
                      : uiText('Recommended by {count} Homeowners', { count: cv.performance.recommended_count! })}`
                    : ''}
                </Text>
                {(cv.work_history || []).slice(0, 3).map((job) => {
                  const title = (job.service_labels || []).join(', ') || uiText('Household Service');
                  const term = job.booking_type === 'long_term' ? uiText('Full-time') : uiText('Part-time');
                  const parts = [title, term, job.area].filter(Boolean).join(' · ');
                  return (
                    <Text key={job.booking_id} style={styles.bulletItem}>
                      • {parts}{job.would_recommend ? ` (${uiText("Recommended by Homeowner")})` : ''}
                    </Text>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingVertical: 8,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
  },
  headerInfo: {
    flex: 1,
  },
  nameText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 22,
    fontWeight: '800',
    color: '#0D0D11',
    letterSpacing: 0.5,
    lineHeight: 28,
  },
  jobTitleText: {
    fontFamily: THEME.typography.fontFamily.secondary,
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    fontStyle: 'italic',
    marginTop: 3,
    letterSpacing: 0.3,
  },
  headerDivider: {
    height: 1.5,
    backgroundColor: '#E5E7EB',
    marginTop: 16,
    marginBottom: 16,
  },
  columnsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  leftColumn: {
    flex: 0.38,
  },
  rightColumn: {
    flex: 0.62,
    borderLeftWidth: 1,
    borderLeftColor: '#F3F4F6',
    paddingLeft: 14,
  },
  sectionHeading: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 12,
    fontWeight: '800',
    color: '#0D0D11',
    letterSpacing: 1.1,
    marginTop: 4,
    marginBottom: 6,
  },
  profileText: {
    fontFamily: THEME.typography.fontFamily.body,
    fontSize: 11,
    color: '#4B5563',
    lineHeight: 16,
    marginBottom: 12,
  },
  contactList: {
    gap: 5,
    marginBottom: 12,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contactIcon: {
    marginRight: 2,
  },
  contactText: {
    fontFamily: THEME.typography.fontFamily.secondaryMedium,
    fontSize: 11,
    color: '#374151',
    flexShrink: 1,
  },
  skillsContainer: {
    gap: 6,
    marginBottom: 12,
  },
  skillItem: {
    marginBottom: 2,
  },
  skillName: {
    fontFamily: THEME.typography.fontFamily.secondaryMedium,
    fontSize: 10.5,
    fontWeight: '600',
    color: '#1F2937',
  },
  skillBarTrack: {
    height: 5,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginTop: 3,
    overflow: 'hidden',
  },
  skillBarFill: {
    height: '100%',
    backgroundColor: '#1E1E1E',
    borderRadius: 3,
  },
  personalSection: {
    marginTop: 4,
  },
  personalLine: {
    fontFamily: THEME.typography.fontFamily.secondary,
    fontSize: 11,
    color: '#374151',
    lineHeight: 16,
  },
  personalLabel: {
    fontWeight: '700',
    color: '#111827',
  },
  experienceBlock: {
    marginBottom: 12,
  },
  experienceRoleTitle: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#111827',
  },
  experienceDates: {
    fontFamily: THEME.typography.fontFamily.secondary,
    fontSize: 10.5,
    color: '#6B7280',
    marginTop: 1,
    marginBottom: 5,
  },
  bulletList: {
    gap: 4,
  },
  bulletItem: {
    fontFamily: THEME.typography.fontFamily.body,
    fontSize: 11,
    color: '#374151',
    lineHeight: 16,
  },
  boldSnippet: {
    fontWeight: '700',
    color: '#111827',
  },
  preferencesBlock: {
    gap: 4,
    marginBottom: 12,
  },
  educationBlock: {
    gap: 4,
    marginBottom: 12,
  },
  languagesBlock: {
    gap: 4,
    marginBottom: 10,
  },
  sheetFooter: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    alignItems: 'center',
  },
  footerNotice: {
    fontFamily: THEME.typography.fontFamily.secondary,
    fontSize: 10,
    color: '#9CA3AF',
  },
});
