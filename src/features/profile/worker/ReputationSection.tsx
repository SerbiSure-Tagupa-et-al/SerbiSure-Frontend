import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { profileStyles as styles } from '../styles';
import type { ProfileController } from '../hooks/useProfile';

export function ReputationSection({ profile }: { profile: ProfileController }) {
  const { tr: uiText } = useUiLanguage();
  const {
    analyticsData,
    summary,
    positivePercentage,
  } = profile;
  const history = profile.workHistory?.summary;
  const recommendedCount = history?.recommended_count ?? 0;
  const jobsDone = analyticsData?.total_jobs_completed ?? history?.completed_jobs_count;
  const totalReviews = analyticsData?.total_reviews || profile.totalReviews || summary?.total_reviews || 0;
  const positive = analyticsData?.total_reviews ? analyticsData.positive_percentage : positivePercentage;
  return (<>
    {/* Reputation & Performance Section */}
    <View style={styles.sectionCard}>
      <View style={styles.sectionCardHeader}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text style={styles.sectionCardTitle}>{uiText("Reputation & Stats")}</Text>
        </View>
        <View style={profile.isVerified ? styles.statusBadgeSuccess : styles.statusBadgeNeutral}>
          <Ionicons name={profile.isVerified ? "shield-checkmark" : "information-circle-outline"} size={13} color={profile.isVerified ? "#10B981" : "#6B7280"} />
          <Text style={profile.isVerified ? styles.statusBadgeSuccessText : styles.statusBadgeNeutralText}>{uiText(profile.verificationLabel)}</Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricTile}>
          <Text style={styles.metricVal}>
            {analyticsData?.total_reviews ? analyticsData.average_rating.toFixed(1) : (summary?.total_reviews ? summary.average_rating.toFixed(1) : '—')}
          </Text>
          <View style={styles.metricLabelRow}>
            <Ionicons name="star" size={12} color="#F59E0B" style={{ marginRight: 3 }} />
            <Text style={styles.metricLabel}>{uiText("Rating")}</Text>
          </View>
        </View>

        <View style={styles.metricTile}>
          <Text style={styles.metricVal}>
            {jobsDone ?? '—'}
          </Text>
          <View style={styles.metricLabelRow}>
            <Text style={styles.metricLabel}>{uiText("Jobs Done")}</Text>
          </View>
        </View>

        <View style={styles.metricTile}>
          <Text style={styles.metricVal}>
            {totalReviews > 0 && positive != null ? `${positive}%` : '—'}
          </Text>
          <View style={styles.metricLabelRow}>
            <Text style={styles.metricLabel}>{uiText("Positive")}</Text>
          </View>
        </View>
      </View>
      {recommendedCount > 0 && (
        <View style={[styles.trustStripRow, { marginTop: 12, marginBottom: 0 }]}>
          <View style={[styles.trustPill, styles.trustPillReferral]}>
            <Ionicons name="thumbs-up" size={13} color="#15803D" />
            <Text style={[styles.trustPillText, styles.trustPillReferralText]}>
              {recommendedCount === 1
                ? uiText(profile.isWorker ? 'Recommended by 1 Homeowner' : 'Recommended by 1 Kasambahay')
                : uiText(profile.isWorker ? 'Recommended by {count} Homeowners' : 'Recommended by {count} Kasambahays', { count: recommendedCount })}
            </Text>
          </View>
        </View>
      )}
    </View>
  </>);
}
