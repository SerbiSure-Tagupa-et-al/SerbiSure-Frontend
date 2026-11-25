import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { postingStyles as styles } from '../styles';
import type { PostFormController } from '../hooks/usePostForm';

const SERVICE_ITEMS = [
  { id: 'Cleaning', label: 'Cleaning', icon: 'sparkles-outline' as const },
  { id: 'Child_care', label: 'Child Care', icon: 'happy-outline' as const },
  { id: 'Cooking', label: 'Cooking', icon: 'restaurant-outline' as const },
  { id: 'Caregiver', label: 'Caregiver', icon: 'heart-outline' as const },
  { id: 'Laundry', label: 'Laundry', icon: 'shirt-outline' as const },
  { id: 'All-around', label: 'All-around', icon: 'home-outline' as const },
];

export function PostStep1({ form }: { form: PostFormController }) {
  const { tr: uiText } = useUiLanguage();
  const {
    step,
    selectedServices,
    handleToggleService,
    engagementType,
    handleEngagementChange,
    setupPreference,
    handleSetupPreference,
    fieldErrors,
  } = form;

  if (step !== 1) return null;

  return (
    <View style={styles.stepContainer}>
      {/* 1. 3x2 Service Category Cards Grid */}
      <View style={[styles.serviceGrid, fieldErrors.service && styles.serviceGridError]}>
        {SERVICE_ITEMS.map((item) => {
          const isSelected = selectedServices.includes(item.id);

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={[
                styles.serviceCard,
                isSelected && styles.serviceCardActive,
                fieldErrors.service && !isSelected && styles.serviceCardError,
              ]}
              onPress={() => handleToggleService(item.id)}
            >
              <Ionicons
                name={item.icon}
                size={28}
                color="#0D0D11"
                style={styles.serviceIcon}
              />
              <Text style={[styles.serviceLabel, isSelected && styles.serviceLabelActive]}>
                {uiText(item.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 2. Engagement Type */}
      <Text style={styles.sectionHeader}>{uiText("ENGAGEMENT")}</Text>
      <View style={styles.optionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={uiText("Part-time / Daily")}
          style={[
            styles.optionBtn,
            engagementType === 'short' && styles.optionBtnActive,
            fieldErrors.engagement && !engagementType && styles.optionBtnError,
          ]}
          onPress={() => handleEngagementChange('short')}
        >
          <View style={styles.optionBtnHeader}>
            <Ionicons
              name="time-outline"
              size={17}
              color="#0D0D11"
            />
            <Text style={[styles.optionBtnText, engagementType === 'short' && styles.optionBtnTextActive]}>
              {uiText("Part-time / Daily")}
            </Text>
          </View>
          <Text style={[styles.optionBtnSubtext, engagementType === 'short' && styles.optionBtnSubtextActive]}>
            {uiText("1–7 days · Daily pay")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={uiText("Full-time / Monthly")}
          style={[
            styles.optionBtn,
            engagementType === 'long' && styles.optionBtnActive,
            fieldErrors.engagement && !engagementType && styles.optionBtnError,
          ]}
          onPress={() => handleEngagementChange('long')}
        >
          <View style={styles.optionBtnHeader}>
            <Ionicons
              name="calendar-outline"
              size={17}
              color="#0D0D11"
            />
            <Text style={[styles.optionBtnText, engagementType === 'long' && styles.optionBtnTextActive]}>
              {uiText("Full-time / Monthly")}
            </Text>
          </View>
          <Text style={[styles.optionBtnSubtext, engagementType === 'long' && styles.optionBtnSubtextActive]}>
            {uiText("30+ days · Monthly pay")}
          </Text>
        </Pressable>
      </View>

      {/* 3. Work Setup */}
      <Text style={[styles.sectionHeader, { marginTop: 16 }]}>{uiText("WORK SETUP")}</Text>
      <View style={styles.optionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={uiText("Stay-in")}
          style={[
            styles.optionBtn,
            setupPreference === 'stay-in' && styles.optionBtnActive,
            fieldErrors.setup && !setupPreference && styles.optionBtnError,
          ]}
          onPress={() => handleSetupPreference('stay-in')}
        >
          <View style={styles.optionBtnHeader}>
            <Ionicons
              name="home-outline"
              size={17}
              color="#0D0D11"
            />
            <Text style={[styles.optionBtnText, setupPreference === 'stay-in' && styles.optionBtnTextActive]}>
              {uiText("Stay-in")}
            </Text>
          </View>
          <Text style={[styles.optionBtnSubtext, setupPreference === 'stay-in' && styles.optionBtnSubtextActive]}>
            {uiText("Live-in")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={uiText("Stay-out")}
          style={[
            styles.optionBtn,
            setupPreference === 'stay-out' && styles.optionBtnActive,
            fieldErrors.setup && !setupPreference && styles.optionBtnError,
          ]}
          onPress={() => handleSetupPreference('stay-out')}
        >
          <View style={styles.optionBtnHeader}>
            <Ionicons
              name="footsteps-outline"
              size={17}
              color="#0D0D11"
            />
            <Text style={[styles.optionBtnText, setupPreference === 'stay-out' && styles.optionBtnTextActive]}>
              {uiText("Stay-out")}
            </Text>
          </View>
          <Text style={[styles.optionBtnSubtext, setupPreference === 'stay-out' && styles.optionBtnSubtextActive]}>
            {uiText("Goes home")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
