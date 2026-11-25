import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import THEME from '../../../shared/theme/theme';

export function ProfileTabs<T extends 'posts' | 'history' | 'reviews' = 'posts' | 'reviews'>({
  activeTab,
  onChange,
  postsCount,
  historyCount,
  reviewsCount,
  own = false,
  showHistory = false,
}: Readonly<{
  activeTab: T;
  onChange: (tab: T) => void;
  postsCount?: number;
  historyCount?: number;
  reviewsCount?: number;
  own?: boolean;
  showHistory?: boolean;
}>) {
  const { tr: uiText } = useUiLanguage();

  return (
    <View style={styles.tabContainer}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'posts' }}
        style={styles.tabButton}
        onPress={() => onChange('posts' as T)}
      >
        <Text style={[styles.tabText, showHistory && styles.tabTextCompact, activeTab === 'posts' ? styles.tabTextActive : styles.tabTextInactive]} numberOfLines={1}>
          {uiText(own ? 'My Recent Posts' : 'Recent Posts')}
        </Text>
        {activeTab === 'posts' && <View style={styles.activeIndicator} />}
      </Pressable>

      {showHistory && (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'history' }}
          style={styles.tabButton}
          onPress={() => onChange('history' as T)}
        >
          <Text style={[styles.tabText, styles.tabTextCompact, activeTab === 'history' ? styles.tabTextActive : styles.tabTextInactive]} numberOfLines={1}>
            {uiText("Job History")}
            {typeof historyCount === 'number' && historyCount > 0 ? ` (${historyCount})` : ''}
          </Text>
          {activeTab === 'history' && <View style={styles.activeIndicator} />}
        </Pressable>
      )}

      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'reviews' }}
        style={styles.tabButton}
        onPress={() => onChange('reviews' as T)}
      >
        <Text style={[styles.tabText, showHistory && styles.tabTextCompact, activeTab === 'reviews' ? styles.tabTextActive : styles.tabTextInactive]} numberOfLines={1}>
          {uiText(showHistory ? 'Reviews' : 'Reviews & Feedbacks')}
          {showHistory && typeof reviewsCount === 'number' && reviewsCount > 0 ? ` (${reviewsCount})` : ''}
        </Text>
        {activeTab === 'reviews' && <View style={styles.activeIndicator} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E5E7EB',
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  tabText: {
    fontSize: 14.5,
    fontFamily: THEME.typography.fontFamily.mainBold,
  },
  tabTextCompact: {
    fontSize: 13.5,
  },
  tabTextActive: {
    color: '#0D0D11',
    fontWeight: '700',
  },
  tabTextInactive: {
    color: '#8E8E93',
    fontWeight: '500',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -1.5,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#FF8A48',
    borderRadius: 2,
  },
});
