import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useState } from 'react';
import { Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { postingStyles as styles } from '../styles';
import type { PostFormController } from '../hooks/usePostForm';
import { PrivacyPolicyModal } from '../../profile/components/PrivacyPolicyModal';

export function PostStep3({ form }: { form: PostFormController }) {
  const { tr: uiText } = useUiLanguage();
  const [showTermsModal, setShowTermsModal] = useState(false);
  const {
    step,
    config,
    engagementType,
    setupPreference,
    offerAmount,
    workHours,
    agreedTerms,
    setAgreedTerms,
    getSelectedRoleLabel,
    getLocationLabel,
    buildAutoMessage,
    fieldErrors,
    isPosting,
  } = form;

  if (step !== 3) return null;

  const hours = workHours.replace(/\s+-\s+/g, ' – ') || uiText('Not provided');

  const handleCheckboxPress = () => {
    if (!agreedTerms) {
      // Must view and accept terms before checking agreement
      setShowTermsModal(true);
    } else {
      setAgreedTerms(false);
    }
  };

  return (
    <View style={styles.stepContainer}>
      {/* 1. Listing Preview */}
      <Text style={styles.sectionHeader}>{uiText("LISTING PREVIEW")}</Text>
      <View style={styles.previewCard}>
        <Text style={styles.previewText}>{buildAutoMessage()}</Text>
      </View>

      {/* 2. Summary Card */}
      <Text style={[styles.sectionHeader, { marginTop: 14 }]}>{uiText("SUMMARY")}</Text>
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{uiText("Service")}</Text>
          <Text style={styles.summaryValue}>{getSelectedRoleLabel()}</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{uiText("Engagement")}</Text>
          <Text style={styles.summaryValue}>
            {engagementType === 'short' ? uiText("Short-term") : uiText("Long-term")}
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{uiText("Work Setup")}</Text>
          <Text style={styles.summaryValue}>
            {setupPreference === 'stay-in' ? uiText("Stay-in") : uiText("Stay-out")}
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{uiText("Offer Rate")}</Text>
          <Text style={[styles.summaryValue, { color: '#EA580C', fontWeight: '800' }]}>
            ₱{offerAmount} {engagementType === 'short' ? uiText("/ day") : uiText("/ month")}
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{uiText("Location")}</Text>
          <Text style={[styles.summaryValue, { flex: 1, textAlign: 'right', marginLeft: 16 }]}>
            {getLocationLabel()}
          </Text>
        </View>

        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{uiText('Work hours')}</Text>
          <Text style={[styles.summaryValue, { flex: 1, textAlign: 'right', marginLeft: 16 }]}>{hours}</Text>
        </View>
      </View>

      {/* 3. Terms of Service Checkbox (opens terms modal before checking) */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreedTerms }}
        style={styles.checkboxRow}
        onPress={handleCheckboxPress}
        disabled={isPosting}
      >
        <View style={[styles.checkbox, agreedTerms && styles.checkboxActive, fieldErrors.terms && styles.checkboxError]}>
          {agreedTerms && <Ionicons name="checkmark" size={15} color="#0D0D11" />}
        </View>
        <Text style={styles.checkboxText}>
          {uiText("I agree to the ")}
          <Text
            style={[styles.checkboxBoldText, { textDecorationLine: 'underline' }]}
            onPress={() => setShowTermsModal(true)}
          >
            {uiText("SerbiSure Terms of Service")}
          </Text>
          {uiText(" and confirm these household details are accurate")}
        </Text>
      </Pressable>

      {/* Terms of Service Consent Modal */}
      <PrivacyPolicyModal
        visible={showTermsModal}
        document="terms"
        mode="consent"
        onClose={() => setShowTermsModal(false)}
        onAccept={() => {
          setAgreedTerms(true);
          setShowTermsModal(false);
        }}
        onDecline={() => {
          setAgreedTerms(false);
          setShowTermsModal(false);
        }}
      />
    </View>
  );
}
