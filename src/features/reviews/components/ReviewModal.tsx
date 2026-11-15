import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { forwardRef, useState, useRef, useEffect, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Keyboard, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { submitReview, ReviewItem, ReviewSubmissionError } from '../api/reviewApi';
import { generateUUID } from '../../chat/api/chatApi';

export interface ReviewModalProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  revieweeName?: string;
  token?: string | null;
  onSuccess?: () => void;
  isMandatory?: boolean;
  useNativeModal?: boolean;
}

export interface ReviewModalHandle {
  requestClose: () => void;
}

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];
const SENTIMENT_COLORS = {
  Positive: { backgroundColor: '#DCFCE7', color: '#166534' },
  Negative: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  Neutral: { backgroundColor: '#F3F4F6', color: '#374151' },
};

export const ReviewModal = forwardRef<ReviewModalHandle, ReviewModalProps>(function ReviewModal({
  visible, onClose, bookingId, revieweeName = 'Service Partner', token, onSuccess, isMandatory = false,
  useNativeModal = true,
}, ref) {
  const { tr: uiText } = useUiLanguage();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysisUnavailable, setAnalysisUnavailable] = useState(false);
  const [savedReview, setSavedReview] = useState<ReviewItem | null>(null);
  const busy = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const session = useRef(0);
  const submission = useRef<{ body: string; key: string } | null>(null);

  useEffect(() => {
    session.current += 1;
    busy.current = false;
    setIsSubmitting(false);
    setErrorMsg(null);
    setAnalysisUnavailable(false);
    setSavedReview(null);
    setFeedback('');
    setRating(0);
    submission.current = null;
    return () => { session.current += 1; };
  }, [visible, bookingId]);

  useEffect(() => {
    setStillWaiting(false);
    if (!isSubmitting) return;
    const timer = setTimeout(() => setStillWaiting(true), 8000);
    return () => clearTimeout(timer);
  }, [isSubmitting]);

  const handleSubmit = async () => {
    if (busy.current || savedReview) return;
    if (!token) {
      Alert.alert('Session Expired', 'Please log in again to submit a review.');
      return;
    }
    const trimmed = feedback.trim();
    if (rating < 1 || rating > 5) {
      setErrorMsg('Please select a star rating.');
      return;
    }
    if (trimmed.length < 10) {
      setErrorMsg('Please write at least 10 characters about your experience.');
      return;
    }
    const params = { booking_id: bookingId, rating, unstructured_feedback: trimmed };
    const body = JSON.stringify(params);
    if (submission.current?.body !== body) submission.current = { body, key: generateUUID() };
    const currentSession = session.current;
    busy.current = true;
    setIsSubmitting(true);
    setErrorMsg(null);
    setAnalysisUnavailable(false);
    Keyboard.dismiss();
    try {
      const result = await submitReview(token, params, submission.current.key);
      if (currentSession !== session.current) return;
      setSavedReview(result.data);
      onSuccess?.();
    } catch (error) {
      if (currentSession !== session.current) return;
      setAnalysisUnavailable(error instanceof ReviewSubmissionError && error.code === 'sentiment_unavailable');
      setErrorMsg(error instanceof Error ? error.message : 'Could not submit your review. Please try again.');
    } finally {
      if (currentSession === session.current) {
        busy.current = false;
        setIsSubmitting(false);
      }
    }
  };

  const handleAttemptClose = () => {
    if (busy.current) return;
    if (isMandatory && !savedReview) {
      Alert.alert('Share Your Feedback', 'Your review helps others choose a service partner. You can return to this booking to review it later.', [
        { text: 'Keep Writing' }, { text: 'Review Later', onPress: onClose },
      ]);
    } else onClose();
  };

  useImperativeHandle(ref, () => ({ requestClose: handleAttemptClose }));

  const content = (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable accessibilityLabel="Close review" disabled={isSubmitting} onPress={handleAttemptClose} style={[styles.backBtn, isSubmitting && { opacity: 0.3 }]} hitSlop={12}>
            <Ionicons name="close" size={24} color="#1A1A1A" />
          </Pressable>
          <Text style={styles.headerTitle}>{savedReview ? 'Review Submitted' : 'Write a Review'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView ref={scroll} style={styles.scrollBody} contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.revieweeText}>{uiText("How was your experience with")}</Text>
            <Text style={styles.revieweeName}>{revieweeName}?</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(score => (
                <Pressable key={score} accessibilityRole="button" accessibilityLabel={`Rate ${score} out of 5 stars`} accessibilityState={{ selected: score === rating, disabled: isSubmitting || !!savedReview }} disabled={isSubmitting || !!savedReview} onPress={() => { setRating(score); setErrorMsg(null); }} hitSlop={8} style={styles.starTouch}>
                  <Ionicons name={score <= rating ? 'star' : 'star-outline'} size={38} color="#FFB43B" />
                </Pressable>
              ))}
            </View>
            <Text style={styles.ratingScoreText}>{rating ? `${rating}.0 — ${uiText(RATING_LABELS[rating] || '')}` : uiText('Select a star rating')}</Text>
            <Text style={styles.revieweeText}>{uiText("Your star rating is separate from feedback sentiment.")}</Text>
          </View>
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>{uiText("YOUR EXPERIENCE")}</Text>
            <TextInput style={styles.textArea} accessibilityLabel={uiText('Reviews & Feedback')} placeholder={uiText('Share what went well or what could be better. You can write in English, Filipino, or Bisaya.')} placeholderTextColor="#9CA3AF" multiline textAlignVertical="top" value={feedback} editable={!isSubmitting && !savedReview} onChangeText={text => { setFeedback(text); setErrorMsg(null); setAnalysisUnavailable(false); }} maxLength={1000} />
            <View style={styles.charCountRow}>
              <Text style={styles.charCountText}>{feedback.trim().length} {uiText("/ 1000 characters · minimum 10")}</Text>
            </View>
          </View>
          {isSubmitting && (
            <View onLayout={() => scroll.current?.scrollToEnd({ animated: true })} style={styles.statusCard} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
              <ActivityIndicator size="small" color="#B45309" />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>{uiText("Analyzing your feedback…")}</Text>
                <Text style={styles.statusText}>{uiText(stillWaiting ? 'Still checking. Please keep this screen open for a moment.' : 'We’re checking the tone of your feedback before saving your review. This may take a moment.')}</Text>
              </View>
            </View>
          )}
          {savedReview && (
            <View onLayout={() => scroll.current?.scrollToEnd({ animated: true })} style={[styles.statusCard, { backgroundColor: '#F0FDF4' }]} accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle" size={28} color="#16A34A" />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>{uiText("Review submitted")}</Text>
                <Text style={styles.statusText}>{uiText("Thank you! Your review has been saved.")}</Text>
                <Text style={[styles.resultBadge, SENTIMENT_COLORS[savedReview.nlp_sentiment]]}>{uiText("Feedback sentiment:")} {uiText(savedReview.nlp_sentiment)}</Text>
              </View>
            </View>
          )}
          {errorMsg && (
            <View onLayout={() => scroll.current?.scrollToEnd({ animated: true })} style={styles.errorBox} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle-outline" size={22} color="#B45309" />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>{uiText(analysisUnavailable ? 'Analysis is unavailable right now' : 'Could not submit your review')}</Text>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            </View>
          )}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }} style={({ pressed }) => [styles.submitBtn, (pressed || isSubmitting) && { opacity: 0.7 }]} disabled={isSubmitting} onPress={savedReview ? handleAttemptClose : handleSubmit}>
            <Text style={styles.submitBtnText}>{savedReview ? uiText("Done") : isSubmitting ? uiText("Please wait…") : errorMsg ? uiText("Try Again") : uiText("Submit Review")}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
  );

  if (!useNativeModal) return visible ? content : null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleAttemptClose}>
      {content}
    </Modal>
  );
});

const styles = StyleSheet.create({
  statusCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#FFF7ED', borderRadius: 16, padding: 16, marginBottom: 16 },
  statusTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 5 },
  statusText: { fontSize: 13, lineHeight: 19, color: '#4B5563' },
  resultBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, fontSize: 12, fontWeight: '700', marginTop: 10 },
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  revieweeText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  revieweeName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 16,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  starTouch: {
    padding: 4,
  },
  ratingScoreText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 16,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  textArea: {
    minHeight: 120,
    fontSize: 14,
    lineHeight: 20,
    color: '#1A1A1A',
    padding: 0,
  },
  charCountRow: {
    alignItems: 'flex-end',
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3F4F6',
    paddingTop: 6,
  },
  charCountText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: '#B91C1C',
    flex: 1,
  },
  submitBtn: {
    backgroundColor: '#FFB43B',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFB43B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
