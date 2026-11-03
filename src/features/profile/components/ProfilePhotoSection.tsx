import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { LivenessScreen } from '../../verification/components/LivenessScreen';
import { uploadSelfie } from '../../verification/api/selfieUpload';
import type { VerificationStatusResponse } from '../../verification/api/verificationApi';
import type { LivenessResult } from '../../verification/liveness/livenessMachine';
import { currentDocuments } from '../../verification/documentStatus';

export function ProfilePhotoSection({ info, token, role, open, onOpenChange, onSaved }: {
  info: VerificationStatusResponse | null;
  token?: string | null;
  role: 'homeowner' | 'kasambahay';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => unknown;
}) {
  const { tr } = useLanguage();
  const photo = currentDocuments(info?.documents).find(doc => doc.document_type === 'profile_photo');
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { setSubmitted(false); }, [info]);
  const canRetake = !!info && !submitted && (!photo || photo.verification_status === 'Rejected');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const captured = useRef<LivenessResult | null>(null);
  const session = useRef(token);
  session.current = token;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = async (result: LivenessResult) => {
    if (busy.current || !token || !canRetake || !result.verified) return;
    busy.current = true; captured.current = result; setSaving(true); setFailed(false);
    const activeToken = token;
    try {
      await uploadSelfie(activeToken, result.selfiePath);
      if (!mounted.current || session.current !== activeToken) return;
      // The upload is confirmed. A failed refresh must not invite a second
      // upload of the now-locked photo or claim the successful save failed.
      setSubmitted(true);
      try { await onSaved(); } catch { /* Pull-to-refresh can fetch review status later. */ }
      if (!mounted.current || session.current !== activeToken) return;
      captured.current = null; onOpenChange(false);
      Alert.alert(tr('Photo submitted for review.'), tr('We will let you know when your photo is approved.'));
    } catch (error) {
      if (mounted.current && session.current === activeToken) {
        setFailed(true);
        Alert.alert(tr('Photo not saved'), error instanceof Error ? error.message : tr('Please try again.'));
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const close = () => { if (!busy.current) { captured.current = null; setFailed(false); onOpenChange(false); } };
  if (!info || photo?.verification_status === 'Verified') return null;
  return <View style={styles.notice}>
    <Text style={styles.title}>{tr(!submitted && photo?.verification_status === 'Rejected' ? 'Profile Photo Rejected' : photo || submitted ? 'Photo waiting for review' : 'Add your face photo')}</Text>
    <Text style={styles.body}>{(!submitted && photo?.rejection_reason) || tr(photo || submitted
      ? 'Your photo is waiting for review. You can book and apply once your photo and documents are approved.'
      : 'Take a clear photo of your face so an official can review it.')}</Text>
    {canRetake && <Pressable accessibilityRole="button" accessibilityLabel={tr(photo ? 'Retake Photo' : 'Take Photo')}
      onPress={() => onOpenChange(true)} style={styles.button} disabled={!token}>
      <Text style={styles.buttonText}>{tr(photo ? 'Retake Photo' : 'Take Photo')}</Text>
    </Pressable>}
    <Modal visible={open && canRetake} animationType="slide" onRequestClose={close}>
      {open && canRetake && <LivenessScreen mode="profile" role={role} token={token} onBack={close}
        submitting={saving} submissionFailed={failed} onVerified={result => { void save(result); }}
        onRetrySubmission={() => { if (captured.current) void save(captured.current); }} />}
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 16, marginVertical: 12, padding: 16, borderRadius: 14, backgroundColor: '#FFF5E5', gap: 10 },
  title: { fontSize: 16, fontWeight: '700', color: '#8A4E00' },
  body: { fontSize: 14, lineHeight: 21, color: '#66431B' },
  button: { alignSelf: 'flex-start', backgroundColor: '#FFA135', borderRadius: 10, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '700', color: '#35220D' },
});
