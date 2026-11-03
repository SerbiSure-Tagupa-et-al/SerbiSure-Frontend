import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useState, useEffect, useRef } from 'react';
import { Modal, StyleSheet, Text, View, Pressable, ScrollView, ActivityIndicator, Alert, Image, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import THEME from '../../../shared/theme/theme';
import { DocumentStatusItem, VerificationStatusResponse, deleteRejectedDocument } from '../api/verificationApi';
import { IDPhotoModal } from './IDPhotoModal';
import { API_BASE_URL } from '../../../shared/api/config';
import { fetchWithTimeout } from '../../../shared/api/httpClient';
import { canReplaceDocument, currentDocuments, documentIsExpired, documentLabel } from '../documentStatus';

const logoSource = require('../../../../assets/serbisure-icon.png');
const SCREEN_WIDTH = Dimensions.get('window').width;

interface VerificationStatusModalProps {
  visible: boolean;
  onClose: () => void;
  statusData: VerificationStatusResponse | null;
  loading: boolean;
  token?: string | null;
  onRefresh?: () => void;
  onOpenUpload?: (docType?: string) => void;
  role?: 'homeowner' | 'kasambahay';
  onRetakePhoto?: () => void;
  embedded?: boolean;
}

const EXTRACTED_FIELD_LABELS: Record<string, string> = {
  full_name: 'Full Name',
  first_name: 'First Name',
  middle_name: 'Middle Name',
  last_name: 'Last Name',
  date_of_birth: 'Date of Birth',
  clearance_number: 'Clearance No.',
  philsys_number: 'PhilSys Card No.',
  document_number: 'Document No.',
  date_issued: 'Date Issued',
  valid_until: 'Valid Until',
  address: 'Address',
  purpose: 'Purpose',
  issuing_office: 'Issuing Office',
  blood_type: 'Blood Type',
};

function getFileName(uri: string | null, defaultName: string) {
  if (!uri) return defaultName;
  const raw = uri.split('/').pop()?.split('?')[0];
  if (raw && (raw.endsWith('.jpg') || raw.endsWith('.png') || raw.endsWith('.jpeg') || raw.endsWith('.pdf'))) {
    return raw;
  }
  return defaultName;
}

function UploadBox({
  title,
  subtitle = 'Tap or upload image',
  meta = 'JPG, PNG, PDF (Max 5MB)',
  image,
  defaultFilename,
  onPress,
  onRemove,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  image: string | null;
  defaultFilename: string;
  onPress: () => void;
  onRemove?: () => void;
}) {
  return (
    <Pressable
      style={[styles.uploadBox, !!image && styles.uploadBoxHasImage]}
      onPress={onPress}
    >
      {image ? (
        <View style={styles.attachmentContainer}>
          <Image source={{ uri: image }} style={styles.uploadPreview} resizeMode="cover" />
          <View style={styles.previewMetaRow}>
            <Text style={styles.fileNameTextItalic} numberOfLines={1}>
              {getFileName(image, defaultFilename)}
            </Text>
            {onRemove ? (
              <Pressable
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                style={styles.removeImageBtn}
              >
                <Ionicons name="close-circle" size={18} color="#E74C3C" />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <>
          <Ionicons name="cloud-upload" size={26} color="#FFB380" style={styles.uploadIcon} />
          <Text style={styles.uploadTitle}>{title}</Text>
          <Text style={styles.uploadSubtitle}>{subtitle}</Text>
          <Text style={styles.uploadMeta}>{meta}</Text>
        </>
      )}
    </Pressable>
  );
}

export function VerificationStatusModal({
  visible,
  onClose,
  statusData,
  loading,
  token,
  onRefresh,
  onOpenUpload,
  onRetakePhoto,
  embedded = false,
  role,
}: VerificationStatusModalProps) {
  const { tr: uiText } = useUiLanguage();
  const insets = useSafeAreaInsets();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [idPhotoVisible, setIdPhotoVisible] = useState(false);
  const [activeBox, setActiveBox] = useState<'nbi' | 'police' | 'national_front' | 'national_back' | null>(null);
  const [nbiImage, setNbiImage] = useState<string | null>(null);
  const [policeImage, setPoliceImage] = useState<string | null>(null);
  const [nationalFrontImage, setNationalFrontImage] = useState<string | null>(null);
  const [nationalBackImage, setNationalBackImage] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const uploading = useRef(false);
  const [expandedDocIds, setExpandedDocIds] = useState<Record<string, boolean>>({});
  const [expandedRawDocIds, setExpandedRawDocIds] = useState<Record<string, boolean>>({});

  const toggleDocDetails = (docId: string) => {
    setExpandedDocIds((prev) => ({
      ...prev,
      [docId]: !prev[docId],
    }));
  };

  const toggleRawDocDetails = (docId: string) => {
    setExpandedRawDocIds((prev) => ({
      ...prev,
      [docId]: !prev[docId],
    }));
  };

  // Auto-poll status every 8 seconds while modal is visible and documents are still undergoing processing
  useEffect(() => {
    if (!visible) return;

    const hasProcessingDocs = statusData?.documents?.some(
      (doc) => doc.document_type !== 'profile_photo' && doc.verification_status === 'Pending' && !doc.ocr_processed_at
    );

    if (!hasProcessingDocs) return;

    const pollInterval = setInterval(() => {
      onRefresh?.();
    }, 8000);

    return () => clearInterval(pollInterval);
  }, [visible, statusData?.documents, onRefresh]);

  const effectiveRole: 'homeowner' | 'kasambahay' =
    role ?? (statusData?.account_type === 'Homeowner' ? 'homeowner' : 'kasambahay');

  const handleClose = () => {
    setNbiImage(null);
    setPoliceImage(null);
    setNationalFrontImage(null);
    setNationalBackImage(null);
    setActiveBox(null);
    setIdPhotoVisible(false);
    setExpandedDocIds({});
    setExpandedRawDocIds({});
    onClose();
  };

  const handleBoxPress = (box: 'nbi' | 'police' | 'national_front' | 'national_back') => {
    setActiveBox(box);
    setIdPhotoVisible(true);
  };

  const handlePickedImage = (uri: string) => {
    if (activeBox === 'nbi') setNbiImage(uri);
    else if (activeBox === 'police') setPoliceImage(uri);
    else if (activeBox === 'national_front') setNationalFrontImage(uri);
    else if (activeBox === 'national_back') setNationalBackImage(uri);
  };

  const handleReupload = (docType: string) => {
    if (docType === 'profile_photo') {
      if (onRetakePhoto) onRetakePhoto();
      else Alert.alert(uiText('Retake Photo'), uiText('Close this screen and tap your profile photo to retake it.'));
    }
    else if (docType === 'nbi_clearance') handleBoxPress('nbi');
    else if (docType === 'police_clearance') handleBoxPress('police');
    else if (docType === 'national_id_front') handleBoxPress('national_front');
    else if (docType === 'national_id_back') handleBoxPress('national_back');
  };

  const handleDeleteRejected = (document: DocumentStatusItem) => {
    if (!token) return;
    const docName = documentLabel(document.document_type);

    Alert.alert(
      'Remove Rejected Document',
      `Are you sure you want to remove this ${docName}? You will be able to re-upload a clear copy.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingId(document.document_id);
              await deleteRejectedDocument(token, document.document_id);
              Alert.alert('Removed', `${docName} was removed. You can now re-upload.`);
              onRefresh?.();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove document.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  // Old approvals remain history; only the latest submission controls renewal.
  const documents = currentDocuments(statusData?.documents);
  const renewalRequired = documents.some(doc => documentIsExpired(doc) && canReplaceDocument(doc));
  const renewalPending = statusData?.renewal_pending === true;
  const activeTypes = new Set(
    documents.filter(d => !canReplaceDocument(d)).map(d => d.document_type)
  );

  const needsNbi = effectiveRole === 'kasambahay' && (!activeTypes.has('nbi_clearance') || !!nbiImage);
  const needsPolice = effectiveRole === 'kasambahay' && (!activeTypes.has('police_clearance') || !!policeImage);
  const needsFront = effectiveRole === 'homeowner' && (!activeTypes.has('national_id_front') || !!nationalFrontImage);
  const needsBack = effectiveRole === 'homeowner' && (!activeTypes.has('national_id_back') || !!nationalBackImage);

  const hasAnyNeeds = needsNbi || needsPolice || needsFront || needsBack;
  const hasAnySelected = !!(nbiImage || policeImage || nationalFrontImage || nationalBackImage);

  const handleUploadAll = async () => {
    if (uploading.current) return;
    if (!token) {
      Alert.alert('Authentication Error', 'You must be logged in to upload documents.');
      return;
    }

    const uploads: { type: string; uri: string }[] = [];

    if (effectiveRole === 'homeowner') {
      if (needsFront && !nationalFrontImage && !activeTypes.has('national_id_front')) {
        Alert.alert('Missing Document', 'Please upload the front of your National ID.');
        return;
      }
      if (needsBack && !nationalBackImage && !activeTypes.has('national_id_back')) {
        Alert.alert('Missing Document', 'Please upload the back of your National ID.');
        return;
      }
      if (nationalFrontImage && !activeTypes.has('national_id_front')) uploads.push({ type: 'national_id_front', uri: nationalFrontImage });
      if (nationalBackImage && !activeTypes.has('national_id_back')) uploads.push({ type: 'national_id_back', uri: nationalBackImage });
    } else {
      if (needsNbi && !nbiImage && needsPolice && !policeImage) {
        Alert.alert('Missing Documents', 'Please upload at least one clearance document.');
        return;
      }
      if (nbiImage && !activeTypes.has('nbi_clearance')) uploads.push({ type: 'nbi_clearance', uri: nbiImage });
      if (policeImage && !activeTypes.has('police_clearance')) uploads.push({ type: 'police_clearance', uri: policeImage });
    }

    if (uploads.length === 0) {
      Alert.alert('No Documents', 'Please select at least one document to upload.');
      return;
    }

    uploading.current = true;
    setUploadLoading(true);
    try {
      for (const upload of uploads) {
        const formData = new FormData();
        formData.append('document_type', upload.type);

        const filename = upload.uri.split('/').pop() || 'image.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image`;

        formData.append('document_image', {
          uri: upload.uri,
          name: filename,
          type,
        } as any);

        const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/verifications/upload/`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }, 45000);

        if (response.status === 409) {
          throw new Error(uiText('This document is already submitted. Please check its latest status before uploading again.'));
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to upload ${documentLabel(upload.type)}`);
        }
        if (upload.type === 'nbi_clearance') setNbiImage(null);
        else if (upload.type === 'police_clearance') setPoliceImage(null);
        else if (upload.type === 'national_id_front') setNationalFrontImage(null);
        else setNationalBackImage(null);
      }

      Alert.alert(uiText('Success'), uiText("Your documents are submitted. We'll notify you after review."));
      setNbiImage(null);
      setPoliceImage(null);
      setNationalFrontImage(null);
      setNationalBackImage(null);
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message || 'An unexpected error occurred during upload.');
    } finally {
      uploading.current = false;
      setUploadLoading(false);
      onRefresh?.();
    }
  };

  // The backend evaluates current required documents and expiry in Philippine time.
  // Individual past approvals must not override current account eligibility.
  const resolveEffectiveStatus = (): 'Verified' | 'Pending' | 'Rejected' | 'Unverified' =>
    statusData?.overall_status ?? 'Unverified';

  const renderStatusBanner = () => {
    const status = resolveEffectiveStatus();
    const isUnderReview = status === 'Pending';
    const isApproved = status === 'Verified';
    const isRejected = status === 'Rejected';

    return (
      <View style={styles.bannerCard}>
        <View style={styles.bannerTopRow}>
          <Ionicons
            name={
              renewalRequired ? 'refresh-circle' : isApproved
                ? 'shield-checkmark'
                : isRejected
                  ? 'alert-circle'
                  : isUnderReview
                    ? 'time'
                    : 'document-text-outline'
            }
            size={26}
            color={
              renewalRequired ? '#B45309' : isApproved
                ? '#00B13B'
                : isRejected
                  ? '#FF3E3E'
                  : isUnderReview
                    ? '#FFB380'
                    : '#0D0D11'
            }
            style={{ marginRight: 12, marginTop: 1 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>
              {renewalRequired ? uiText('Renewal needed') : renewalPending ? uiText('Renewal under review') : isApproved
                ? uiText("Verified Account")
                : isRejected
                  ? uiText("Action Required")
                  : isUnderReview
                    ? uiText("Under Review")
                    : uiText("Verify Your Identity")}
            </Text>
            <Text style={styles.bannerSubtitle}>
              {renewalRequired ? uiText('A required document has expired. Upload your renewed document below. You do not need to wait for an official.')
                : renewalPending ? uiText('We received your renewed document. You can apply and post again once your required documents are approved and valid.') : isApproved
                ? uiText("Your documents have been approved by officials. Your profile now has the verified badge.")
                : isRejected
                  ? uiText("One of your documents was not accepted. Please check the notes below.")
                  : isUnderReview
                    ? uiText("Your documents are currently being reviewed by Barangay Officials.")
                    : uiText("Upload your valid identity documents to unlock verified credentials.")}
            </Text>
          </View>
        </View>

        {/* 3-Step Progress Indicator */}
        {!renewalRequired && <View style={styles.progressBarWrapper}>
          <View style={styles.progressCirclesRow}>
            {/* Step 1: Submitted / Pending */}
            <View
              style={[
                styles.progressStepCircle,
                status !== 'Unverified' ? styles.progressStepCircleDone : styles.progressStepCircleActive,
              ]}
            >
              {status !== 'Unverified' ? (
                <Ionicons name="checkmark" size={13} color="#FFF" />
              ) : (
                <Text style={[styles.progressStepNum, { color: '#FFF' }]}>1</Text>
              )}
            </View>

            {/* Connector 1 */}
            <View
              style={[
                styles.progressLine,
                (isUnderReview || isRejected || isApproved) && styles.progressLineActive,
              ]}
            />

            {/* Step 2: Reviewing */}
            <View
              style={[
                styles.progressStepCircle,
                isApproved && styles.progressStepCircleDone,
                isUnderReview && styles.progressStepCircleActive,
                isRejected && styles.progressStepCircleWarning,
                status === 'Unverified' && styles.progressStepCircleInactive,
              ]}
            >
              {isApproved ? (
                <Ionicons name="checkmark" size={13} color="#FFF" />
              ) : isRejected ? (
                <Ionicons name="alert" size={13} color="#FFF" />
              ) : isUnderReview ? (
                <Ionicons name="time" size={13} color="#FFF" />
              ) : (
                <Text style={styles.progressStepNum}>2</Text>
              )}
            </View>

            {/* Connector 2 */}
            <View style={[styles.progressLine, isApproved && styles.progressLineActive]} />

            {/* Step 3: Verified */}
            <View
              style={[
                styles.progressStepCircle,
                isApproved ? styles.progressStepCircleDone : styles.progressStepCircleInactive,
              ]}
            >
              {isApproved ? (
                <Ionicons name="checkmark" size={13} color="#FFF" />
              ) : (
                <Text style={styles.progressStepNum}>3</Text>
              )}
            </View>
          </View>

          <View style={styles.progressLabelsRow}>
            <Text
              style={[
                styles.progressStepLabel,
                status !== 'Unverified' && styles.progressStepLabelDone,
              ]}
            >
              {uiText("Submitted")}
            </Text>
            <Text
              style={[
                styles.progressStepLabel,
                (isUnderReview || isApproved) && (isApproved ? styles.progressStepLabelDone : styles.progressStepLabelActive),
                isRejected && { color: '#FF3E3E', fontWeight: '700' },
              ]}
            >
              {isRejected ? uiText("Action Needed") : uiText("Reviewing")}
            </Text>
            <Text style={[styles.progressStepLabel, isApproved && styles.progressStepLabelDone]}>
              {uiText("Verified")}
            </Text>
          </View>
        </View>}

        {/* Friendly notification note for Pending */}
        {isUnderReview && (
          <View style={styles.whatNextBox}>
            <Ionicons name="notifications-outline" size={15} color="#92400E" style={{ marginRight: 6, marginTop: 2 }} />
            <Text style={styles.whatNextText}>
              {uiText("You'll get a notification once your documents are approved or if we need anything from you.")}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderDocumentItem = (doc: DocumentStatusItem) => {
    const isExpired = documentIsExpired(doc) && doc.verification_status !== 'Pending';
    const isPending = doc.verification_status === 'Pending';
    const isVerified = doc.verification_status === 'Verified' && !isExpired;
    const isRejected = doc.verification_status === 'Rejected' && !isExpired;
    const docTitle = documentLabel(doc.document_type);
    const formattedDate = doc.created_at
      ? new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    const isExpanded = !!expandedDocIds[doc.document_id];
    const isRawExpanded = !!expandedRawDocIds[doc.document_id];
    const hasOcrData = !!(doc.extracted_data && Object.keys(doc.extracted_data).length > 0);
    const hasDiscrepancies = !!(doc.ocr_discrepancies && doc.ocr_discrepancies.length > 0);
    const isProcessingOcr = doc.document_type !== 'profile_photo' && isPending && !doc.ocr_processed_at && !hasOcrData;

    // Filter valid non-empty entries for raw extracted data
    const validRawEntries = Object.entries(doc.extracted_data || {}).filter(
      ([, val]) => val !== null && val !== undefined && String(val).trim() !== '' && String(val).trim().toUpperCase() !== 'UNKNOWN'
    );

    return (
      <View key={doc.document_id} style={styles.docItemCard}>
        {/* Document Header Row */}
        <View style={styles.docItemHeader}>
          <Ionicons
            name={isVerified ? 'checkmark-circle' : isExpired || isRejected ? 'alert-circle' : 'time'}
            size={22}
            color={isVerified ? '#00B13B' : isRejected ? '#FF3E3E' : '#FFB380'}
            style={{ marginRight: 10 }}
          />

          <View style={styles.docItemTitleBox}>
            <Text style={styles.docItemTitle} numberOfLines={1}>{uiText(docTitle)}</Text>
            {formattedDate ? (
              <Text style={styles.docItemSub} numberOfLines={1}>
                {isVerified ? 'Verified by Barangay Official' : `Submitted on ${formattedDate}`}
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.statusBadge,
              isVerified && styles.statusBadgeVerified,
              (isPending || isExpired) && styles.statusBadgePending,
              isRejected && styles.statusBadgeRejected,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isVerified && styles.statusBadgeTextVerified,
                (isPending || isExpired) && styles.statusBadgeTextPending,
                isRejected && styles.statusBadgeTextRejected,
              ]}
            >
              {isExpired ? uiText('Expired') : isVerified ? uiText("Approved") : isRejected ? 'Needs Re-upload' : uiText(isProcessingOcr ? "Checking document" : "Under Review")}
            </Text>
          </View>
        </View>

        {isExpired ? (
          <View style={styles.whatNextBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.whatNextText}>{uiText('Expired on')} {doc.valid_until ? new Date(`${doc.valid_until}T12:00:00+08:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : ''}. {uiText('Please upload your renewed document.')}</Text>
              <Pressable style={[styles.reuploadFullBtn, { marginTop: 10, minHeight: 44 }]} disabled={uploadLoading} onPress={() => handleReupload(doc.document_type)} accessibilityRole="button">
                <Ionicons name="camera-outline" size={17} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.reuploadFullBtnText}>{uiText(effectiveRole === 'kasambahay' ? 'Upload renewed clearance' : 'Upload renewed document')}</Text>
              </Pressable>
            </View>
          </View>
        ) : isRejected ? (
          <View style={styles.rejectedCard}>
            <View style={styles.rejectedHeader}>
              <Ionicons name="close-circle" size={18} color="#DC2626" style={{ marginRight: 6 }} />
              <Text style={styles.rejectedTitle}>{uiText("This document was not accepted")}</Text>
            </View>
            <Text style={styles.rejectedReasonText}>
              {doc.rejection_reason
                ? `Note from reviewer: ${doc.rejection_reason}`
                : 'The document image was unclear or unreadable. Please upload a clear, well-lit photo.'}
            </Text>

            <View style={styles.rejectedActionsRow}>
              <Pressable
                style={styles.reuploadFullBtn}
                onPress={() => handleReupload(doc.document_type)}
                accessibilityRole="button"
                accessibilityLabel={uiText(doc.document_type === 'profile_photo' ? 'Retake Photo' : 'Upload a New Photo')}
              >
                <Ionicons name="camera-outline" size={17} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.reuploadFullBtnText}>{uiText(doc.document_type === 'profile_photo' ? 'Retake Photo' : 'Upload a New Photo')}</Text>
              </Pressable>

              {doc.document_type !== 'profile_photo' && <Pressable
                style={styles.removeBtn}
                onPress={() => handleDeleteRejected(doc)}
                disabled={deletingId === doc.document_id}
                accessibilityLabel="Remove rejected document"
              >
                {deletingId === doc.document_id ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Ionicons name="trash-outline" size={17} color="#DC2626" />
                )}
              </Pressable>}
            </View>
          </View>
        ) : null}

        {/* Reading Document State (Processing) */}
        {isProcessingOcr ? (
          <View style={styles.ocrScanningBanner}>
            <ActivityIndicator size="small" color="#D97706" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ocrScanningTitle}>{uiText("Reading your document...")}</Text>
              <Text style={styles.ocrScanningSubtitle}>
                {uiText("Your document is saved. We're checking its details for review.")}</Text>
            </View>
          </View>
        ) : (!isRejected && (hasOcrData || hasDiscrepancies)) ? (
          /* Discrepancy & Document Information Section */
          <View style={styles.ocrSummarySection}>
            <Pressable
              style={[styles.ocrToggleBtn, isExpanded && styles.ocrToggleBtnActive]}
              onPress={() => toggleDocDetails(doc.document_id)}
            >
              <View style={styles.ocrToggleLeft}>
                <Ionicons
                  name={hasDiscrepancies ? 'alert-circle' : 'document-text-outline'}
                  size={18}
                  color={hasDiscrepancies ? '#D97706' : '#4B5563'}
                  style={styles.ocrToggleIcon}
                />
                <Text
                  style={[
                    styles.ocrToggleBtnText,
                    hasDiscrepancies && styles.ocrToggleBtnTextAlert,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {hasDiscrepancies ? 'Some details look different' : 'Document details'}
                </Text>
              </View>

              <View style={styles.ocrToggleRight}>
                <Text style={styles.seeDetailsText}>{isExpanded ? 'Hide' : 'Details'}</Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#6B7280"
                />
              </View>
            </Pressable>

            {isExpanded && (
              <View style={styles.ocrExpandedContainer}>
                {/* Reassuring Friendly Callout Box */}
                {hasDiscrepancies && (
                  <View style={styles.friendlyNoticeBox}>
                    <View style={styles.friendlyNoticeHeader}>
                      <Ionicons name="bulb-outline" size={18} color="#92400E" style={{ marginRight: 6 }} />
                      <Text style={styles.friendlyNoticeTitle}>{uiText("Don't worry — this is common!")}</Text>
                    </View>
                    <Text style={styles.friendlyNoticeText}>
                      {uiText("The name on your ID looks slightly different from your SerbiSure profile (for example, a nickname or middle name). Barangay officials will check your actual photo ID during review.")}</Text>
                  </View>
                )}

                {/* Section A: What We Noticed (Replaces Account vs Document Discrepancy) */}
                {hasDiscrepancies && (
                  <View style={styles.discrepancyBox}>
                    <Text style={styles.discrepancyBoxHeaderLabel}>{uiText("Here is what we noticed:")}</Text>

                    {doc.ocr_discrepancies.map((disc, idx) => {
                      const fieldLabel = EXTRACTED_FIELD_LABELS[disc.field] || disc.field;
                      return (
                        <View key={idx} style={styles.humanDiscrepancyCard}>
                          <Text style={styles.humanFieldBadge}>{fieldLabel.toUpperCase()}</Text>

                          <View style={styles.humanRow}>
                            <Text style={styles.humanLabel}>{uiText("Your profile says:")}</Text>
                            <Text style={styles.humanValProfile}>{disc.profile_value || '(Not set)'}</Text>
                          </View>

                          <View style={styles.humanRowDivider} />

                          <View style={styles.humanRow}>
                            <Text style={styles.humanLabel}>{uiText("Your document shows:")}</Text>
                            <Text style={styles.humanValDoc}>{disc.document_value || '(Not found)'}</Text>
                          </View>
                        </View>
                      );
                    })}

                    <View style={styles.profileTipRow}>
                      <Ionicons name="create-outline" size={15} color="#92400E" style={{ marginRight: 6 }} />
                      <Text style={styles.profileTipText}>
                        {uiText("If there is a typo in your SerbiSure name, you can update it anytime in Profile Settings.")}</Text>
                    </View>
                  </View>
                )}

                {/* Section B: Clean Document Info (Secondary optional toggle) */}
                {validRawEntries.length > 0 && (
                  <View style={styles.rawDocSection}>
                    <Pressable
                      style={styles.rawDocToggleBtn}
                      onPress={() => toggleRawDocDetails(doc.document_id)}
                    >
                      <Text style={styles.rawDocToggleText}>
                        {isRawExpanded ? 'Hide all document info ▴' : 'See all info from your document ▾'}
                      </Text>
                    </Pressable>

                    {isRawExpanded && (
                      <View style={styles.rawDataTable}>
                        {validRawEntries.map(([key, val]) => {
                          const label =
                            EXTRACTED_FIELD_LABELS[key] ||
                            key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

                          return (
                            <View key={key} style={styles.rawDataRow}>
                              <Text style={styles.rawDataKey}>{label}</Text>
                              <Text style={styles.rawDataVal}>{String(val)}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const renderUploadSection = () => {
    if (!hasAnyNeeds && !hasAnySelected) return null;

    return (
      <View style={styles.uploadSection}>
        <Text style={styles.uploadSectionHeader}>{uiText("Upload Documents")}</Text>

        {needsNbi ? (
          <UploadBox
            title={uiText("NBI Clearance")}
            subtitle={uiText('Tap to take or choose a photo')}
            image={nbiImage}
            defaultFilename="nbi_clearance.jpg"
            onPress={() => handleBoxPress('nbi')}
            onRemove={() => setNbiImage(null)}
          />
        ) : null}

        {needsPolice ? (
          <UploadBox
            title={uiText("Police Clearance")}
            subtitle={uiText('Tap to take or choose a photo')}
            image={policeImage}
            defaultFilename="police_clearance.jpg"
            onPress={() => handleBoxPress('police')}
            onRemove={() => setPoliceImage(null)}
          />
        ) : null}

        {needsFront ? (
          <UploadBox
            title={uiText("National ID (Front)")}
            subtitle="Tap or upload image"
            image={nationalFrontImage}
            defaultFilename="national_id_front.jpg"
            onPress={() => handleBoxPress('national_front')}
            onRemove={() => setNationalFrontImage(null)}
          />
        ) : null}

        {needsBack ? (
          <UploadBox
            title={uiText("National ID (Back)")}
            subtitle="Tap or upload image"
            image={nationalBackImage}
            defaultFilename="national_id_back.jpg"
            onPress={() => handleBoxPress('national_back')}
            onRemove={() => setNationalBackImage(null)}
          />
        ) : null}

        {hasAnySelected ? (
          <Pressable
            style={[styles.submitBtn, uploadLoading && styles.submitBtnDisabled]}
            onPress={handleUploadAll}
            disabled={uploadLoading}
          >
            {uploadLoading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="cloud-upload-outline" size={16} color="#FFF" />
                <Text style={styles.submitBtnText}>{uiText("Submit Documents")}</Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
    );
  };

    if (!visible) return null;

  const content = (
        <View
          style={[
            styles.container,
            {
              paddingTop: Math.max(insets.top, 14),
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          {/* Global Aligned Header Matching Chat Screen & Booking Screens */}
          <View style={styles.header}>
            <Pressable onPress={handleClose} style={styles.backBtn} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </Pressable>

            <View style={styles.headerTitleCenter}>
              <Text style={styles.headerTitle}>{uiText("Document Verification")}</Text>
            </View>

            <View style={styles.headerRight}>
              <Image source={logoSource} style={styles.logo} resizeMode="contain" />
            </View>
          </View>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#FFB380" />
                <Text style={styles.loadingText}>{uiText("Loading verification status...")}</Text>
              </View>
            ) : (
              <>
                {renderStatusBanner()}

                {documents.length > 0 ? (
                  <>
                    <Text style={styles.sectionHeader}>{uiText("Submitted Documents")}</Text>
                    {documents.map(renderDocumentItem)}
                  </>
                ) : null}

                {renderUploadSection()}
              </>
            )}
          </ScrollView>
        </View>
  );

  return (
    <>
      {embedded ? content : <Modal visible={visible} animationType="none" transparent={false}
        statusBarTranslucent onRequestClose={handleClose}>{content}</Modal>}
      <IDPhotoModal
        visible={idPhotoVisible}
        onClose={() => setIdPhotoVisible(false)}
        onPickedImage={handlePickedImage}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F5F2',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EBE9E4',
    backgroundColor: '#F6F5F2',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1A1A1A',
    fontFamily: THEME.typography.fontFamily.display,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  logo: {
    height: 34,
    width: 34,
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#727272',
  },

  /* Banner Card */
  bannerCard: {
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  bannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0D0D11',
    marginBottom: 3,
  },
  bannerSubtitle: {
    fontSize: 12.5,
    color: '#727272',
    lineHeight: 18,
  },

  /* 3-Step Progress Indicator */
  progressBarWrapper: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
  progressCirclesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  progressStepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  progressStepCircleDone: {
    backgroundColor: '#16A34A',
  },
  progressStepCircleActive: {
    backgroundColor: '#D97706',
  },
  progressStepCircleWarning: {
    backgroundColor: '#DC2626',
  },
  progressStepCircleInactive: {
    backgroundColor: '#E5E7EB',
  },
  progressStepNum: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 6,
  },
  progressLineActive: {
    backgroundColor: '#16A34A',
  },
  progressLabelsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressStepLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  progressStepLabelDone: {
    color: '#15803D',
    fontWeight: '600',
  },
  progressStepLabelActive: {
    color: '#B45309',
    fontWeight: '600',
  },

  /* What happens next note */
  whatNextBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 12,
  },
  whatNextIcon: {
    marginRight: 8,
    marginTop: 1,
    flexShrink: 0,
  },
  whatNextText: {
    fontSize: 11.5,
    color: '#92400E',
    flex: 1,
    lineHeight: 16.5,
  },

  sectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0D0D11',
    marginBottom: 12,
    fontFamily: THEME.typography.fontFamily.mainBold,
  },

  /* Document Item Card */
  docItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  docItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  docItemTitleBox: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  docItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0D0D11',
  },
  docItemSub: {
    fontSize: 12,
    color: '#727272',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F6F5F2',
    flexShrink: 0,
  },
  statusBadgeVerified: {
    backgroundColor: '#10B981',
  },
  statusBadgePending: {
    backgroundColor: '#F6F5F2',
  },
  statusBadgeRejected: {
    backgroundColor: '#F6F5F2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D0D11',
  },
  statusBadgeTextVerified: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  statusBadgeTextPending: {
    color: '#FFB380',
  },
  statusBadgeTextRejected: {
    color: '#FF3E3E',
  },

  /* Rejected State Card */
  rejectedCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rejectedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
  },
  rejectedReasonText: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
    marginBottom: 10,
  },
  rejectedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reuploadFullBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFB43B',
    paddingVertical: 9,
    borderRadius: 8,
  },
  reuploadFullBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  removeBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFFFFF',
  },

  /* Scanning / Reading Document Banner */
  ocrScanningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 11,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  ocrScanningTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
  },
  ocrScanningSubtitle: {
    fontSize: 11.5,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },

  /* OCR Summary / Toggle Section */
  ocrSummarySection: {
    marginTop: 10,
  },
  ocrToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F6F5F2',
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  ocrToggleBtnActive: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: '#F6F5F2',
  },
  ocrToggleLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    minWidth: 0,
  },
  ocrToggleIcon: {
    marginRight: 8,
    flexShrink: 0,
  },
  ocrToggleBtnText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#374151',
  },
  ocrToggleBtnTextAlert: {
    color: '#B45309',
  },
  ocrToggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
  },
  seeDetailsText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#6B7280',
  },
  ocrExpandedContainer: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#D1D5DB',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 12,
  },

  /* Friendly Notice Callout Box */
  friendlyNoticeBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 11,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  friendlyNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  friendlyNoticeTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
  },
  friendlyNoticeText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
  },

  /* Discrepancy Box */
  discrepancyBox: {
    marginBottom: 8,
  },
  discrepancyBoxHeaderLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
  },
  humanDiscrepancyCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  humanFieldBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  humanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  humanRowDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  humanLabel: {
    fontSize: 11.5,
    color: '#6B7280',
    fontWeight: '500',
    flexShrink: 0,
    marginRight: 8,
  },
  humanValProfile: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    textAlign: 'right',
  },
  humanValDoc: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
    flex: 1,
    textAlign: 'right',
  },
  profileTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  profileTipText: {
    fontSize: 11.5,
    color: '#6B7280',
    flex: 1,
    lineHeight: 16,
  },

  /* Raw Document Data Collapsible */
  rawDocSection: {
    marginTop: 6,
  },
  rawDocToggleBtn: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  rawDocToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#4B5563',
  },
  rawDataTable: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 6,
    overflow: 'hidden',
  },
  rawDataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rawDataKey: {
    fontSize: 11.5,
    color: '#6B7280',
    fontWeight: '500',
    flex: 1,
  },
  rawDataVal: {
    fontSize: 12,
    color: '#1F2937',
    fontWeight: '600',
    flex: 1.5,
    textAlign: 'right',
  },

  /* Upload Section */
  uploadSection: {
    marginTop: 6,
  },
  uploadSectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 10,
    marginTop: 4,
  },
  uploadBox: {
    borderWidth: 1.5,
    borderColor: '#9CA3AF',
    borderStyle: 'dotted',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#FAFAF8',
  },
  uploadBoxHasImage: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F5F4F0',
  },
  uploadIcon: {
    marginBottom: 6,
  },
  uploadTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 3,
  },
  uploadSubtitle: {
    fontSize: 11.5,
    color: '#4B5563',
    marginBottom: 2,
  },
  uploadMeta: {
    fontSize: 9.5,
    color: '#9CA3AF',
  },
  attachmentContainer: {
    width: '100%',
    alignItems: 'center',
  },
  uploadPreview: {
    width: '100%',
    height: 105,
    borderRadius: 8,
  },
  previewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
  },
  removeImageBtn: {
    marginLeft: 8,
  },
  fileNameTextItalic: {
    fontStyle: 'italic',
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: '#FFB380',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#0D0D11',
    fontSize: 15,
    fontWeight: '800',
    fontFamily: THEME.typography.fontFamily.mainBold,
  },
});

