import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { LivenessScreen } from '../../verification/components/LivenessScreen';
import { uploadSelfie } from '../../verification/api/selfieUpload';
import type { VerificationStatusResponse } from '../../verification/api/verificationApi';
import type { LivenessResult } from '../../verification/liveness/livenessMachine';
import { currentDocuments } from '../../verification/documentStatus';

export function ProfilePhotoSection({ info, token, role, open, onOpenChange, onSaved,
  infoOpen = false, onInfoOpenChange, documentsVisible = false, documentsContent, onCloseDocuments }: {
  info: VerificationStatusResponse | null;
  token?: string | null;
  role: 'homeowner' | 'kasambahay';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => unknown;
  infoOpen?: boolean;
  onInfoOpenChange?: (open: boolean) => void;
  documentsVisible?: boolean;
  documentsContent?: React.ReactNode;
  onCloseDocuments?: () => void;
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
      captured.current = null; onOpenChange(false); onInfoOpenChange?.(false); onCloseDocuments?.();
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
  const close = () => { if (!busy.current) {
    captured.current = null; setFailed(false); onOpenChange(false); onInfoOpenChange?.(false); onCloseDocuments?.();
  } };
  const openCamera = () => { setFailed(false); onOpenChange(true); onInfoOpenChange?.(false); };
  const approved = photo?.verification_status === 'Verified';
  const pending = submitted || photo?.verification_status === 'Pending';
  const rejected = !submitted && photo?.verification_status === 'Rejected';
  const infoTitle = approved ? 'Profile Photo Verified' : pending ? 'Photo Under Review'
    : rejected ? 'Profile Photo Needs Retake' : info ? 'Add your face photo' : 'Photo status unavailable';
  const infoMessage = approved
    ? 'Your photo is approved and locked to keep your account safe. To change it, message your barangay office or the SerbiSure admin.'
    : pending ? 'Your photo is waiting for your barangay official to review it. We will let you know when it is approved.'
    : rejected ? 'Please take a clear photo of your face in a bright place. Use the camera to try again.'
    : info ? 'Take a clear photo of your face so an official can review it.'
    : 'Please check your internet connection and try again.';
  const photoInfo = <View style={styles.backdrop}>
    <View style={styles.infoCard} accessibilityViewIsModal>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.infoContent}>
      <Text style={styles.infoTitle}>{tr(infoTitle)}</Text>
      {rejected && !!photo?.rejection_reason && <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>{tr('Note from reviewer')}</Text>
        <Text style={styles.body}>{photo.rejection_reason}</Text>
      </View>}
      <Text style={styles.body}>{tr(infoMessage)}</Text>
      {canRetake && <Pressable accessibilityRole="button" accessibilityLabel={tr(photo ? 'Retake Photo' : 'Take Photo')}
        disabled={!token} onPress={openCamera} style={styles.button}>
        <Text style={styles.buttonText}>{tr(photo ? 'Retake Photo' : 'Take Photo')}</Text>
      </Pressable>}
      {!info && <Pressable accessibilityRole="button" onPress={() => { void onSaved(); }} style={styles.button}>
        <Text style={styles.buttonText}>{tr('Try Again')}</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" onPress={close} style={styles.closeButton}>
        <Text style={styles.buttonText}>{tr(approved ? 'Got it' : pending ? 'Okay' : 'Close')}</Text>
      </Pressable>
      </ScrollView>
    </View>
  </View>;
  return <>
    {/* Keep one native window for documents, photo info and camera. Switching
        content avoids dismissing one Android modal while opening another. */}
    <Modal visible={open || infoOpen || documentsVisible} animationType="none" transparent statusBarTranslucent onRequestClose={close}>
      {open ? (canRetake ? <LivenessScreen mode="profile" role={role} token={token} onBack={close}
        submitting={saving} submissionFailed={failed} onVerified={result => { void save(result); }}
        onRetrySubmission={() => { if (captured.current) void save(captured.current); }} /> : photoInfo)
        : infoOpen ? photoInfo : documentsVisible ? documentsContent : null}
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 21, color: '#66431B' },
  button: { alignSelf: 'flex-start', backgroundColor: '#FFA135', borderRadius: 10, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '700', color: '#35220D' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  infoCard: { width: '100%', maxWidth: 420, maxHeight: '85%', backgroundColor: '#FFFFFF', borderRadius: 20 },
  infoContent: { padding: 22, gap: 16 },
  infoTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  reasonBox: { backgroundColor: '#FFF5E5', borderRadius: 10, padding: 12, gap: 6 },
  reasonLabel: { fontSize: 13, fontWeight: '700', color: '#8A4E00' },
  closeButton: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
});
