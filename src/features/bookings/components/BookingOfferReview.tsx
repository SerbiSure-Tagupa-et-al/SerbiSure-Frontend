import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import THEME from '../../../shared/theme/theme';
import { SERVICE_CHOICES, WORK_DAYS } from '../engagementForm';
import { workSetupLabel, type WorkSetup } from '../workSetup';
import { BookingPassQRCode } from './BookingPassQRCode';

export type BookingOfferStep = 1 | 2 | 3 | 4;

interface Props {
  serviceCategory: string[];
  workSetup: WorkSetup | null;
  bookingType: 'short_term' | 'long_term';
  startDate: string;
  endDate: string;
  workHours: string;
  days: string[];
  ongoing?: boolean;
  region: string;
  location: string;
  salary: string;
  onEdit?: (step: BookingOfferStep) => void;
  disabled?: boolean;
  contactName?: string;
  contactRole?: string;
  contactAvatar?: string | null;
  isConfirmed?: boolean;
  isDeclined?: boolean;
  isAcquired?: boolean;
  bookingId?: string | null;
  passUrl?: string | null;
}

function TicketPerforation() {
  return (
    <View style={styles.perforationWrap}>
      <View style={styles.notchLeft} />
      <View style={styles.dashedLine} />
      <View style={styles.notchRight} />
    </View>
  );
}

/** Booking terms with a locally generated QR linking to live pass verification. */
export function BookingOfferReview(props: Props) {
  const { tr: uiText, formatDate } = useUiLanguage();
  const short = props.bookingType === 'short_term';
  const displayDate = (value: string) => {
    let calendarDate = value.trim();
    // API timestamps are instants; show their Philippine calendar date.
    // Form values such as MM/DD/YYYY are already calendar dates.
    if (/^\d{4}-\d{2}-\d{2}T/.test(calendarDate)) {
      const stamp = Date.parse(calendarDate);
      if (Number.isFinite(stamp)) {
        const ph = new Date(stamp + 8 * 3600000);
        calendarDate = `${ph.getUTCMonth() + 1}/${ph.getUTCDate()}/${ph.getUTCFullYear()}`;
      }
    }
    return calendarDate ? (formatDate?.(calendarDate, 'compact') || calendarDate) : uiText('Not set');
  };
  const startDate = displayDate(props.startDate);
  const endDate = displayDate(props.endDate);
  const showDateRange = !short || (!!props.endDate.trim() && startDate !== endDate);
  const openEnded = !short && (props.ongoing || !props.endDate.trim());
  const amount = props.salary.trim() && Number.isFinite(Number(props.salary))
    ? `₱${Number(props.salary).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
    : props.salary || uiText('Not provided');

  const primaryServiceChoice = SERVICE_CHOICES.find(item => props.serviceCategory.includes(item.id));
  const primaryServiceName = primaryServiceChoice ? primaryServiceChoice.label : (props.serviceCategory[0] || uiText('Service not specified'));

  const days = WORK_DAYS.filter(day => props.days.includes(day.value))
    .map(day => uiText(day.label))
    .join(', ');

  const displayName = props.contactName || uiText('Service Partner');
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';

  const cleanRegion = props.region
    ? props.region.replace(/ - Region.*$/, '')
    : uiText('Not provided');

  return (
    <View style={styles.ticketCard}>
      {/* 1. Ticket Header / Participant & Price */}
      <View style={styles.headerSection}>
        <View style={styles.participantRow}>
          {props.contactAvatar ? (
            <Image source={{ uri: props.contactAvatar }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{initials}</Text>
            </View>
          )}
          <View style={styles.participantInfo}>
            <Text style={styles.participantName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.participantSubtitle}>
              {props.contactRole || uiText("Kasambahay")} · {short ? uiText("Part-time") : uiText("Full-time")}
            </Text>
          </View>
          <View style={styles.rateHighlight}>
            <Text style={styles.rateAmount} numberOfLines={1}>{amount}</Text>
            <Text style={styles.rateUnit}>/ {short ? uiText("day") : uiText("mo")}</Text>
          </View>
        </View>
      </View>

      {/* Perforation 1 with clean cutouts */}
      <TicketPerforation />

      {/* 2. Middle Body: Headline & 2-Column Details Grid */}
      <View style={styles.bodySection}>
        <View style={styles.headlineRow}>
          <Text style={styles.ticketTitle}>
            {primaryServiceName} Service
          </Text>
          {props.onEdit && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={uiText("Edit Service & setup")}
              disabled={props.disabled}
              hitSlop={8}
              onPress={() => props.onEdit?.(1)}
              style={styles.editPill}
            >
              <Ionicons name="pencil" size={11} color="#000000" style={{ marginRight: 3 }} />
              <Text style={styles.editPillText}>{uiText("Edit")}</Text>
            </Pressable>
          )}
        </View>

        {/* 2-Column Key-Value Grid */}
        <View style={styles.gridRow}>
          <View style={styles.gridCol}>
            <Text style={styles.fieldLabel}>{showDateRange ? uiText("Start date") : uiText("Service date")}</Text>
            <Text style={styles.fieldValue}>{startDate}</Text>
          </View>
          <View style={styles.gridCol}>
            <Text style={styles.fieldLabel}>{showDateRange ? uiText("End date") : uiText("Work hours")}</Text>
            <Text style={styles.fieldValue}>{showDateRange
              ? (openEnded ? uiText('Ongoing (No end date)') : endDate)
              : props.workHours || uiText('Not set')}</Text>
          </View>
        </View>

        {showDateRange && <View style={styles.gridRow}>
          <View style={styles.gridCol}>
            <Text style={styles.fieldLabel}>{uiText('Work hours')}</Text>
            <Text style={styles.fieldValue}>{props.workHours || uiText('Not set')}</Text>
          </View>
          <View style={styles.gridCol}>
            <Text style={styles.fieldLabel}>{uiText('Work region')}</Text>
            <Text style={styles.fieldValue}>{cleanRegion}</Text>
          </View>
        </View>}

        <View style={styles.gridRow}>
          <View style={styles.gridCol}>
            <Text style={styles.fieldLabel}>{short ? uiText("Engagement") : uiText("Work setup")}</Text>
            <Text style={styles.fieldValue}>
              {short ? uiText("Part-time") : uiText(workSetupLabel(props.workSetup))}
            </Text>
          </View>
          <View style={styles.gridCol}>
            <Text style={styles.fieldLabel}>{short ? uiText("Daily rate") : uiText("Monthly salary")}</Text>
            <Text style={styles.fieldValue}>
              {amount} <Text style={styles.fieldValueUnit}>/ {short ? uiText("day") : uiText("month")}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.gridRow}>
          <View style={showDateRange ? styles.gridColFull : styles.gridCol}>
            <Text style={styles.fieldLabel}>{uiText('Work days')}</Text>
            <Text style={styles.fieldValue}>{days || uiText('Not provided')}</Text>
          </View>
          {!showDateRange && <View style={styles.gridCol}>
            <Text style={styles.fieldLabel}>{uiText("Work region")}</Text>
            <Text style={styles.fieldValue}>{cleanRegion}</Text>
          </View>}
        </View>

        {/* Address Box */}
        <View style={styles.addressBlock}>
          <Text style={styles.addressLabel}>{uiText("Address")}</Text>
          <View style={styles.addressRow}>
            <Ionicons name="location-sharp" size={13} color="#EA580C" style={styles.addressPinIcon} />
            <Text style={styles.addressText}>{props.location || uiText("Address not provided")}</Text>
          </View>
        </View>
      </View>

      {/* Perforation 2 with cutouts */}
      <TicketPerforation />

      {/* 3. Locally rendered pass; drafts never generate a verification link. */}
      <View style={styles.stubSection}>
        <BookingPassQRCode bookingId={props.bookingId} passUrl={props.passUrl} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    marginHorizontal: 0,
    marginBottom: 16,
    overflow: 'hidden',
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFB380',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  participantInfo: {
    flex: 1,
    marginLeft: 11,
    marginRight: 6,
  },
  participantName: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 15,
    color: '#000000',
  },
  participantSubtitle: {
    fontFamily: THEME.typography.fontFamily.secondary,
    fontSize: 11.5,
    color: '#000000',
    marginTop: 2,
  },
  rateHighlight: {
    alignItems: 'flex-end',
    marginLeft: 6,
  },
  rateAmount: {
    fontFamily: THEME.typography.fontFamily.mainExtraBold,
    fontSize: 22,
    color: '#000000',
    lineHeight: 25,
  },
  rateUnit: {
    fontFamily: THEME.typography.fontFamily.secondary,
    fontSize: 11.5,
    color: '#000000',
    marginTop: 1,
  },
  perforationWrap: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  notchLeft: {
    position: 'absolute',
    left: -13,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F6F5F2',
    zIndex: 2,
  },
  notchRight: {
    position: 'absolute',
    right: -13,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F6F5F2',
    zIndex: 2,
  },
  dashedLine: {
    flex: 1,
    height: 0,
    borderBottomWidth: 1.5,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    marginHorizontal: 20,
  },
  bodySection: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  ticketTitle: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 18.5,
    color: '#000000',
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  editPillText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 11,
    color: '#000000',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  gridCol: {
    flex: 1,
    marginRight: 10,
  },
  gridColFull: {
    flex: 1,
  },
  fieldLabel: {
    fontFamily: THEME.typography.fontFamily.secondaryBold,
    fontSize: 10,
    letterSpacing: 0.3,
    color: '#727272',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  fieldValue: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 13,
    color: '#000000',
    lineHeight: 17,
  },
  fieldValueUnit: {
    fontFamily: THEME.typography.fontFamily.secondary,
    fontSize: 11,
    color: '#000000',
  },
  addressBlock: {
    marginTop: 4,
    backgroundColor: '#F6F5F2',
    borderRadius: 14,
    padding: 11,
  },
  addressLabel: {
    fontFamily: THEME.typography.fontFamily.secondaryBold,
    fontSize: 10,
    letterSpacing: 0.3,
    color: '#727272',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressPinIcon: {
    marginRight: 6,
    marginTop: 1.5,
  },
  addressText: {
    flex: 1,
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 11.5,
    color: '#000000',
    lineHeight: 16,
  },
  stubSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
});
