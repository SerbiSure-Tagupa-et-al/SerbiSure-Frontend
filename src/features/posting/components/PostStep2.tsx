import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import { WorkLocationFields } from '../../bookings/components/WorkLocationFields';
import { PublicWorkHoursFields } from './PublicWorkHoursFields';
import React from 'react';
import { Text, View, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { postingStyles as styles } from '../styles';
import type { PostFormController } from '../hooks/usePostForm';

export function PostStep2({ form }: { form: PostFormController }) {
  const { tr: uiText } = useUiLanguage();
  const {
    step,
    config,
    user,
    address,
    engagementType,
    instructions,
    setInstructions,
    wagePolicy,
    offerAmount,
    setOfferAmount,
    applyUserProfileAddress,
    fieldErrors,
    isPosting,
  } = form;

  if (step !== 2) return null;

  const num = Number(offerAmount.replace(/[^0-9.]/g, ''));
  const minRate = wagePolicy ? Number(wagePolicy.minimum_rate) : null;
  const isBelowMin = offerAmount.trim().length > 0 && num > 0 && minRate !== null && num < minRate;

  return (
    <View style={styles.stepContainer}>
      {/* 1. Use Profile Address (if available) */}
      {user && (user.barangay || user.city) ? (
        <View style={[styles.locationHeaderRow, { justifyContent: 'flex-end', marginBottom: 6 }]}>
          <Pressable
            accessibilityRole="button"
            style={styles.useProfileAddressBtn}
            hitSlop={8}
            onPress={applyUserProfileAddress}
            disabled={isPosting}
          >
            <Ionicons name="location" size={13} color="#EA580C" />
            <Text style={styles.useProfileAddressText}>{uiText("Use Profile Address")}</Text>
          </Pressable>
        </View>
      ) : null}

      <WorkLocationFields
        form={address}
        disabled={isPosting}
        hideDetailedAddress={config.role === 'kasambahay'}
        errors={fieldErrors}
      />

      <PublicWorkHoursFields
        shortTerm={engagementType === 'short'} hours={form.workHours} shift={form.selectedTime}
        onChange={(hours, shift) => { form.setWorkHours(hours); form.setSelectedTime(shift); }}
        error={fieldErrors.schedule} disabled={isPosting}
      />

      {/* 2. Instructions / About You (Optional) */}
      <Text style={[styles.sectionHeader, { marginTop: 14 }]}>
        {uiText(config.role === 'kasambahay' ? "ABOUT YOU (OPTIONAL)" : "INSTRUCTIONS (OPTIONAL)")}
      </Text>
      <TextInput
        style={styles.multilineInput}
        multiline
        numberOfLines={4}
        placeholder={uiText(config.instructionsPlaceholder)}
        placeholderTextColor="#9CA3AF"
        value={instructions}
        onChangeText={setInstructions}
        editable={!isPosting}
      />

      {/* 3. Offer Amount */}
      <Text style={[styles.sectionHeader, { marginTop: 14 }]}>
        {uiText("OFFER AMOUNT")}
      </Text>
      <View style={[styles.offerInputWrapper, (fieldErrors.rate || isBelowMin) && styles.offerInputWrapperInvalid]}>
        <Text style={[styles.currencyPrefix, isBelowMin && { color: '#DC2626' }]}>₱</Text>
        <TextInput
          style={[styles.offerInput, isBelowMin && { color: '#DC2626' }]}
          value={offerAmount}
          onChangeText={setOfferAmount}
          keyboardType="decimal-pad"
          placeholder={wagePolicy?.minimum_rate || uiText('Enter amount')}
          placeholderTextColor="#9CA3AF"
          editable={!isPosting}
        />
        <Text style={[styles.rateUnitSuffix, isBelowMin && { color: '#DC2626' }]}>
          {engagementType === 'short' ? uiText("/ day") : uiText("/ month")}
        </Text>
      </View>

      {/* Only show minimum wage note if user inputs below minimum */}
      {isBelowMin ? (
        <Text style={styles.invalidRateHint}>
          {uiText("Minimum: ₱")}{Number(minRate).toLocaleString('en-PH')} / {wagePolicy?.rate_period === 'day' || engagementType === 'short' ? uiText("day") : uiText("month")}
        </Text>
      ) : null}
    </View>
  );
}
