import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Sparkles } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { AdminPortalView } from './components/AdminPortalView';
import { AuthOnboarding } from './components/AuthOnboarding';
import { AzkarView } from './components/AzkarView';
import { AmbientDecorations } from './components/Decorations';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GroupCampsView, GroupSubTab } from './components/GroupCampsView';
import {
  DeleteAccountConfirmModal,
  SettingsModal,
  SignOutConfirmModal,
} from './components/Modals';
import {
  AnalyticsConsentBanner,
  BroadcastNotificationDetailModal,
  NotificationPrePermissionBanner,
} from './components/NotificationAndPrivacyPrompts';
import { OfflineIndicator } from './components/PWAComponents';
import { TopBannerAndNav } from './components/TopBannerAndNav';
import {
  getAnalyticsConsent,
  initAnalyticsIfConsented,
  isAnalyticsConfigured,
  setAnalyticsConsent,
  trackPageView,
} from './lib/analytics';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './lib/firebase';
import {
  resolveStudentPhoneE164FromAuth,
  toLocalEgyptianPhone,
} from './lib/phoneAuthUtils';
import {
  cleanupLegacyMessagingWorkers,
  enableWebPushForStudent,
  getStoredSubscriptionId,
  markBroadcastBannerDismissed,
  resolveStudentPushState,
  syncActiveWebPushIfGranted,
  wasBroadcastBannerDismissed,
} from './lib/webPush';
import { deleteStudentAccount, logSiteVisitor } from './services/campService';
import {
  deleteStudentPushSubscription,
  fetchSingleBroadcastNotification,
  recordBroadcastDeliveryReceipt,
} from './services/pushNotificationService';
import { AnalyticsConsentStatus, UserProfile } from './types/camp';

interface CampAppContentProps {
  onEnterAdminPortal: (token: string) => void;
}

function CampAppContent({ onEnterAdminPortal }: CampAppContentProps) {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [groupSubTab, setGroupSubTab] = useState<GroupSubTab>('exams');
  const [requestedGroupTab, setRequestedGroupTab] = useState<{
    tab: GroupSubTab;
    seq: number;
  } | null>(null);
  const [azkarOpen, setAzkarOpen] = useState(false);
  const [subTabResetKey, setSubTabResetKey] = useState(0);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signOutModalOpen, setSignOutModalOpen] = useState(false);
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [accountDeletedNotice, setAccountDeletedNotice] = useState('');

  // Web Push Pre-Permission & Incoming Broadcast Viewer State
  const [pushBannerVisible, setPushBannerVisible] = useState(false);
  const [pushIosInstallRequired, setPushIosInstallRequired] = useState(false);
  const [pushBannerBusy, setPushBannerBusy] = useState(false);
  const [pushBannerError, setPushBannerError] = useState('');
  const [pendingPushLink, setPendingPushLink] = useState<{
    notificationId: string;
    targetRoute: string;
    subscriptionId: string;
  } | null>(() => {
    try {
      const url = new URL(window.location.href);
      const notif = url.searchParams.get('notif') || '';
      const to = url.searchParams.get('to') || '';
      const sub = url.searchParams.get('sub') || '';
      if (notif || to) {
        return {
          notificationId: notif,
          targetRoute: to || 'notification_view',
          subscriptionId: sub,
        };
      }
    } catch {
      // Ignore URL errors
    }
    return null;
  });
  const [activeBroadcastDetail, setActiveBroadcastDetail] = useState<{
    id: string;
    title: string;
    body: string;
    imageUrl?: string;
    targetRoute?: string;
    createdAtText?: string;
  } | null>(null);

  // GA4 Consent State
  const [analyticsConsent, setAnalyticsConsentState] = useState<AnalyticsConsentStatus>(() =>
    getAnalyticsConsent()
  );

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('moaskar_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('moaskar_theme', theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const isDeletingAccountRef = useRef<boolean>(false);
  const [cachedAuthTimeMs, setCachedAuthTimeMs] = useState<number>(0);

  useEffect(() => {
    if (!deleteAccountModalOpen || !firebaseUser) return;
    let active = true;
    void firebaseUser
      .getIdTokenResult()
      .then((res) => {
        if (!active) return;
        const parsed = Date.parse(res.authTime);
        if (!Number.isNaN(parsed)) {
          setCachedAuthTimeMs(parsed);
        }
      })
      .catch(() => {
        // Fallback to user.metadata.lastSignInTime inside deleteStudentAccount
      });
    return () => {
      active = false;
    };
  }, [deleteAccountModalOpen, firebaseUser]);

  // Startup connection validation, visitor logging & consented GA4 bootstrap
  useEffect(() => {
    testConnection();
    void initAnalyticsIfConsented();
    const visitorPhone = toLocalEgyptianPhone(
      resolveStudentPhoneE164FromAuth({
        phoneNumber: firebaseUser?.phoneNumber,
        email: firebaseUser?.email,
        profilePhone: profile?.phone,
      })
    );
    void logSiteVisitor(
      visitorPhone || firebaseUser?.email || undefined,
      profile?.displayName || undefined
    );
  }, [firebaseUser, profile]);

  // Clean legacy ?tab= and push deep-link query parameters on mount & listen for SW messages
  useEffect(() => {
    void cleanupLegacyMessagingWorkers();
    try {
      const url = new URL(window.location.href);
      let changed = false;
      for (const param of ['tab', 'notif', 'to', 'sub']) {
        if (url.searchParams.has(param)) {
          url.searchParams.delete(param);
          changed = true;
        }
      }
      if (changed) {
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      // Ignore history errors
    }

    if (!('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data as
        | {
            type?: string;
            notificationId?: string;
            targetRoute?: string;
            subscriptionId?: string;
          }
        | undefined;
      if (!data || data.type !== 'DUO_CAMP_PUSH_NAVIGATE') return;
      setPendingPushLink({
        notificationId: data.notificationId || '',
        targetRoute: data.targetRoute || 'notification_view',
        subscriptionId: data.subscriptionId || '',
      });
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, []);

  const navigateToPushRoute = (targetRoute: string) => {
    if (targetRoute === 'azkar') {
      setAzkarOpen(true);
      return;
    }
    if (targetRoute === 'settings') {
      setSettingsOpen(true);
      return;
    }
    if (targetRoute === 'home') {
      setAzkarOpen(false);
      setSubTabResetKey((k) => k + 1);
      return;
    }
    if (
      targetRoute === 'exams' ||
      targetRoute === 'leaderboard' ||
      targetRoute === 'little_question'
    ) {
      setAzkarOpen(false);
      setRequestedGroupTab((prev) => ({
        tab: targetRoute,
        seq: (prev?.seq || 0) + 1,
      }));
    }
  };

  // Track SPA screen views cleanly whenever the authenticated user views Group Camps, Little Question, Exam Panel, or Azkar
  useEffect(() => {
    if (!firebaseUser || !profile) return;
    const screenKey = azkarOpen
      ? 'azkar'
      : groupSubTab === 'little_question'
        ? 'little_question'
        : groupSubTab === 'admin_exam_panel'
          ? 'admin_exam_panel'
          : 'group_camps';
    trackPageView(screenKey, Boolean(profile.groupCampId));
  }, [azkarOpen, groupSubTab, firebaseUser, profile, analyticsConsent]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setProfileLoaded(true);
        setAzkarOpen(false);
        setGroupSubTab('exams');
      } else {
        setAccountDeletedNotice('');
        setProfileLoaded(false);
      }
    });
    return () => unsub();
  }, []);

  // Real-time user profile listener
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const path = `userProfiles/${firebaseUser.uid}`;
    const unsub = onSnapshot(
      doc(db, 'userProfiles', firebaseUser.uid),
      (snap) => {
        if (isDeletingAccountRef.current) return;
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        } else {
          setProfile(null);
        }
        setProfileLoaded(true);
      },
      (error) => {
        if (isDeletingAccountRef.current) return;
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [authReady, firebaseUser]);

  // Web Push consent banner & background subscription sync for signed-in students
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile) {
      setPushBannerVisible(false);
      return;
    }
    let cancelled = false;
    void resolveStudentPushState(firebaseUser.uid).then(({ state, hasExplicitPreference }) => {
      if (cancelled) return;
      const shouldShow =
        !hasExplicitPreference &&
        !wasBroadcastBannerDismissed() &&
        (state === 'needs_permission' || state === 'ios_install_required');
      setPushIosInstallRequired(state === 'ios_install_required');
      setPushBannerVisible(shouldShow);
      if (state === 'ready' || Notification.permission === 'granted') {
        void syncActiveWebPushIfGranted(firebaseUser.uid);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, firebaseUser, profile]);

  // Process incoming Web Push click deep-link & persist delivery confirmation
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile || !pendingPushLink) return;
    const link = pendingPushLink;
    setPendingPushLink(null);

    if (link.targetRoute && link.targetRoute !== 'notification_view') {
      navigateToPushRoute(link.targetRoute);
    }

    if (link.notificationId) {
      const subId = link.subscriptionId || getStoredSubscriptionId() || 'sub_client';
      void recordBroadcastDeliveryReceipt({
        notificationId: link.notificationId,
        uid: firebaseUser.uid,
        subscriptionId: subId,
        status: 'opened',
      });
      void fetchSingleBroadcastNotification(link.notificationId).then((notif) => {
        if (!notif) return;
        setActiveBroadcastDetail({
          id: notif.id,
          title: notif.title,
          body: notif.body,
          imageUrl: notif.imageUrl || undefined,
          targetRoute: notif.targetRoute,
          createdAtText: notif.createdAt?.toDate
            ? notif.createdAt.toDate().toLocaleString('ar-EG')
            : undefined,
        });
      });
    }
  }, [authReady, firebaseUser, profile, pendingPushLink]);

  const handleEnablePushFromBanner = async () => {
    if (!firebaseUser || pushBannerBusy) return;
    setPushBannerBusy(true);
    setPushBannerError('');
    try {
      const res = await enableWebPushForStudent({
        uid: firebaseUser.uid,
        askPermissionIfDefault: true,
      });
      if (res.ok) {
        setPushBannerVisible(false);
      } else {
        setPushBannerError(res.errorMessage || 'مقدرناش نفعّل الإشعارات دلوقتي.');
        if (res.state === 'denied') {
          markBroadcastBannerDismissed(true);
        }
      }
    } finally {
      setPushBannerBusy(false);
    }
  };

  const handleDismissPushBanner = () => {
    markBroadcastBannerDismissed(true);
    setPushBannerVisible(false);
  };

  const handleAcceptAnalyticsConsent = async () => {
    await setAnalyticsConsent('granted');
    setAnalyticsConsentState('granted');
  };

  const handleDeclineAnalyticsConsent = async () => {
    await setAnalyticsConsent('denied');
    setAnalyticsConsentState('denied');
  };

  const showAnalyticsBanner =
    isAnalyticsConfigured() && analyticsConsent === 'unset';

  // Loading state
  if (!authReady || (firebaseUser && !profileLoaded)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <AmbientDecorations />
        <div className="glass-surface-strong rounded-3xl px-8 py-7 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 text-white flex items-center justify-center animate-pulse">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="font-display font-bold text-lg text-slate-900 dark:text-white">
            بنجهّز معسكر مغلق دلوقتي...
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">بنعمل مزامنة لبياناتكم والمعسكرات الجماعية لحظة بلحظة</p>
        </div>
      </div>
    );
  }

  const handleConfirmDeleteAccount = async (password?: string) => {
    if (!firebaseUser || deletingAccount) return;
    isDeletingAccountRef.current = true;
    setDeleteAccountError('');
    setDeletingAccount(true);
    try {
      await deleteStudentAccount({
        user: firebaseUser,
        profile,
        authTimeMs: cachedAuthTimeMs,
        password,
      });
      setDeleteAccountModalOpen(false);
      setSettingsOpen(false);
      setAzkarOpen(false);
      setGroupSubTab('exams');
      setProfile(null);
      setFirebaseUser(null);
      setAccountDeletedNotice(
        'حسابك اتمسح بالكامل خلاص. تقدر أو تقدري تسجلوا تاني بنفس رقم الموبايل أو برقم غيره وتعملوا حساب جديد من الأول.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setDeleteAccountError(
        err instanceof Error ? err.message : 'مقدرناش نحذف الحساب دلوقتي. لو سمحت حاول أو حاولي تاني.'
      );
    } finally {
      isDeletingAccountRef.current = false;
      setDeletingAccount(false);
    }
  };

  const openDeleteAccountModal = () => {
    setDeleteAccountError('');
    setSettingsOpen(false);
    setDeleteAccountModalOpen(true);
  };

  const studentDeleteAccountLabel =
    toLocalEgyptianPhone(
      resolveStudentPhoneE164FromAuth({
        phoneNumber: firebaseUser?.phoneNumber,
        email: firebaseUser?.email,
        profilePhone: profile?.phone,
      })
    ) ||
    firebaseUser?.email ||
    '';

  const deleteAccountModal = (
    <DeleteAccountConfirmModal
      open={deleteAccountModalOpen}
      accountLabel={studentDeleteAccountLabel}
      requirePasswordConfirm={Boolean(
        firebaseUser?.providerData?.some((p) => p.providerId === 'password')
      )}
      busy={deletingAccount}
      errorMsg={deleteAccountError}
      onClose={() => {
        if (!deletingAccount) {
          setDeleteAccountModalOpen(false);
          setDeleteAccountError('');
        }
      }}
      onConfirmDelete={handleConfirmDeleteAccount}
    />
  );

  // Onboarding / Phone+Password Sign-In / Mandatory Triple Name + Photo Profile Setup
  if (!firebaseUser || !profile) {
    return (
      <>
        <AmbientDecorations />
        <AuthOnboarding
          firebaseUser={firebaseUser}
          profile={profile}
          onProfileSaved={(updated) => setProfile(updated)}
          onRequestDeleteAccount={firebaseUser ? openDeleteAccountModal : undefined}
          accountDeletedNotice={accountDeletedNotice}
          onDismissAccountDeletedNotice={() => setAccountDeletedNotice('')}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <AnalyticsConsentBanner
          visible={showAnalyticsBanner}
          onAccept={handleAcceptAnalyticsConsent}
          onDecline={handleDeclineAnalyticsConsent}
        />
        {deleteAccountModal}
      </>
    );
  }

  const isLittleQuestionActive = !azkarOpen && groupSubTab === 'little_question';
  const isLeaderboardActive = !azkarOpen && groupSubTab === 'leaderboard';

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`min-h-screen pb-12 transition-colors duration-300 ${
          isLittleQuestionActive
            ? 'bg-[#12051c] text-rose-50'
            : isLeaderboardActive
              ? 'bg-[#0b031d] text-white'
              : azkarOpen
                ? 'bg-[#120722] text-rose-50'
                : ''
        }`}
      >
        <AmbientDecorations />

        <TopBannerAndNav
          profile={profile}
          isLittleQuestionActive={isLittleQuestionActive}
          isAzkarActive={azkarOpen}
          onToggleAzkar={() => setAzkarOpen((prev) => !prev)}
          onGoHome={() => {
            setAzkarOpen(false);
            setSubTabResetKey((k) => k + 1);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onSignOut={() => setSignOutModalOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main
          className={
            azkarOpen
              ? 'max-w-6xl mx-auto px-3 sm:px-6 pt-4'
              : 'max-w-7xl mx-auto px-4 sm:px-6 pt-6'
          }
        >
          <NotificationPrePermissionBanner
            visible={pushBannerVisible}
            busy={pushBannerBusy}
            iosInstallRequired={pushIosInstallRequired}
            errorMsg={pushBannerError}
            onEnable={() => void handleEnablePushFromBanner()}
            onDismiss={handleDismissPushBanner}
          />
          {azkarOpen ? (
            <AzkarView onBack={() => setAzkarOpen(false)} />
          ) : (
            <GroupCampsView
              profile={profile}
              onProfileChanged={(updated) => setProfile(updated)}
              subTabResetKey={subTabResetKey}
              requestedSubTab={requestedGroupTab}
              onSubTabChanged={setGroupSubTab}
            />
          )}
        </main>

        <AnalyticsConsentBanner
          visible={showAnalyticsBanner}
          onAccept={handleAcceptAnalyticsConsent}
          onDecline={handleDeclineAnalyticsConsent}
        />

        <BroadcastNotificationDetailModal
          notification={activeBroadcastDetail}
          onClose={() => setActiveBroadcastDetail(null)}
          onOpenDestination={navigateToPushRoute}
        />

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          profile={profile}
          onProfileUpdated={(updated) => setProfile(updated)}
          onEnterAdminPortal={onEnterAdminPortal}
          onConsentChanged={(next) => setAnalyticsConsentState(next)}
          onRequestDeleteAccount={openDeleteAccountModal}
        />

        <SignOutConfirmModal
          open={signOutModalOpen}
          onClose={() => setSignOutModalOpen(false)}
          onConfirmSignOut={async () => {
            const subId = getStoredSubscriptionId();
            if (subId) {
              await deleteStudentPushSubscription(firebaseUser.uid, subId);
            }
            await signOut(auth);
          }}
        />

        {deleteAccountModal}
        <OfflineIndicator />
      </div>
    </MotionConfig>
  );
}

export default function App() {
  const [adminGateToken, setAdminGateToken] = useState('');
  const [isAdminRoute, setIsAdminRoute] = useState(() => {
    const h = window.location.hash.toLowerCase();
    const s = window.location.search.toLowerCase();
    return h.includes('admin') || s.includes('admin');
  });

  useEffect(() => {
    const checkAdmin = () => {
      const h = window.location.hash.toLowerCase();
      const s = window.location.search.toLowerCase();
      setIsAdminRoute(h.includes('admin') || s.includes('admin'));
    };
    window.addEventListener('hashchange', checkAdmin);
    window.addEventListener('popstate', checkAdmin);
    return () => {
      window.removeEventListener('hashchange', checkAdmin);
      window.removeEventListener('popstate', checkAdmin);
    };
  }, []);

  const handleEnterAdminPortal = (token: string) => {
    setAdminGateToken(token);
    setIsAdminRoute(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('admin', '1');
      window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Ignore history errors
    }
  };

  const handleExitAdminPortal = () => {
    setIsAdminRoute(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('admin');
      const cleanHash = url.hash.toLowerCase().includes('admin') ? '' : url.hash;
      window.history.pushState({}, '', `${url.pathname}${url.search}${cleanHash}`);
    } catch {
      // Ignore history errors
    }
  };

  if (isAdminRoute) {
    return (
      <ErrorBoundary>
        <AdminPortalView
          gateToken={adminGateToken}
          onGateVerified={setAdminGateToken}
          onExitAdminPortal={handleExitAdminPortal}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <CampAppContent onEnterAdminPortal={handleEnterAdminPortal} />
    </ErrorBoundary>
  );
}
