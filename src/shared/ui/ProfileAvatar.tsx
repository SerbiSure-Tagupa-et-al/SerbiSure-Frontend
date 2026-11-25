import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import THEME from '../theme/theme';

const serbisureIcon = require('../../../assets/serbisure-icon.png');

export function ProfileAvatar({ uri, name, size = 48 }: Readonly<{ uri?: string | null; name: string; size?: number }>) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const photoUri = uri?.trim();
  const shape = { width: size, height: size, borderRadius: size / 2 };

  const lowerName = (name || '').toLowerCase();
  const lowerUri = (photoUri || '').toLowerCase();
  const isOfficial =
    lowerName.includes('serbisure') ||
    lowerName.includes('support') ||
    lowerName.includes('superadmin') ||
    lowerName.includes('admin') ||
    lowerName.includes('barangay') ||
    lowerUri.includes('serbisure') ||
    lowerUri.includes('support');

  const hasCustomPhoto = Boolean(
    photoUri &&
    !photoUri.includes('ui-avatars.com') &&
    !photoUri.includes('placeholder') &&
    !photoUri.includes('pravatar')
  );

  if (isOfficial && !hasCustomPhoto) {
    return (
      <View style={[styles.officialContainer, shape]} accessibilityLabel={`${name}'s official SerbiSure logo`}>
        <Image
          source={serbisureIcon}
          style={{ width: size * 0.65, height: size * 0.65 }}
          resizeMode="contain"
        />
      </View>
    );
  }

  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';

  if (hasCustomPhoto && photoUri && failedUri !== photoUri) {
    return (
      <View style={[styles.fallback, shape, styles.photoWrap]}>
        <Text style={[styles.initials, { fontSize: size * 0.32 }]} accessible={false}>{initials}</Text>
        <Image
          source={{ uri: photoUri }}
          style={[styles.photo, shape]}
          resizeMode="cover"
          accessibilityLabel={`${name}'s profile photo`}
          onError={() => setFailedUri(photoUri)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fallback, shape]} accessibilityLabel={`${name}'s profile photo placeholder`}>
      <Text style={[styles.initials, { fontSize: size * 0.32 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photoWrap: { overflow: 'hidden', position: 'relative' },
  photo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  fallback: { backgroundColor: THEME.colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  officialContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FFCCAA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { color: THEME.colors.brandDark, fontFamily: THEME.typography.fontFamily.display },
});

