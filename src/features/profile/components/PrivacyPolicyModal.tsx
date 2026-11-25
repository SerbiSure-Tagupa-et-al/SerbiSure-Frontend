import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  ScrollView,
  Linking,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import THEME from '../../../shared/theme/theme';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
  document?: 'privacy' | 'terms';
  onAccept?: () => void;
  onDecline?: () => void;
  mode?: 'consent' | 'view';
}

export function PrivacyPolicyModal({
  visible,
  onClose,
  document = 'privacy',
  onAccept,
  onDecline,
  mode,
}: PrivacyPolicyModalProps) {
  const insets = useSafeAreaInsets();
  const { tr: uiText } = useUiLanguage();
  const isTerms = document === 'terms';
  const isConsentMode = mode ? mode === 'consent' : Boolean(onAccept);
  const scrollViewRef = useRef<ScrollView>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  useEffect(() => {
    if (visible) {
      setHasScrolledToBottom(false);
    }
  }, [visible]);

  const handleOpenEmail = () => {
    Linking.openURL('mailto:privacy@serbisure.ph?subject=Privacy Inquiry').catch(() => {});
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 40;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleAccept = () => {
    if (!hasScrolledToBottom) {
      if (typeof scrollViewRef.current?.scrollToEnd === 'function') {
        scrollViewRef.current.scrollToEnd({ animated: true });
      } else {
        scrollViewRef.current?.scrollTo?.({ y: 99999, animated: true });
      }
      setHasScrolledToBottom(true);
    } else {
      if (onAccept) {
        onAccept();
      } else {
        onClose();
      }
    }
  };

  const handleDecline = () => {
    if (onDecline) {
      onDecline();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.fullScreenContainer, { paddingTop: Math.max(insets.top, 20) }]}>
        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <Text style={styles.agreementTag}>{uiText("AGREEMENT")}</Text>
          <Text style={styles.modalTitle}>
            {uiText(isTerms ? "Terms of Service" : "Privacy Policy")}
          </Text>

          {isTerms ? <TermsContent /> : <PrivacyContent handleOpenEmail={handleOpenEmail} />}
        </ScrollView>

        {/* Bottom Actions: Decline & Accept (consent mode) OR Back & Understood (settings view) */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={({ pressed }) => [styles.declineBtn, pressed && styles.btnPressed]}
            onPress={isConsentMode ? handleDecline : onClose}
          >
            <Text style={styles.declineBtnText}>{uiText(isConsentMode ? "Decline" : "Back")}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.acceptBtn, pressed && styles.btnPressed]}
            onPress={isConsentMode ? handleAccept : onClose}
          >
            <Text style={styles.acceptBtnText}>{uiText(isConsentMode ? "Accept" : "Understood")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function VerificationPrivacyNotice({ isHomeowner = false }: { isHomeowner?: boolean }) {
  const { tr: uiText } = useUiLanguage();
  const [policyOpen, setPolicyOpen] = useState(false);
  return (
    <View style={{ backgroundColor: '#EFF6FF', borderRadius: 14, padding: 12, marginVertical: 12, gap: 6 }}>
      <Text style={{ color: '#1E3A8A', fontSize: 13, fontWeight: '700' }}>{uiText('Data Privacy Notice (RA 10173)')}</Text>
      <Text style={{ color: '#334155', fontSize: 12, lineHeight: 18 }}>{uiText('ID, clearance and TESDA NC II images are confidential to authorized Barangay Desk Officers and System Administrators. Other users cannot view them.')}</Text>
      <Text style={{ color: '#334155', fontSize: 12, lineHeight: 18 }}>{uiText('Google Cloud Vision API and Groq AI assist with reading document images and organizing text for manual review.')}</Text>
      <Text style={{ color: '#334155', fontSize: 12, lineHeight: 18 }}>{uiText('Raw ID and clearance images are deleted 30 days after approval or rejection. Your verification record is kept.')}</Text>
      {isHomeowner && <Text style={{ color: '#334155', fontSize: 12, lineHeight: 18 }}>{uiText('Homeowners submit a PhilSys National ID to help prevent fake employer accounts and protect Kasambahays entering private homes.')}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={uiText('Read Full Privacy Policy')} onPress={() => setPolicyOpen(true)}>
        <Text style={{ color: '#1D4ED8', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' }}>{uiText('Read Full Privacy Policy')}</Text>
      </Pressable>
      {policyOpen && <PrivacyPolicyModal visible onClose={() => setPolicyOpen(false)} document="privacy" />}
    </View>
  );
}

function TermsContent() {
  const { tr: uiText } = useUiLanguage();

  return (
    <View style={styles.contentWrap}>
      <View style={styles.sectionBlock}>
        <Text style={styles.paragraph}>
          {uiText("By creating a SerbiSure account, you agree to these Terms of Service and confirm that you have read the Data Privacy Policy.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("1. Eligibility and Account Responsibility")}</Text>
        <Text style={styles.paragraph}>
          {uiText("You must provide accurate information, keep your account credentials secure, and be at least 18 years old to use SerbiSure.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("2. Using the Platform")}</Text>
        <Text style={styles.paragraph}>
          {uiText("SerbiSure helps Homeowners and Kasambahays discover services, communicate, and arrange bookings. You are responsible for the information and messages you share.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("3. Verification and Safety")}</Text>
        <Text style={styles.paragraph}>
          {uiText("Verification supports trust on the platform but does not guarantee a user's identity, qualifications, conduct, or the outcome of a booking. Use your own judgment and follow applicable safety guidance.")}
        </Text>
        <Text style={styles.paragraph}>
          {uiText("Homeowners must submit a valid PhilSys National ID. Kasambahays must submit valid NBI and PNP Clearances. Counterfeit, borrowed, altered, or expired credentials may result in immediate suspension and reporting to the proper authorities.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("4. Bookings, Payments, and Reviews")}</Text>
        <Text style={styles.paragraph}>
          {uiText("Users are responsible for agreeing on service details, schedules, rates, and payment arrangements. Reviews must be honest, relevant, and based on a real interaction.")}
        </Text>
        <Text style={styles.paragraph}>
          {uiText("Short-term on-demand bookings between the same Homeowner and Kasambahay are limited to three (3) bookings per calendar month. Reaching the cap triggers a programmatic block and requires the parties to consider a formal long-term contract so recurring work is not misclassified as gig work.")}
        </Text>
        <Text style={styles.paragraph}>
          {uiText("After a completed engagement, users must submit a review. Reviews written in English, Filipino, Bisaya, or Taglish may be evaluated by an automated XLM-RoBERTa sentiment model to produce public Positive, Neutral, or Negative labels.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("5. Wage Floor and Platform Role")}</Text>
        <Text style={styles.paragraph}>
          {uiText("Job offers and booking compensation must meet or exceed the applicable RTWPB-10 minimum wage floor for Northern Mindanao and Cagayan de Oro City. Offering below the applicable minimum, including through an off-platform arrangement connected to SerbiSure, violates these Terms.")}
        </Text>
        <Text style={styles.paragraph}>
          {uiText("SerbiSure is a technology facilitator and matching marketplace. It is not a Private Employment Agency, employer, or party to the employment contract between a Homeowner and Kasambahay. SerbiSure does not handle payroll, direct wage disbursement, or statutory benefit contributions.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("6. Scope and Safety Boundaries")}</Text>
        <Text style={styles.paragraph}>
          {uiText("SerbiSure does not perform medical or mental-fitness evaluations, physical deployment, dispute arbitration, or legal mediation. Homeowners are responsible for requesting standard health certificates directly when required. Disputes remain subject to the appropriate Barangay Lupon or DOLE process.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("7. Required Credentials and Reviews")}</Text>
        <Text style={styles.paragraph}>
          {uiText("Submitting a counterfeit, borrowed, altered, or expired government credential is fraudulent conduct. It may lead to immediate profile suspension and referral to local authorities. Reviews must describe a real completed engagement and must not expose another person's confidential documents or personal information.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("8. Prohibited Conduct")}</Text>
        <Text style={styles.paragraph}>
          {uiText("Do not impersonate another person, submit false documents, harass other users, misuse personal data, or use SerbiSure for unlawful activity.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("9. Account Changes or Suspension")}</Text>
        <Text style={styles.paragraph}>
          {uiText("We may limit or suspend access when needed to protect users, investigate violations, or comply with law. You may stop using the service at any time.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("10. Contact and Acceptance")}</Text>
        <Text style={styles.paragraph}>
          {uiText("If you have questions about these terms, contact SerbiSure Support. By selecting the consent checkbox or tapping Accept, you confirm that you understand and accept these Terms of Service.")}
        </Text>
      </View>

      <View style={{ height: 24 }} />
    </View>
  );
}

function PrivacyContent({ handleOpenEmail }: { handleOpenEmail: () => void }) {
  const { tr: uiText } = useUiLanguage();

  return (
    <View style={styles.contentWrap}>
      <View style={styles.sectionBlock}>
        <Text style={styles.paragraph}>
          {uiText("At SerbiSure, we value your trust and are dedicated to safeguarding your personal data. This Privacy Policy describes our practices regarding the collection, processing, and protection of information gathered through the SerbiSure mobile application, in compliance with Republic Act No. 10173, otherwise known as the")}{' '}
          <Text style={styles.boldText}>{uiText("Data Privacy Act of 2012 (DPA)")}</Text>{' '}
          {uiText("of the Philippines.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("1. Information We Collect")}</Text>
        <Text style={styles.paragraph}>
          {uiText("We collect personal information necessary to deliver trusted matching services between Homeowners and Kasambahays:")}
        </Text>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Account Credentials:")}</Text> {uiText("Full name, mobile phone number, email address, password hash, and account type.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Identity Documents:")}</Text> {uiText("National ID (PhilSys), NBI Clearance, Police Clearance, TESDA NC II Skill Certification, and facial liveness verification photos.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Service Data:")}</Text> {uiText("Job posts, service requests, booking histories, location (city/province), and ratings/reviews.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Resumes & Credentials:")}</Text> {uiText("CVs are generated from saved profile details. Experience and training are self-reported. Workers choose whether phone numbers and family details appear on shared CVs.")}
          </Text>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("2. How We Use Information")}</Text>
        <Text style={styles.boldText}>{uiText('Why Homeowners Submit a PhilSys National ID')}</Text>
        <Text style={styles.paragraph}>{uiText('Kasambahays enter private homes to work. Homeowner identity screening helps prevent fake employer accounts, fraud and unsafe households, and supports Barangay safety accountability alongside RA 10361. This is a SerbiSure requirement; RA 10361 does not require uploading a PhilSys National ID.')}</Text>
        <Text style={styles.paragraph}>{uiText('ID, clearance and TESDA NC II images are confidential to authorized Barangay Desk Officers and System Administrators. Other users cannot view them.')}</Text>
        <Text style={styles.paragraph}>
          {uiText("Your data is collected strictly for legitimate platform purposes:")}
        </Text>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Verification Screening:")}</Text> {uiText("Validating government-issued IDs with OCR and administrative review to safeguard community safety.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Matching & Connection:")}</Text> {uiText("Displaying verified profiles, service categories, and contact availability.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Trust & Quality Assurance:")}</Text> {uiText("Aggregating feedback and computing transparent sentiment ratings to prevent abuse.")}
          </Text>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("3. Security & Storage")}</Text>
        <Text style={styles.paragraph}>
          {uiText("We implement robust technical and organizational measures:")}
        </Text>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            {uiText("All communications between your mobile device and our backend servers are encrypted using modern Transport Layer Security (TLS/HTTPS).")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            {uiText("Clearance documents and verification media are stored on secure, authenticated object storage with restricted administrative access.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            {uiText("Account passwords are salted and hashed using industry-standard cryptography; passwords are never stored in plain text.")}
          </Text>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("4. Barangay Workforce Analytics")}</Text>
        <Text style={styles.paragraph}>
          {uiText("SerbiSure may compile aggregated and anonymized demographic, employment-status, and service-category statistics to support local government monitoring and the Batas Kasambahay under RA 10361 and DILG MC 2013-61.")}
        </Text>
        <Text style={styles.paragraph}>
          {uiText("These analytics are available only to authorized Barangay officials and System Administrators. Public users and Homeowners do not receive identity-level workforce reports.")}
        </Text>
        <Text style={styles.paragraph}>
          {uiText("NBI and Police Clearances remain confidential and are visible only to the USTP Superadmin and designated Barangay Desk Officers. They are never publicly visible to Homeowners.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("5. Third-Party Processors and Cloud Services")}</Text>
        <Text style={styles.paragraph}>
          {uiText("To operate the platform, selected service providers process information on SerbiSure's behalf under access controls and security requirements:")}
        </Text>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Cloudinary:")}</Text> {uiText("stores uploaded identity documents, clearance images, and verification media.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Neon PostgreSQL:")}</Text> {uiText("stores account, profile, booking, and review records.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Hugging Face XLM-RoBERTa:")}</Text> {uiText("processes written reviews to produce sentiment labels.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Google Cloud Vision API:")}</Text> {uiText("extracts text from submitted ID, clearance and TESDA NC II images for verification screening.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}><Text style={styles.boldText}>{uiText('Groq AI:')}</Text> {uiText('structures extracted OCR text into readable fields for manual review. If text extraction fails, Groq AI may also read the document image as a fallback.')}</Text>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("6. Biometric Data and Facial Liveness")}</Text>
        <Text style={styles.paragraph}>
          {uiText("The MediaPipe liveness check uses facial landmarks to confirm physical presence during verification. A captured selfie may be cross-referenced with the submitted government ID for identity confirmation only.")}
        </Text>
        <Text style={styles.paragraph}>
          {uiText("Facial verification media is sensitive personal information. It is restricted to verification purposes, is never sold, and is not shared with third parties for advertising or unrelated profiling.")}
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("7. Retention and Disposal")}</Text>
        <Text style={styles.paragraph}>
          {uiText('Rejected ID, clearance and TESDA NC II images: deleted 30 days after rejection, including flagged submissions.')}
        </Text>
        <Text style={styles.paragraph}>
          {uiText('Approved ID, clearance and TESDA NC II images: deleted 30 days after approval. Verification status, reviewer, issue and expiry dates, and audit records are retained.')}
        </Text>
        <Text style={styles.paragraph}>{uiText('Replaced or expired documents: old raw images are deleted 30 days after replacement or expiry.')}</Text>
        <Text style={styles.paragraph}>{uiText('Pending documents: flagged for review at 30 days; unreviewed images are deleted after 60 days and must be uploaded again.')}</Text>
        <Text style={styles.paragraph}>{uiText('Profile photos: your current avatar is retained while your account is active. Raw images, including your avatar, are deleted within 30 days of account closure.')}</Text>
        <Text style={styles.paragraph}>{uiText('Retention starts on November 25, 2026. Existing images receive the full retention period from that date; later decisions start a new period.')}</Text>
        <Text style={styles.paragraph}>{uiText('The 30- and 60-day periods are SerbiSure retention policy; RA 10173 does not set these fixed periods.')}</Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("8. Your Rights Under RA 10173")}</Text>
        <Text style={styles.paragraph}>
          {uiText("As a registered user, you retain the following statutory rights:")}
        </Text>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Right to be Informed:")}</Text> {uiText("Knowing how your personal data is collected and processed.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Right to Access:")}</Text> {uiText("Requesting a copy of your personal data held by SerbiSure.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Right to Rectification:")}</Text> {uiText("Correcting outdated, inaccurate, or incomplete information.")}
          </Text>
        </View>
        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>{uiText("Right to Erasure:")}</Text> {uiText("Requesting the deletion of your account and related records.")}
          </Text>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{uiText("9. Contact Data Protection Officer")}</Text>
        <Text style={styles.paragraph}>
          {uiText("For inquiries, data access requests, or privacy concerns, please contact our Data Protection Officer:")}
        </Text>
        <Pressable style={styles.emailPill} onPress={handleOpenEmail}>
          <Text style={styles.emailPillText}>privacy@serbisure.ph</Text>
        </Pressable>
      </View>

      <View style={{ height: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  agreementTag: {
    fontSize: 12,
    fontFamily: THEME.typography.fontFamily.mainBold,
    letterSpacing: 1.5,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 26,
    fontFamily: THEME.typography.fontFamily.display,
    color: '#FFB380',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  contentWrap: {
    marginTop: 4,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: THEME.typography.fontFamily.mainBold,
    color: '#111827',
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 13.5,
    fontFamily: THEME.typography.fontFamily.body,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 8,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
    paddingLeft: 6,
  },
  bulletDot: {
    fontSize: 14,
    color: '#FFB380',
    marginRight: 8,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: THEME.typography.fontFamily.body,
    color: '#4B5563',
    lineHeight: 20,
  },
  boldText: {
    fontFamily: THEME.typography.fontFamily.bodyBold,
    color: '#1F2937',
  },
  emailPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF4ED',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  emailPillText: {
    fontSize: 13.5,
    fontFamily: THEME.typography.fontFamily.mainBold,
    color: '#FFB380',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  declineBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    fontSize: 15,
    fontFamily: THEME.typography.fontFamily.display,
    color: '#111827',
  },
  acceptBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFB380',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    fontSize: 15,
    fontFamily: THEME.typography.fontFamily.display,
    color: '#111827',
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
