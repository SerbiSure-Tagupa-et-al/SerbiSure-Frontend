import { useLanguage as useUiLanguage } from '../shared/localization/LanguageContext';
import { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HomeIcon, MessageCircleIcon, UserIcon, PlusIcon } from '../shared/components/icons/LucideIcons';
import { useLanguage } from '../shared/localization/LanguageContext';
import THEME from '../shared/theme/theme';

import { BrowseScreen } from '../features/feed/screens/BrowseScreen';

import { useUser } from '../features/auth/session/UserContext';
import { chatStore } from '../features/chat/store/chatStore';
import { preloadPostLoginAssets } from './services/preloadAssets';

import { ROLE_CONFIG, resolveRole, type Role } from './roleConfig';
export type { Role } from './roleConfig';
import { HomeScreen } from '../features/feed/screens/HomeScreen';
import { ChatsScreen } from '../features/chat/screens/ChatsScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';
import { PostScreen } from '../features/posting/screens/PostScreen';
import { MyBookingsModal } from '../features/bookings/components/MyBookingsModal';
import { AppHeader } from '../shared/components/AppHeader';
import { NotificationBell } from '../features/notifications/NotificationContext';
import {
  AppTutorialOverlay,
  hasCompletedAppTutorial,
  markAppTutorialCompleted,
  type TargetRect,
  type TutorialTargetId,
} from './components/AppTutorialOverlay';
export type Tab = 'home' | 'browse' | 'chats' | 'profile';

interface AppNavigatorProps {
  role?: Role;
  avatarUri?: string | null;
  token?: string | null;
  initialShowTutorial?: boolean;
  onTutorialDismissed?: () => void;
  onUpdateAvatar?: (uri: string) => void;
  onLogout?: () => void;
}

export function AppNavigator({
  role = 'homeowner',
  avatarUri: oldAvatarUri,
  token,
  initialShowTutorial = false,
  onTutorialDismissed,
  onUpdateAvatar,
  onLogout,
}: AppNavigatorProps) {
  const { tr: uiText } = useUiLanguage();

  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [profileInitialView, setProfileInitialView] = useState<'main' | 'personal_info'>('main');
  const [profileCurrentView, setProfileCurrentView] = useState<'main' | 'personal_info'>('main');
  const [profileKey, setProfileKey] = useState(0);
  const [postJobVisible, setPostJobVisible] = useState(false);
  const [bookingsModalVisible, setBookingsModalVisible] = useState(false);
  const [totalUnreadChats, setTotalUnreadChats] = useState(chatStore.getTotalUnreadCount());
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialStepTarget, setTutorialStepTarget] = useState<TutorialTargetId>('browse');
  const [tutorialRects, setTutorialRects] = useState<Partial<Record<TutorialTargetId, TargetRect>>>({});
  const [rootSize, setRootSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const rootRef = useRef<View>(null);
  const browseTabRef = useRef<View>(null);
  const postFabRef = useRef<View>(null);
  const chatsTabRef = useRef<View>(null);
  const bookingsBtnRef = useRef<View>(null);
  const personalInfoRef = useRef<View>(null);
  const viewCvRef = useRef<View>(null);
  const getVerifiedRef = useRef<View>(null);

  const activeRole = resolveRole(user.accountType, role);
  const avatarUri = user.profileLink || oldAvatarUri;
  const authToken = token || user.token;

  const measureSingleTarget = useCallback((id: TutorialTargetId, ref: React.RefObject<View>) => {
    const node = ref.current;
    const rootNode = rootRef.current;
    if (!node || !rootNode) return;
    rootNode.measureInWindow((rx, ry, rw, rh) => {
      if (rw > 0 && rh > 0) {
        setRootSize((prev) => (prev.width === rw && prev.height === rh ? prev : { width: rw, height: rh }));
      }
      node.measureInWindow((tx, ty, width, height) => {
        if (width <= 0 || height <= 0) return;
        const nextRect: TargetRect = {
          x: Math.round(tx - (rx || 0)),
          y: Math.round(ty - (ry || 0)),
          width: Math.round(width),
          height: Math.round(height),
        };
        setTutorialRects((prev) => {
          const cur = prev[id];
          if (
            cur &&
            Math.abs(cur.x - nextRect.x) <= 1 &&
            Math.abs(cur.y - nextRect.y) <= 1 &&
            Math.abs(cur.width - nextRect.width) <= 1 &&
            Math.abs(cur.height - nextRect.height) <= 1
          ) {
            return prev;
          }
          return { ...prev, [id]: nextRect };
        });
      });
    });
  }, []);

  const measureTutorialTargets = useCallback(() => {
    const entries: Array<[TutorialTargetId, React.RefObject<View>]> = [
      ['browse', browseTabRef],
      ['post', postFabRef],
      ['chats', chatsTabRef],
      ['bookings', bookingsBtnRef],
      ['personal_info', personalInfoRef],
      ['view_cv_info', viewCvRef],
      ['get_verified', getVerifiedRef],
    ];
    entries.forEach(([id, ref]) => {
      measureSingleTarget(id, ref);
    });
  }, [measureSingleTarget]);

  const handleTutorialStepChange = useCallback((targetId: TutorialTargetId) => {
    setTutorialStepTarget(targetId);
    if (targetId === 'browse') {
      setActiveTab('browse');
    } else if (targetId === 'chats') {
      setActiveTab('chats');
    } else if (targetId === 'personal_info' || targetId === 'get_verified') {
      setProfileInitialView('main');
      setProfileCurrentView('main');
      setActiveTab('profile');
      requestAnimationFrame(() => {
        measureSingleTarget('personal_info', personalInfoRef);
        measureSingleTarget('get_verified', getVerifiedRef);
      });
    } else if (targetId === 'view_cv_info') {
      setProfileInitialView('personal_info');
      setProfileCurrentView('personal_info');
      setActiveTab('profile');
      requestAnimationFrame(() => {
        measureSingleTarget('view_cv_info', viewCvRef);
      });
    }
  }, [measureSingleTarget]);

  useEffect(() => {
    const storageUserId = user.id || user.email || (authToken ? 'authenticated_user' : '');
    if (initialShowTutorial) {
      setActiveTab('home');
      const timer = setTimeout(() => {
        measureTutorialTargets();
        setTutorialVisible(true);
      }, 280);
      return () => clearTimeout(timer);
    }
    if (!storageUserId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void hasCompletedAppTutorial(storageUserId).then((completed) => {
      if (!cancelled && !completed) {
        timer = setTimeout(() => {
          if (!cancelled) {
            measureTutorialTargets();
            setTutorialVisible(true);
          }
        }, 280);
      }
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initialShowTutorial, user.id, user.email, authToken, measureTutorialTargets]);

  const handleCloseTutorial = useCallback(() => {
    const storageUserId = user.id || user.email || (authToken ? 'authenticated_user' : '');
    setTutorialVisible(false);
    void markAppTutorialCompleted(storageUserId);
    onTutorialDismissed?.();
  }, [user.id, user.email, authToken, onTutorialDismissed]);

  const handleReplayTutorial = useCallback(() => {
    setProfileInitialView('main');
    setProfileCurrentView('main');
    setActiveTab('home');
    setTimeout(() => {
      measureTutorialTargets();
      setTutorialVisible(true);
    }, 180);
  }, [measureTutorialTargets]);

  useEffect(() => {
    setTotalUnreadChats(chatStore.getTotalUnreadCount());

    if (authToken) {
      chatStore.loadInbox(authToken);
      preloadPostLoginAssets(authToken, avatarUri);
    }

    const unsubscribe = chatStore.subscribe(() => {
      setTotalUnreadChats(chatStore.getTotalUnreadCount());
    });

    return () => {
      unsubscribe();
    };
  }, [authToken]);

  const handleOpenProfileView = () => {
    setProfileInitialView('personal_info');
    setProfileCurrentView('personal_info');
    setProfileKey((k) => k + 1);
    setActiveTab('profile');
  };

  const handleOpenBookings = () => {
    setBookingsModalVisible(true);
  };

  const handleProfileTargetsLayout = useCallback(() => {
    measureSingleTarget('personal_info', personalInfoRef);
    measureSingleTarget('view_cv_info', viewCvRef);
    measureSingleTarget('get_verified', getVerifiedRef);
  }, [measureSingleTarget]);

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen role={activeRole} avatarUri={avatarUri} onAvatarPress={handleOpenProfileView} onViewAll={() => setActiveTab('browse')} token={authToken} onBookingsPress={handleOpenBookings} />;
      case 'browse':
        return <BrowseScreen key={`${activeRole}:${user.id}`} role={activeRole} avatarUri={avatarUri} onViewProfile={handleOpenProfileView} token={authToken} onBookingsPress={handleOpenBookings} />;
      case 'chats':
        return <ChatsScreen role={activeRole} onBookingsPress={handleOpenBookings} />;
      case 'profile':
        return null;
    }
  };

  const shouldMountProfile = activeTab === 'profile' || tutorialVisible;

  const topBgColor = THEME.colors.canvas;

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={styles.root}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setRootSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        }
        measureTutorialTargets();
      }}
    >
      {/* Top Status Bar Solid Background Overlay */}
      <View style={{ height: insets.top, backgroundColor: topBgColor }} />

      {/* Shared fixed header across all tabs: Bookings, Logo, Notifications */}
      <AppHeader
        onBookingsPress={handleOpenBookings}
        bookingsButtonRef={bookingsBtnRef}
        onBookingsLayout={() => measureSingleTarget('bookings', bookingsBtnRef)}
        highlightBookings={tutorialVisible && tutorialStepTarget === 'bookings'}
        right={<NotificationBell />}
        left={
          activeTab === 'profile' && profileCurrentView === 'personal_info' ? (
            <Pressable
              style={styles.backCircleButton}
              onPress={() => {
                setProfileInitialView('main');
                setProfileCurrentView('main');
                setProfileKey((k) => k + 1);
              }}
              hitSlop={8}
            >
              <Ionicons name="arrow-back" size={24} color="#0D0D11" />
            </Pressable>
          ) : undefined
        }
      />

      <View style={styles.content}>
        {activeTab !== 'profile' && (
          <View style={styles.content}>{renderScreen()}</View>
        )}
        {shouldMountProfile && (
          <View
            style={[
              styles.content,
              activeTab !== 'profile' && { display: 'none' },
            ]}
          >
            <ProfileScreen
              key={`profile-${profileKey}`}
              role={activeRole}
              avatarUri={avatarUri}
              initialView={profileInitialView}
              tutorialActive={tutorialVisible}
              onViewChange={setProfileCurrentView}
              onUpdateAvatar={onUpdateAvatar}
              onBack={() => setActiveTab('home')}
              onLogout={onLogout}
              onBookingsPress={handleOpenBookings}
              onReplayTutorial={handleReplayTutorial}
              personalInfoTargetRef={personalInfoRef}
              viewCvTargetRef={viewCvRef}
              getVerifiedTargetRef={getVerifiedRef}
              onTutorialTargetsLayout={handleProfileTargetsLayout}
            />
          </View>
        )}
      </View>

      {/* Floating Bottom Navigation Dock */}
      <View style={[styles.navContainer, { bottom: Math.max(insets.bottom + 20, 32) }]}>
        <View style={styles.tabBar}>
          <View style={styles.tabItem}>
            <Pressable
              style={[styles.tabIconBg, activeTab === 'home' && styles.tabIconBgActive]}
              onPress={() => setActiveTab('home')}
            >
              <HomeIcon
                size={22}
                color={activeTab === 'home' ? '#0D0D11' : '#71717A'}
              />
            </Pressable>
          </View>

          <View style={styles.tabItem}>
            <View ref={browseTabRef} collapsable={false} onLayout={() => measureSingleTarget('browse', browseTabRef)}>
              <Pressable
                style={[styles.tabIconBg, activeTab === 'browse' && styles.tabIconBgActive]}
                onPress={() => setActiveTab('browse')}
              >
                <Ionicons
                  name="briefcase-outline"
                  size={23}
                  color={activeTab === 'browse' ? '#0D0D11' : '#71717A'}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.tabItem}>
            <View ref={chatsTabRef} collapsable={false} onLayout={() => measureSingleTarget('chats', chatsTabRef)}>
              <Pressable
                style={[styles.tabIconBg, activeTab === 'chats' && styles.tabIconBgActive]}
                onPress={() => setActiveTab('chats')}
              >
                <View style={styles.tabIconWrapper}>
                  <MessageCircleIcon
                    size={22}
                    color={activeTab === 'chats' ? '#0D0D11' : '#71717A'}
                  />
                  {totalUnreadChats > 0 && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>
                        {totalUnreadChats > 9 ? '9+' : totalUnreadChats}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            </View>
          </View>

          <View style={styles.tabItem}>
            <Pressable
              style={[styles.tabIconBg, activeTab === 'profile' && styles.tabIconBgActive]}
              onPress={() => {
                setProfileInitialView('main');
                setProfileKey((k) => k + 1);
                setActiveTab('profile');
              }}
            >
              <UserIcon
                size={22}
                color={activeTab === 'profile' ? '#0D0D11' : '#71717A'}
              />
            </Pressable>
          </View>
        </View>

        <View ref={postFabRef} collapsable={false} onLayout={() => measureSingleTarget('post', postFabRef)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uiText("Create a post")}
            accessibilityHint={uiText("Open the form to create a new post.")}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
            onPress={() => setPostJobVisible(true)}
          >
            <PlusIcon size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <PostScreen
        mode={ROLE_CONFIG[activeRole].postingMode}
        visible={postJobVisible}
        onClose={() => setPostJobVisible(false)}
        token={authToken}
        onOpenVerification={() => { setPostJobVisible(false); setProfileInitialView('personal_info'); setActiveTab('profile'); }}
      />

      <MyBookingsModal
        visible={bookingsModalVisible}
        onClose={() => setBookingsModalVisible(false)}
        token={authToken}
        accountType={user.accountType || (activeRole === 'homeowner' ? 'Homeowner' : 'Kasambahay')}
      />

      <AppTutorialOverlay
        visible={tutorialVisible}
        role={activeRole}
        targetRects={tutorialRects}
        containerWidth={rootSize.width}
        containerHeight={rootSize.height}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onStepChange={handleTutorialStepChange}
        onRequestMeasure={measureTutorialTargets}
        onClose={handleCloseTutorial}
        onFinish={handleCloseTutorial}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THEME.colors.canvas,
  },
  content: {
    flex: 1,
  },
  navContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  tabBar: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.roundness.pill,
    height: 58,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    marginRight: 14,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconBgActive: {
    backgroundColor: '#FFAA77',
  },
  tabIconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadge: {
    position: 'absolute',
    top: -5,
    right: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FE2C55',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  tabBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    includeFontPadding: false,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: THEME.roundness.pill,
    backgroundColor: '#FFAA77',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.95 }],
  },
  backCircleButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
