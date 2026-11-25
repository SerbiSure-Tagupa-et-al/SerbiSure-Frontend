import { StyleSheet } from 'react-native';
import THEME from '../../shared/theme/theme';

export const postingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F5F2',
  },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: THEME.typography.fontFamily.mainExtraBold,
    fontSize: 18,
    fontWeight: '800',
    color: '#0D0D11',
  },
  logo: {
    width: 36,
    height: 36,
  },

  // Stepper Styles
  stepperWrapper: {
    alignItems: 'center',
    marginBottom: 20,
  },
  stepBadgeText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  stepperCol: {
    flex: 1,
    alignItems: 'center',
  },
  stepperBar: {
    height: 4,
    width: '100%',
    borderRadius: 2,
    marginBottom: 4,
  },
  stepperBarActive: {
    backgroundColor: '#FFB380',
  },
  stepperBarInactive: {
    backgroundColor: '#E5E7EB',
  },
  stepperLabel: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 11,
    fontWeight: '700',
  },
  stepperLabelActive: {
    color: '#0D0D11',
  },
  stepperLabelInactive: {
    color: '#9CA3AF',
  },

  // Title Block
  titleBlock: {
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  mainTitle: {
    fontFamily: THEME.typography.fontFamily.mainBlack,
    fontSize: 22,
    fontWeight: '900',
    color: '#0D0D11',
    textAlign: 'left',
    letterSpacing: -0.3,
  },
  titleHighlight: {
    color: '#FFB380',
  },
  scrollContent: {
    paddingBottom: 16,
    flexGrow: 1,
  },
  stepContainer: {
    width: '100%',
  },
  sectionHeader: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  // Service Grid (3x2)
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  serviceGridError: {},
  serviceCard: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  serviceCardActive: {
    backgroundColor: '#FFB380',
    borderColor: 'transparent',
  },
  serviceCardError: {
    borderColor: '#EF4444',
  },
  serviceIcon: {
    marginBottom: 4,
  },
  serviceLabel: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0D0D11',
    marginTop: 4,
    textAlign: 'center',
  },
  serviceLabelActive: {
    fontWeight: '800',
    color: '#0D0D11',
  },

  // Option Rows (Engagement & Work Setup)
  optionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  optionBtn: {
    flex: 1,
    minHeight: 58,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  optionBtnActive: {
    backgroundColor: '#FFB380',
    borderColor: 'transparent',
  },
  optionBtnError: {
    borderColor: '#EF4444',
  },
  optionBtnText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0D0D11',
  },
  optionBtnTextActive: {
    color: '#0D0D11',
    fontWeight: '800',
  },
  optionBtnSubtext: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },
  optionBtnSubtextActive: {
    color: '#1F2937',
  },

  // Step 2 Styles
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  useProfileAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  useProfileAddressText: {
    fontSize: 11.5,
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontWeight: '700',
    color: '#EA580C',
  },
  multilineInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    fontSize: 13.5,
    color: '#0D0D11',
    minHeight: 90,
    textAlignVertical: 'top',
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 16,
  },
  offerInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  offerInputWrapperInvalid: {
    borderColor: '#EF4444',
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0D0D11',
    marginRight: 6,
  },
  offerInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontWeight: '700',
    color: '#0D0D11',
    padding: 0,
  },
  rateUnitSuffix: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    fontFamily: THEME.typography.fontFamily.mainBold,
  },
  invalidRateHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 5,
    paddingHorizontal: 2,
  },

  // Step 3 Styles
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    minHeight: 70,
    marginBottom: 16,
  },
  previewText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#374151',
    fontFamily: THEME.typography.fontFamily.mainMedium,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 13.5,
    color: '#0D0D11',
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontWeight: '700',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 20,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#9CA3AF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#FFB380',
    borderColor: '#FFB380',
  },
  checkboxError: {
    borderColor: '#EF4444',
  },
  checkboxText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
  checkboxBoldText: {
    color: '#0D0D11',
    fontWeight: '700',
  },

  // Bottom Buttons
  bottomButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  backButtonPill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPillText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 15,
    fontWeight: '700',
    color: '#0D0D11',
  },
  nextButtonPill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0D0D11',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonPillText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnPressed: {
    opacity: 0.85,
  },

  // Success Overlay Styles
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(246, 245, 242, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  successContainer: {
    alignItems: 'center',
  },
  logoRingWrapper: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  rotatingRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: '#FFB380',
    borderTopColor: 'transparent',
  },
  innerLogoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  successLogoImage: {
    width: 44,
    height: 44,
  },
  successTitleText: {
    fontFamily: THEME.typography.fontFamily.mainBlack,
    fontSize: 22,
    fontWeight: '900',
    color: '#0D0D11',
    marginTop: 8,
  },
});
