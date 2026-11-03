import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProfileAvatar } from '../../../shared/ui/ProfileAvatar';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { currentDocuments } from '../../verification/documentStatus';
import type { VerificationStatusResponse } from '../../verification/api/verificationApi';

export function ProfilePhotoAvatar({ info, uri, name, size, style, onPress }: {
  info: VerificationStatusResponse | null;
  uri?: string | null;
  name: string;
  size: number;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
}) {
  const { tr } = useLanguage();
  const status = currentDocuments(info?.documents).find(doc => doc.document_type === 'profile_photo')?.verification_status;
  const badge = status === 'Verified' ? { color: '#16A34A', icon: 'checkmark' as const, label: 'Profile Photo Verified' }
    : status === 'Pending' ? { color: '#FACC15', icon: 'time-outline' as const, label: 'Photo Under Review' }
    : status === 'Rejected' ? { color: '#DC2626', icon: 'alert' as const, label: 'Profile Photo Needs Retake' } : null;
  return <Pressable style={style} onPress={onPress} hitSlop={6} accessibilityRole="button"
    accessibilityLabel={tr(badge?.label || 'Profile Photo')} accessibilityHint={tr('Tap to check your photo status.')}>
    <ProfileAvatar uri={uri} name={name} size={size} />
    {badge && <View testID="profile-photo-status" style={[styles.badge, { backgroundColor: badge.color }]} pointerEvents="none">
      <Ionicons name={badge.icon} size={13} color={status === 'Pending' ? '#713F12' : '#FFFFFF'} />
    </View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
