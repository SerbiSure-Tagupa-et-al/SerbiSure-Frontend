import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { Text, View, Pressable, Switch } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { type Language } from '../../../shared/localization/LanguageContext';

import { profileStyles as styles } from '../styles';
import type { ProfileController } from '../hooks/useProfile';
import { SettingsRow } from '../components/SettingsRow';

export function SettingsSection({ profile }: { profile: ProfileController }) {
  const { tr: uiText } = useUiLanguage();
  const {
    language,
    setLanguage,
    t,
    setCurrentView,
    isLanguageExpanded,
    setIsLanguageExpanded,
    setIsVerificationModalVisible,
    setIsPasswordModalVisible,
    setIsAboutUsModalVisible,
    setIsPrivacyPolicyModalVisible,
    setIsTermsModalVisible,
    setIsManageSocialLinksModalVisible,
    showContactNumber,
    isUpdatingPrivacy,
    effectiveVerificationStatus,
    renewalRequired,
    renewalPending,
    handleToggleContactPrivacy,
  } = profile;
  return (<>
    {/* Group 1: ACCOUNT */}
    <Text style={styles.groupHeaderLabel}>{uiText("ACCOUNT")}</Text>
    <View style={styles.groupCard}>
      <View
        ref={profile.personalInfoTargetRef}
        collapsable={false}
        onLayout={() => profile.onTutorialTargetsLayout?.()}
      >
        <SettingsRow
          icon="person"
          title={t.personalInfo}
          onPress={() => setCurrentView('personal_info')}
        />
      </View>
      <View style={styles.rowDivider} />
      <View
        ref={profile.getVerifiedTargetRef}
        collapsable={false}
        onLayout={() => profile.onTutorialTargetsLayout?.()}
      >
        <SettingsRow
          icon="shield-checkmark"
          title={t.getVerified}
          rightComponent={
            <View style={styles.verificationRowRight}>
              <View
                style={[
                  styles.verificationStatusPill,
                  effectiveVerificationStatus === 'Verified' && styles.verificationPillVerified,
                  (effectiveVerificationStatus === 'Pending' || renewalRequired) && styles.verificationPillPending,
                  effectiveVerificationStatus === 'Rejected' && !renewalRequired && styles.verificationPillRejected,
                ]}
              >
                <Text
                  style={[
                    styles.verificationStatusPillText,
                    effectiveVerificationStatus === 'Verified' && styles.verificationPillTextVerified,
                    (effectiveVerificationStatus === 'Pending' || renewalRequired) && styles.verificationPillTextPending,
                    effectiveVerificationStatus === 'Rejected' && !renewalRequired && styles.verificationPillTextRejected,
                  ]}
                >
                  {uiText(
                    renewalRequired ? 'Renewal needed' : renewalPending ? 'Renewal under review' : effectiveVerificationStatus === 'Verified'
                      ? 'Verified'
                      : effectiveVerificationStatus === 'Pending'
                        ? 'Pending'
                        : effectiveVerificationStatus === 'Rejected'
                          ? 'Action Needed'
                          : 'Unverified'
                  )}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </View>
          }
          onPress={() => setIsVerificationModalVisible(true)}
        />
      </View>
      <View style={styles.rowDivider} />
      <SettingsRow
        icon="lock-closed"
        title={t.passwordsSecurity}
        onPress={() => setIsPasswordModalVisible(true)}
      />
      <View style={styles.rowDivider} />
      <SettingsRow
        icon="share-social"
        title={uiText("Tags & Socials")}
        onPress={() => setIsManageSocialLinksModalVisible(true)}
      />
    </View>

    {/* Group 2: PREFERENCES */}
    <Text style={styles.groupHeaderLabel}>{uiText("PREFERENCES")}</Text>
    <View style={[styles.groupCard, isLanguageExpanded ? { zIndex: 9999, elevation: 9999 } : { zIndex: 2, elevation: 0 }]}>
      <SettingsRow
        icon={showContactNumber ? 'eye' : 'eye-off'}
        title={uiText("Show Contact Number")}
        rightComponent={
          <Switch
            value={showContactNumber}
            onValueChange={handleToggleContactPrivacy}
            trackColor={{ false: '#E5E7EB', true: '#FFB380' }}
            thumbColor={showContactNumber ? '#0D0D11' : '#9CA3AF'}
            disabled={isUpdatingPrivacy}
          />
        }
        onPress={() => handleToggleContactPrivacy(!showContactNumber)}
      />
      <View style={styles.rowDivider} />
      <SettingsRow
        icon="globe"
        title={t.language}
        zIndex={isLanguageExpanded ? 9999 : 1}
        rightComponent={
          <View style={{ position: 'relative', zIndex: 9999 }}>
            <Pressable
              style={styles.languagePillSelector}
              onPress={() => setIsLanguageExpanded(!isLanguageExpanded)}
            >
              <Text style={styles.languagePillText}>{language === 'Cebuano' ? 'Bisaya' : language}</Text>
              <Ionicons name={isLanguageExpanded ? 'chevron-up' : 'chevron-down'} size={13} color="#0D0D11" />
            </Pressable>

            {isLanguageExpanded && (
              <View style={styles.floatingPillDropdown}>
                {(['English', 'Tagalog', 'Bisaya'] as Language[]).map((lang) => (
                  <Pressable
                    key={lang}
                    style={[
                      styles.floatingPillRow,
                      (language === lang || (lang === 'Bisaya' && language === 'Cebuano')) && styles.floatingPillRowActive,
                    ]}
                    onPress={() => {
                      setLanguage(lang);
                      setIsLanguageExpanded(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.floatingPillText,
                        (language === lang || (lang === 'Bisaya' && language === 'Cebuano')) && styles.floatingPillTextActive,
                      ]}
                    >
                      {lang}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        }
        onPress={() => setIsLanguageExpanded(!isLanguageExpanded)}
      />
    </View>

    {/* Group 3: SUPPORT & LEGAL */}
    <Text style={styles.groupHeaderLabel}>{uiText("SUPPORT & LEGAL")}</Text>
    <View style={[styles.groupCard, { zIndex: 1, elevation: 0 }]}>
      <SettingsRow
        icon="compass-outline"
        title={uiText("App Tutorial")}
        onPress={() => profile.onReplayTutorial?.()}
      />
      <View style={styles.rowDivider} />
      <SettingsRow
        icon="information-circle"
        title={t.aboutUs}
        onPress={() => setIsAboutUsModalVisible(true)}
      />
      <View style={styles.rowDivider} />
      <SettingsRow
        icon="document-text"
        title={t.privacyPolicy}
        onPress={() => setIsPrivacyPolicyModalVisible(true)}
      />
      <View style={styles.rowDivider} />
      <SettingsRow
        icon="document-text-outline"
        title={uiText("Terms and Conditions")}
        onPress={() => setIsTermsModalVisible(true)}
      />
    </View>
  </>);
}
