import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage as useUiLanguage } from '../localization/LanguageContext';
import THEME from '../theme/theme';

const logo = require('../../../assets/serbisure-icon.png');

export const APP_HEADER_SIDE_WIDTH = 44;
export const APP_HEADER_LOGO_SIZE = 44;
export const APP_HEADER_BACK_ICON_SIZE = 24;
export const APP_HEADER_BACK_ICON_COLOR = '#1A1A1A';

export interface AppHeaderProps {
  readonly onBookingsPress?: () => void;
  readonly bookingsButtonRef?: React.RefObject<View>;
  readonly onBookingsLayout?: () => void;
  readonly highlightBookings?: boolean;
  readonly left?: React.ReactNode;
  readonly right?: React.ReactNode;
}

export function AppHeader({ onBookingsPress, bookingsButtonRef, onBookingsLayout, highlightBookings = false, left, right }: AppHeaderProps) {
  const { tr: uiText } = useUiLanguage();

  const renderedLeft = left !== undefined ? left : (
    <View ref={bookingsButtonRef} collapsable={false} onLayout={onBookingsLayout}>
      <Pressable
        onPress={onBookingsPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={uiText("Bookings & Hires")}
        style={[styles.iconButton, highlightBookings && styles.iconButtonHighlighted]}
      >
        <Ionicons name="calendar-outline" size={26} color={THEME.colors.ink} />
      </Pressable>
    </View>
  );

  const renderedRight = right !== undefined ? right : null;

  return (
    <View style={styles.header}>
      <View style={styles.side}>{renderedLeft}</View>
      <Image source={logo} style={styles.logo} resizeMode="contain" />
      <View style={[styles.side, styles.right]}>{renderedRight}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    width: '100%',
    backgroundColor: THEME.colors.canvas,
    zIndex: 10,
  },
  side: {
    width: APP_HEADER_SIDE_WIDTH,
    height: APP_HEADER_SIDE_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  right: {
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonHighlighted: {
    backgroundColor: '#FFAA77',
  },
  logo: {
    width: APP_HEADER_LOGO_SIZE,
    height: APP_HEADER_LOGO_SIZE,
  },
});
