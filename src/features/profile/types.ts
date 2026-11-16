import type React from 'react';
import type { View } from 'react-native';
import type { Role } from '../../app/roleConfig';

export interface ProfileScreenProps {
  role?: Role;
  avatarUri?: string | null;
  initialView?: 'main' | 'personal_info';
  onViewChange?: (view: 'main' | 'personal_info') => void;
  onUpdateAvatar?: (uri: string) => void;
  onBack?: () => void;
  onLogout?: () => void;
  onBookingsPress?: () => void;
  onReplayTutorial?: () => void;
  tutorialActive?: boolean;
  personalInfoTargetRef?: React.RefObject<View>;
  viewCvTargetRef?: React.RefObject<View>;
  getVerifiedTargetRef?: React.RefObject<View>;
  onTutorialTargetsLayout?: () => void;
}
