import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { Text, View, Image, Pressable, Modal, KeyboardAvoidingView, Platform, Animated, StatusBar, ScrollView } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { VerificationRequiredModal } from '../../verification/components/VerificationRequiredModal';
import { BookingRestrictionModal } from '../../bookings/components/BookingRestrictionModal';
import { ReviewModal } from '../../reviews/components/ReviewModal';

const logoSource = require('../../../../assets/serbisure-icon.png');

import type { PostScreenProps } from '../types';

import { usePostForm } from '../hooks/usePostForm';
import { postingStyles as styles } from '../styles';
import { PostStep1 } from '../components/PostStep1';
import { PostStep2 } from '../components/PostStep2';
import { PostStep3 } from '../components/PostStep3';

const STEP_BARS = [
  { num: 1, label: 'Service' },
  { num: 2, label: 'Location' },
  { num: 3, label: 'Review' },
];

export function PostScreen(props: PostScreenProps) {
  const { tr: uiText } = useUiLanguage();
  const form = usePostForm(props);
  const {
    visible,
    config,
    insets,
    step,
    postedSuccess,
    isPosting,
    showVerificationRequired,
    setShowVerificationRequired,
    showBookingRestricted,
    setShowBookingRestricted,
    pendingReview,
    setPendingReview,
    effectiveToken,
    verificationStatus,
    scaleAnim,
    spin,
    handleClose,
    handleNext,
    handleBack,
    onOpenVerification,
  } = form;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent={true}
      onRequestClose={handleClose}
    >
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.innerContainer,
            {
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {/* 1. Header Row: Back Arrow (no circle background), Title, Apron/Logo */}
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={uiText("Go back")}
              style={styles.backButton}
              onPress={handleBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="arrow-back" size={24} color="#0D0D11" />
            </Pressable>
            <Text style={styles.headerTitle}>{uiText(config.title)}</Text>
            <Image source={logoSource} style={styles.logo} resizeMode="contain" />
          </View>

          {/* 2. Stepper: Step X of 3 + 3 Segmented Bars with Labels */}
          <View style={styles.stepperWrapper}>
            <Text style={styles.stepBadgeText}>
              {uiText('Step {step} of 3', { step })}
            </Text>
            <View style={styles.stepperRow}>
              {STEP_BARS.map((item) => {
                const isPastOrCurrent = step >= item.num;
                return (
                  <View key={item.num} style={styles.stepperCol}>
                    <View
                      style={[
                        styles.stepperBar,
                        isPastOrCurrent ? styles.stepperBarActive : styles.stepperBarInactive,
                      ]}
                    />
                    <Text
                      style={[
                        styles.stepperLabel,
                        isPastOrCurrent ? styles.stepperLabelActive : styles.stepperLabelInactive,
                      ]}
                    >
                      {uiText(item.label)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* 3. Main Step Title (Left-aligned with orange highlight) */}
          <View style={styles.titleBlock}>
            {step === 1 && (
              <Text style={styles.mainTitle}>
                {uiText("What")}{' '}<Text style={styles.titleHighlight}>{uiText("service")}</Text>{' '}
                {uiText(config.role === 'kasambahay' ? "do you offer?" : "do you need?")}
              </Text>
            )}
            {step === 2 && (
              <Text style={styles.mainTitle}>
                {config.role === 'kasambahay' ? (
                  <>
                    {uiText("Where are you")}{' '}<Text style={styles.titleHighlight}>{uiText("located")}</Text>?
                  </>
                ) : (
                  <>
                    {uiText("Where is the job")}{' '}<Text style={styles.titleHighlight}>{uiText("located")}</Text>?
                  </>
                )}
              </Text>
            )}
            {step === 3 && (
              <Text style={styles.mainTitle}>
                <Text style={styles.titleHighlight}>{uiText("Review")}</Text>{' '}
                {uiText(config.role === 'kasambahay' ? "your service post" : "your job post")}
              </Text>
            )}
          </View>

          {/* 4. Scrollable Content Area */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <PostStep1 form={form} />
            <PostStep2 form={form} />
            <PostStep3 form={form} />
          </ScrollView>

          {/* 5. Bottom Buttons (Cancel/Back + Next/Post) */}
          <View style={styles.bottomButtonsContainer}>
            <Pressable
              style={({ pressed }) => [styles.backButtonPill, pressed && styles.btnPressed]}
              onPress={handleBack}
              disabled={isPosting}
            >
              <Text style={styles.backButtonPillText}>
                {step === 3 ? uiText("Back") : uiText("Cancel")}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.nextButtonPill, pressed && styles.btnPressed]}
              onPress={handleNext}
              disabled={isPosting}
            >
              <Text style={styles.nextButtonPillText}>
                {isPosting
                  ? uiText("Posting...")
                  : step === 3
                  ? uiText(config.submitLabel)
                  : uiText("Next")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Job Posted Success Overlay */}
        {postedSuccess && (
          <View style={styles.successOverlay}>
            <Animated.View style={[styles.successContainer, { transform: [{ scale: scaleAnim }] }]}>
              <View style={styles.logoRingWrapper}>
                <Animated.View style={[styles.rotatingRing, { transform: [{ rotate: spin }] }]} />
                <View style={styles.innerLogoCircle}>
                  <Image source={logoSource} style={styles.successLogoImage} resizeMode="contain" />
                </View>
              </View>
              <Text style={styles.successTitleText}>{uiText(config.successTitle)}</Text>
            </Animated.View>
          </View>
        )}

        <BookingRestrictionModal
          visible={showBookingRestricted}
          onClose={() => setShowBookingRestricted(false)}
        />

        <VerificationRequiredModal
          visible={showVerificationRequired}
          verificationStatus={verificationStatus}
          onClose={() => setShowVerificationRequired(false)}
          onVerify={() => {
            setShowVerificationRequired(false);
            handleClose();
            onOpenVerification?.();
          }}
        />

        {pendingReview && (
          <ReviewModal
            visible
            bookingId={pendingReview.booking_id}
            revieweeName={pendingReview.reviewee_name}
            token={effectiveToken}
            isMandatory
            onClose={() => setPendingReview(null)}
            onSuccess={() => setPendingReview(null)}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
