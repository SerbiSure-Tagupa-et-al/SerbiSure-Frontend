import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchWorkerCv, fetchWorkerDetails, saveWorkerDetails, workerCvExportUrl, type WorkerCv } from '../api/workerCvApi';
import { workerDraft, emptyWorkerDraft, validateWorkerPage } from './workerCv';
import { WorkerCvForm } from './WorkerCvForm';
import { requestResponse } from '../../../shared/api/httpClient';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { viewWorkerCvPdf } from './viewWorkerCvPdf';
import { WorkerCvPreview } from './WorkerCvPreview';
import { downloadWorkerCv } from './downloadWorkerCv';
import { generateWorkerCvPdf, GenerateCvPdfOptions } from './generateWorkerCvPdf';
import { useUser } from '../../auth/session/UserContext';
import THEME from '../../../shared/theme/theme';

const logoSource = require('../../../../assets/serbisure-icon.png');

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  token: string;
  editable?: boolean;
  onSaved?: () => void;
  avatarUrl?: string | null;
  email?: string | null;
}

export function WorkerCvModal({ visible, onClose, userId, token, editable = false, onSaved, avatarUrl, email }: Props) {
  const { tr: uiText } = useUiLanguage();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const [cv, setCv] = useState<WorkerCv | null>(null);
  const resolvedEmail = email || cv?.email || cv?.details?.email || (user.id === userId ? user.email : undefined);
  const [draft, setDraft] = useState(emptyWorkerDraft);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const action = useRef(false);
  const scroll = useRef<ScrollView>(null);

  const refresh = async (current: number) => {
    const result = await fetchWorkerCv(token, userId);
    if (current === generation.current) setCv(result);
  };

  useEffect(() => {
    const current = ++generation.current;
    setEditing(false);
    setPage(0);
    setError('');
    setCv(null);
    setBusy(false);
    action.current = false;
    if (visible && token && userId) {
      setLoading(true);
      refresh(current)
        .catch(() => {
          if (current === generation.current) setError('Could not load your CV. Check your connection and try again.');
        })
        .finally(() => {
          if (current === generation.current) setLoading(false);
        });
    }
    return () => {
      generation.current++;
    };
  }, [visible, token, userId]);

  const edit = async () => {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setError('');
    const current = generation.current;
    try {
      const result = await fetchWorkerDetails(token);
      if (current !== generation.current) return;
      const initialDraft = workerDraft(result, cv?.details?.service_categories || [], cv?.languages || '');
      if (!initialDraft.available_days || initialDraft.available_days.length === 0) {
        initialDraft.available_days = ['M', 'T', 'W', 'Th', 'F', 'S', 'Su'];
      }
      setDraft(initialDraft);
      setEditing(true);
    } catch {
      if (current === generation.current) setError('Could not load profile details. Please try again.');
    } finally {
      if (current === generation.current) {
        setBusy(false);
        action.current = false;
      }
    }
  };

  const updateCv = async () => {
    if (action.current) return;
    const msg0 = validateWorkerPage(draft, 0);
    if (msg0) {
      setError(msg0);
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const msg1 = validateWorkerPage(draft, 1);
    if (msg1) {
      setError(msg1);
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    action.current = true;
    setBusy(true);
    setError('');
    const current = generation.current;
    try {
      await saveWorkerDetails(token, draft);
      if (current !== generation.current) return;
      setEditing(false);
      await refresh(current);
      if (current === generation.current) onSaved?.();
    } catch (err) {
      if (current === generation.current) {
        let message = err instanceof Error ? err.message : 'Could not save your details. Please try again.';
        const details = err && typeof err === 'object' && 'details' in err ? (err as { details?: unknown }).details : null;
        if (details && typeof details === 'object') {
          const firstVal = Object.values(details as Record<string, unknown>)[0];
          const firstMsg = Array.isArray(firstVal) ? firstVal[0] : firstVal;
          if (typeof firstMsg === 'string' && firstMsg.trim()) message = firstMsg.trim();
        }
        setError(message);
      }
    } finally {
      if (current === generation.current) {
        action.current = false;
        setBusy(false);
      }
    }
  };

  const openLocalPdf = async (filePath: string): Promise<void> => {
    if (Platform.OS === 'android') {
      try {
        const contentUri = await FileSystem.getContentUriAsync(filePath);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: 'application/pdf',
          flags: 1,
        });
        return;
      } catch (intentErr) {
        console.warn('[WorkerCvModal] Direct intent launcher failed, falling back to Sharing:', intentErr);
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/pdf',
          dialogTitle: 'View your SerbiSure CV',
        });
        return;
      }
      throw new Error('Please install a PDF viewer app to view your CV.');
    }

    if (Platform.OS === 'ios') {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'View your SerbiSure CV',
        });
        return;
      }
      throw new Error('Please install a PDF viewer app to view your CV.');
    }

    throw new Error('PDF viewing is not supported on this platform.');
  };

  const preparePdfImageOptions = async (photoUrl?: string | null): Promise<GenerateCvPdfOptions> => {
    if (!photoUrl || typeof photoUrl !== 'string') return { email: resolvedEmail };
    try {
      let targetUrl = photoUrl;
      if (/res\.cloudinary\.com/i.test(targetUrl)) {
        if (targetUrl.includes('/upload/')) {
          targetUrl = targetUrl.replace('/upload/', '/upload/f_jpg,w_400,h_400,c_fill,g_face/');
        }
        targetUrl = targetUrl.replace(/\.(png|webp|avif|gif)$/i, '.jpg');
      }
      const isRemote = /^https?:\/\//i.test(targetUrl);
      let localPath = targetUrl;
      if (isRemote) {
        const cache = FileSystem.cacheDirectory;
        if (!cache) return { email: resolvedEmail };
        localPath = `${cache}cv_avatar_${Date.now()}.jpg`;
        const res = await FileSystem.downloadAsync(targetUrl, localPath);
        if (res.status !== 200) return { email: resolvedEmail };
      }
      const b64 = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
      if (!b64) return { email: resolvedEmail };

      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
      let hex = '';
      for (let i = 0; i < clean.length; i += 4) {
        const c0 = clean[i] || '';
        const c1 = clean[i + 1] || '';
        const c2 = clean[i + 2] || '';
        const c3 = clean[i + 3] || '';
        const b0 = chars.indexOf(c0);
        const b1 = chars.indexOf(c1);
        const b2 = c2 ? chars.indexOf(c2) : -1;
        const b3 = c3 ? chars.indexOf(c3) : -1;
        const n = (b0 << 18) | (b1 << 12) | ((b2 >= 0 ? b2 : 0) << 6) | (b3 >= 0 ? b3 : 0);
        hex += ((n >> 16) & 0xff).toString(16).padStart(2, '0');
        if (b2 >= 0) hex += ((n >> 8) & 0xff).toString(16).padStart(2, '0');
        if (b3 >= 0) hex += (n & 0xff).toString(16).padStart(2, '0');
      }

      if (!hex.toLowerCase().startsWith('ffd8ff')) return { email: resolvedEmail };

      let w = 200;
      let h = 200;
      const lower = hex.toLowerCase();
      const sofIdx = Math.max(lower.indexOf('ffc0'), lower.indexOf('ffc2'));
      if (sofIdx >= 0 && sofIdx + 18 <= lower.length) {
        const parsedH = parseInt(lower.substring(sofIdx + 10, sofIdx + 14), 16);
        const parsedW = parseInt(lower.substring(sofIdx + 14, sofIdx + 18), 16);
        if (parsedW > 0 && parsedH > 0) {
          w = parsedW;
          h = parsedH;
        }
      }
      return { imageHex: hex, imageWidth: w, imageHeight: h, email: resolvedEmail };
    } catch {
      return { email: resolvedEmail };
    }
  };

  const viewPdf = async () => {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setError('');
    const current = generation.current;
    const browser = Platform.OS === 'web' ? window.open('', '_blank') : null;
    try {
      if (cv) {
        const effectivePhoto = cv.profile_image_url || avatarUrl || (user.id === userId ? user.profileLink : undefined);
        const imageOpts = await preparePdfImageOptions(effectivePhoto);
        const pdfContent = generateWorkerCvPdf(cv, imageOpts);
        if (Platform.OS === 'web') {
          if (!browser) throw new Error('Allow popups for SerbiSure to view your PDF.');
          browser.document.title = `${cv.name || 'Worker'} - SerbiSure CV`;
          const blob = new Blob([pdfContent], { type: 'application/pdf' });
          const local = URL.createObjectURL(blob);
          browser.location.replace(local);
          setTimeout(() => URL.revokeObjectURL(local), 60000);
          return;
        } else {
          const cache = FileSystem.cacheDirectory;
          if (!cache) throw new Error('PDF viewing is unavailable in this app version.');
          const path = `${cache}SerbiSure_CV_${Date.now()}.pdf`;
          await FileSystem.writeAsStringAsync(path, pdfContent, { encoding: FileSystem.EncodingType.UTF8 });
          if (current !== generation.current) return;
          await openLocalPdf(path);
          return;
        }
      }

      const url = workerCvExportUrl(userId, 'pdf');
      if (Platform.OS === 'web') {
        if (!browser) throw new Error('Allow popups for SerbiSure to view your PDF.');
        browser.document.title = 'Preparing your SerbiSure CV';
        browser.document.body.textContent = 'Preparing your CV…';
        const response = await requestResponse(url, { token });
        if (!response.ok) throw new Error('Could not generate your PDF. Please try again.');
        const blob = await response.blob();
        if (current !== generation.current) {
          browser.close();
          return;
        }
        const local = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        browser.location.replace(local);
        setTimeout(() => URL.revokeObjectURL(local), 60000);
      } else {
        await viewWorkerCvPdf({
          fs: FileSystem,
          url,
          token,
          isCurrent: () => current === generation.current,
          openPdf: openLocalPdf,
        });
      }
    } catch (err) {
      browser?.close();
      if (current === generation.current) {
        const detail = err instanceof Error ? err.message : String(err || 'Unknown error');
        console.warn('[WorkerCvModal] viewPdf failed:', detail);
        const message = detail && detail.length < 150
          ? detail
          : 'Could not open your PDF. Check your connection and make sure a PDF viewer is installed, then try again.';
        setError(message);
        Alert.alert('Cannot view PDF', message);
        scroll.current?.scrollTo({ y: 0, animated: true });
      }
    } finally {
      if (current === generation.current) {
        action.current = false;
        setBusy(false);
      }
    }
  };

  const downloadPdf = async () => {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setError('');
    const current = generation.current;
    try {
      if (cv) {
        const effectivePhoto = cv.profile_image_url || avatarUrl || (user.id === userId ? user.profileLink : undefined);
        const imageOpts = await preparePdfImageOptions(effectivePhoto);
        const pdfContent = generateWorkerCvPdf(cv, imageOpts);
        if (Platform.OS === 'web') {
          const blob = new Blob([pdfContent], { type: 'application/pdf' });
          const local = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = local;
          link.download = `SerbiSure_${(cv.name || 'Worker').replace(/\s+/g, '_')}_CV.pdf`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(local), 10000);
          return;
        }

        const cache = FileSystem.cacheDirectory;
        if (!cache) throw new Error('File downloads are unavailable in this app version.');
        const fileName = `SerbiSure_${(cv.name || 'Worker').replace(/\s+/g, '_')}_CV.pdf`;
        const cachePath = `${cache}${fileName}`;
        await FileSystem.writeAsStringAsync(cachePath, pdfContent, { encoding: FileSystem.EncodingType.UTF8 });

        if (Platform.OS === 'android') {
          try {
            const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (!permission.granted || current !== generation.current) return;
            const base64Data = await FileSystem.readAsStringAsync(cachePath, { encoding: FileSystem.EncodingType.Base64 });
            const destination = await FileSystem.StorageAccessFramework.createFileAsync(
              permission.directoryUri,
              `SerbiSure_${(cv.name || 'Worker').replace(/\s+/g, '_')}_CV`,
              'application/pdf'
            );
            await FileSystem.StorageAccessFramework.writeAsStringAsync(destination, base64Data, {
              encoding: FileSystem.EncodingType.Base64,
            });
            if (current === generation.current) {
              Alert.alert('PDF saved', 'Your CV is saved in the folder you selected.');
            }
            return;
          } catch (safErr) {
            console.warn('[WorkerCvModal] SAF folder save failed, using sharing fallback:', safErr);
            if (await Sharing.isAvailableAsync()) {
              if (current !== generation.current) return;
              await Sharing.shareAsync(cachePath, {
                mimeType: 'application/pdf',
                dialogTitle: 'Save or share your SerbiSure CV',
              });
              return;
            }
            throw safErr;
          }
        } else {
          if (await Sharing.isAvailableAsync()) {
            if (current !== generation.current) return;
            await Sharing.shareAsync(cachePath, {
              mimeType: 'application/pdf',
              UTI: 'com.adobe.pdf',
              dialogTitle: 'Save or share your SerbiSure CV',
            });
            return;
          }
          throw new Error('File sharing is unavailable. Please install the latest SerbiSure app.');
        }
      }

      const url = workerCvExportUrl(userId, 'pdf');
      if (Platform.OS === 'web') {
        const response = await requestResponse(url, { token });
        if (!response.ok) throw new Error('Could not generate your PDF. Please try again.');
        const blob = await response.blob();
        if (current !== generation.current) return;
        const local = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        try {
          const link = document.createElement('a');
          link.href = local;
          link.download = 'SerbiSure_CV.pdf';
          document.body.appendChild(link);
          link.click();
          link.remove();
        } finally {
          setTimeout(() => URL.revokeObjectURL(local), 10000);
        }
      } else {
        const result = await downloadWorkerCv({
          platform: Platform.OS,
          url,
          token,
          format: 'pdf',
          fs: FileSystem,
          isCurrent: () => current === generation.current,
          getSharing: () => Sharing,
        });
        if (result === 'saved' && current === generation.current) {
          Alert.alert('PDF saved', 'Your CV is saved in the folder you selected.');
        }
      }
    } catch (err) {
      if (current === generation.current) {
        const detail = err instanceof Error ? err.message : String(err || 'Unknown error');
        console.warn('[WorkerCvModal] downloadPdf failed:', detail);
        const message = detail && detail.length < 150
          ? detail
          : 'Could not save your PDF. Check your connection and choose a writable folder, then try again.';
        setError(message);
        Alert.alert('Cannot download PDF', message);
        scroll.current?.scrollTo({ y: 0, animated: true });
      }
    } finally {
      if (current === generation.current) {
        action.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={() => {
        if (!action.current) {
          if (editing) {
            setEditing(false);
          } else {
            onClose();
          }
        }
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 12) }]}>
        {/* HEADER: Matching the standard screen header with left arrow, center title, and right icon */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uiText("Back")}
            disabled={busy}
            onPress={() => {
              if (editing) {
                setEditing(false);
              } else {
                onClose();
              }
            }}
            hitSlop={12}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#0D0D11" />
          </Pressable>

          <Text style={styles.title} numberOfLines={1}>
            {editing ? uiText("Edit CV Details") : uiText("SerbiSure CV")}
          </Text>

          <View style={styles.headerRight}>
            {editing ? (
              <Image
                source={logoSource}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            ) : editable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={uiText("Edit CV")}
                disabled={busy}
                onPress={edit}
                style={styles.headerEditBtn}
                hitSlop={8}
              >
                <Ionicons name="create-outline" size={24} color="#0D0D11" />
              </Pressable>
            ) : (
              <View style={styles.headerEmpty} />
            )}
          </View>
        </View>

        {/* CONTENT */}
        <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {loading && <ActivityIndicator color="#B45309" style={{ marginVertical: 20 }} />}
          {error !== '' && (
            <View accessibilityLiveRegion="polite" style={styles.error}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {!loading && !cv && (
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                setLoading(true);
                setError('');
                const current = generation.current;
                refresh(current)
                  .catch(() => {
                    if (current === generation.current) setError('Could not load CV. Please try again.');
                  })
                  .finally(() => {
                    if (current === generation.current) setLoading(false);
                  });
              }}
            >
              <Text style={styles.retryButtonText}>{uiText("Try Again")}</Text>
            </Pressable>
          )}

          {editing ? (
            <WorkerCvForm value={draft} onChange={setDraft} disabled={busy} />
          ) : (
            cv && <WorkerCvPreview cv={cv} />
          )}
        </ScrollView>

        {busy && (
          <View style={styles.busy} accessibilityLiveRegion="polite">
            <ActivityIndicator color="#B45309" />
            <Text style={styles.busyText}>{uiText("Preparing your CV…")}</Text>
          </View>
        )}

        {/* FOOTER: Matching Image 2 */}
        {!loading && cv && (
          <View style={styles.footer}>
            {editing ? (
              <View style={styles.editFooterRow}>
                <Pressable
                  disabled={busy}
                  style={styles.cancelEditButton}
                  onPress={() => {
                    setEditing(false);
                    setError('');
                  }}
                >
                  <Text style={styles.cancelEditText}>{uiText("Cancel")}</Text>
                </Pressable>
                <Pressable disabled={busy} style={styles.updateEditButton} onPress={updateCv}>
                  <Text style={styles.updateEditText}>{uiText("Update")}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.previewFooterRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Open a temporary PDF in your PDF viewer"
                  disabled={busy}
                  style={[styles.viewPdfButton, busy && styles.disabled]}
                  onPress={viewPdf}
                >
                  <Text style={styles.viewPdfText}>{uiText("View PDF")}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Save a copy of the PDF to your device"
                  disabled={busy}
                  style={[styles.downloadPdfButton, busy && styles.disabled]}
                  onPress={downloadPdf}
                >
                  <Text style={styles.downloadPdfText}>{uiText("Download PDF")}</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F5F2',
  },
  header: {
    height: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#F6F5F2',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBE6',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontWeight: '700',
    color: '#0D0D11',
    textAlign: 'center',
    flex: 1,
  },
  headerRight: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerEditBtn: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerEmpty: {
    width: 44,
    height: 44,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#F6F5F2',
    borderTopWidth: 1,
    borderTopColor: '#EBEBE6',
  },
  previewFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewPdfButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewPdfText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0D0D11',
  },
  downloadPdfButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#0D0D11',
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadPdfText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  editFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelEditButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelEditText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0D0D11',
  },
  updateEditButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#0D0D11',
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateEditText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.5,
  },
  retryButton: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFB380',
    borderRadius: 9999,
    marginVertical: 16,
  },
  retryButtonText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 14,
    fontWeight: '700',
    color: '#0D0D11',
  },
  error: {
    padding: 14,
    backgroundColor: '#FFF0DF',
    borderRadius: 14,
    marginBottom: 14,
  },
  errorText: {
    color: '#B45309',
    fontSize: 13,
  },
  busy: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    padding: 12,
  },
  busyText: {
    color: '#6B7280',
    fontSize: 13,
  },
});
