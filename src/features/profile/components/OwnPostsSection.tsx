import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { type BookingItem, formatBookingAddress, cancelBooking } from '../../bookings/api/bookingApi';
import { postDisplayStatus } from '../../bookings/postAvailability';
import { workSetupLabel } from '../../bookings/workSetup';

function clockLabel(value?: string | null): string {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value || '');
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return '';
  const hour = Number(match[1]);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

function rateParts(post: BookingItem) {
  return (Number(post.rate_amount) || 0)
    .toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
}

export function OwnPostsSection({
  posts,
  loading,
  error,
  token,
  now,
  onRefresh,
}: {
  posts: BookingItem[];
  loading: boolean;
  error: string | null;
  token?: string | null;
  now: number;
  onRefresh: () => void;
}) {
  const { tr } = useLanguage();
  const insets = useSafeAreaInsets();
  const [selectedPost, setSelectedPost] = useState<BookingItem | null>(null);
  const busy = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());

  const cancel = async (post: BookingItem) => {
    if (!token || busy.current) return;
    busy.current = true;
    setCancelling(true);
    try {
      const result = await cancelBooking(token, post.booking_id, {
        reason: 'Other',
        expected_points: 0,
        pending_only: true,
      });
      if (!result.success) throw new Error(result.error || 'Please try again.');
      setCancelled(previous => new Set(previous).add(post.booking_id));
      onRefresh();
    } catch (err) {
      Alert.alert(tr('Could not cancel post'), err instanceof Error ? err.message : tr('Please try again.'));
      onRefresh();
    } finally {
      busy.current = false;
      setCancelling(false);
    }
  };

  const statusColors: Record<string, string> = {
    Available: '#16A34A',
    Cancelled: '#9CA3AF',
    Booked: '#2563EB',
    Ongoing: '#4F46E5',
    Completed: '#6B7280',
  };
  const statusFor = (post: BookingItem) => cancelled.has(post.booking_id) ? 'Cancelled' : postDisplayStatus(post, now);
  const confirmCancel = (post: BookingItem) => {
    if (!token || busy.current || statusFor(post) !== 'Available') return;
    Alert.alert(tr('Cancel Post'), tr('Remove this post from the public feed?'), [
      { text: tr('Keep Post'), style: 'cancel' },
      { text: tr('Cancel Post'), style: 'destructive', onPress: () => { void cancel(post); } },
    ]);
  };
  // Read the current list record so refreshes cannot leave an outdated status in the sheet.
  const detailsPost = selectedPost ? posts.find(post => post.booking_id === selectedPost.booking_id) : null;
  const detailsStatus = detailsPost ? statusFor(detailsPost) : '';
  const [detailsWhole, detailsDecimals] = detailsPost ? rateParts(detailsPost) : [];
  const startsAt = clockLabel(detailsPost?.daily_start_time);
  const endsAt = clockLabel(detailsPost?.daily_end_time);
  const hours = startsAt && endsAt ? `${startsAt} – ${endsAt}` : tr('Not provided');

  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator style={styles.loader} color="#FFA135" />}
      {error && (
        <Pressable onPress={onRefresh} style={styles.errorBox}>
          <Text style={styles.errorText}>{error} · {tr('Retry')}</Text>
        </Pressable>
      )}
      {!loading && !error && posts.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{tr('Your posts will appear here.')}</Text>
        </View>
      )}
      {posts.map(post => {
        const status = statusFor(post);
        const statusColor = statusColors[status] || '#6B7280';
        const [whole, decimals] = rateParts(post);
        const address = formatBookingAddress(post);
        const hasInstructions = !!post.special_instruction?.trim();

        return (
          <Pressable key={post.booking_id} style={styles.card}
            accessibilityRole="button" accessibilityLabel={`${tr('Post Details')}: ${post.service_category.join(', ')}`}
            onPress={() => setSelectedPost(post)}>
            {/* Header: Service on left, Rate + Status on right */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={styles.serviceTitle} numberOfLines={1}>
                  {post.service_category.join(', ')}
                </Text>
              </View>

              <View style={styles.headerRight}>
                <View style={styles.rateAmount}>
                  <Text style={styles.rateMainNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>₱ {whole}</Text>
                  <Text style={styles.rateDecimalsAndUnit}>.{decimals}/{tr(post.rate_period || 'day')}</Text>
                </View>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} accessible={false} />
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {tr(status)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Location row */}
            {address ? (
              <View style={styles.locationRow}>
                <Text style={styles.locationPin}>📍</Text>
                <Text style={styles.locationText} numberOfLines={1}>
                  {address}
                </Text>
              </View>
            ) : null}

            {/* Special Instructions / Notes (only if present, removing redundancy) */}
            {hasInstructions ? (
              <Text style={styles.instructionText} numberOfLines={2} ellipsizeMode="tail">
                {post.special_instruction}
              </Text>
            ) : null}

            {/* Bottom Actions Row */}
            {status === 'Available' && <View style={styles.actionsRow}>
              <View style={styles.actionsRight}>
                {status === 'Available' && token && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr('Cancel Post')}
                    accessibilityState={{ disabled: cancelling }}
                    hitSlop={6}
                    disabled={cancelling}
                    onPress={event => { event?.stopPropagation(); confirmCancel(post); }}
                    style={styles.cancelBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" accessible={false} />
                  </Pressable>
                )}

              </View>
            </View>}
          </Pressable>
        );
      })}
      {detailsPost && <Modal visible={!!detailsPost} transparent animationType="slide" onRequestClose={() => setSelectedPost(null)}>
        <View style={styles.detailsOverlay}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={tr('Close')}
            onPress={() => setSelectedPost(null)} />
          <View style={styles.detailsSheet} accessibilityViewIsModal>
            <View style={styles.dragHandle} accessible={false} />
            <View style={styles.detailsHeader}>
              <View style={styles.headerRow}>
                <Text style={styles.detailsTitle}>{detailsPost.service_category.join(', ')}</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: statusColors[detailsStatus] || '#6B7280' }]} accessible={false} />
                  <Text style={[styles.statusText, { color: statusColors[detailsStatus] || '#6B7280' }]}>{tr(detailsStatus)}</Text>
                </View>
              </View>
              <View style={styles.rateAmount}>
                <Text style={styles.rateMainNumber}>₱ {detailsWhole}</Text>
                <Text style={styles.rateDecimalsAndUnit}>.{detailsDecimals} / {tr(detailsPost.rate_period || 'day')}</Text>
              </View>
              <Text style={styles.detailsMeta}>
                {tr(detailsPost.booking_type === 'short_term' ? 'Short-term' : 'Long-term')} · {tr(workSetupLabel(detailsPost.work_setup))}
              </Text>
            </View>
            <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.detailsContent} bounces={false}>
              <View style={styles.scheduleCard}>
                <View style={styles.sectionHeading}>
                  <Ionicons name="time-outline" size={18} color="#4B5563" accessible={false} />
                  <Text style={styles.sectionTitle}>{tr('Work hours')}</Text>
                </View>
                <Text style={styles.detailsBody}>{hours}</Text>
              </View>
              <View>
                <View style={styles.sectionHeading}>
                  <Ionicons name="location-outline" size={18} color="#4B5563" accessible={false} />
                  <Text style={styles.sectionTitle}>{tr('Location')}</Text>
                </View>
                <Text style={styles.detailsBody}>{formatBookingAddress(detailsPost)}</Text>
              </View>
              {!!detailsPost.special_instruction?.trim() && <View>
                <View style={styles.sectionHeading}>
                  <Ionicons name="document-text-outline" size={18} color="#4B5563" accessible={false} />
                  <Text style={styles.sectionTitle}>{tr('About / Instructions')}</Text>
                </View>
                <Text style={styles.detailsBody}>{detailsPost.special_instruction.trim()}</Text>
              </View>}
            </ScrollView>
            <View style={[styles.detailsFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {detailsStatus === 'Available' && token && <>
                <Pressable
                  style={[styles.footerButton, styles.cancelModalButton]}
                  accessibilityRole="button"
                  accessibilityLabel={tr('Cancel Post')}
                  disabled={cancelling}
                  accessibilityState={{ disabled: cancelling }}
                  onPress={() => confirmCancel(detailsPost)}
                >
                  <Text style={[styles.footerText, styles.cancelModalButtonText]} numberOfLines={1}>{tr('Cancel Post')}</Text>
                </Pressable>
              </>}
              <Pressable
                style={[styles.footerButton, styles.closeButton]}
                accessibilityRole="button"
                accessibilityLabel={tr('Close')}
                onPress={() => setSelectedPost(null)}
              >
                <Text style={[styles.footerText, styles.closeButtonText]} numberOfLines={1}>{tr('Close')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>}
    </View>
  );
}

const safeStyleSheet = (StyleSheet && typeof StyleSheet.create === 'function')
  ? StyleSheet.create
  : (s: any) => s;

const styles = safeStyleSheet({
  container: {
    gap: 0,
    paddingVertical: 0,
  },
  loader: {
    marginVertical: 16,
  },
  errorBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
  },
  emptyBox: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    elevation: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  serviceTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: '60%',
  },
  rateAmount: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minHeight: 28,
    marginBottom: 3,
  },
  rateMainNumber: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 26,
    includeFontPadding: true,
    fontWeight: '700',
    color: '#176B3A',
  },
  rateDecimalsAndUnit: {
    flexShrink: 0,
    fontSize: 11.5,
    lineHeight: 20,
    includeFontPadding: true,
    fontWeight: '500',
    color: '#176B3A',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  locationPin: {
    fontSize: 11,
  },
  locationText: {
    flexShrink: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#6B7280',
  },
  instructionText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#4B5563',
    marginBottom: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 36,
    marginTop: 6,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  cancelBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  detailsSheet: {
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingTop: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 14,
  },
  detailsHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  detailsTitle: {
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  detailsMeta: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6B7280',
  },
  detailsScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  detailsContent: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 20,
  },
  scheduleCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    gap: 10,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  detailsBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#4B5563',
  },
  detailsFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footerButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  footerText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  cancelModalButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelModalButtonText: {
    color: '#DC2626',
  },
  closeButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  closeButtonText: {
    color: '#4B5563',
  },
});
