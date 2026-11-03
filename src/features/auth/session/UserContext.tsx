import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { savedJobsStore } from '../../bookings/store/savedJobsStore';
import { fetchVerificationStatus, type VerificationStatusResponse } from '../../verification/api/verificationApi';

type UserData = {
  id?: string;
  token?: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  email?: string;
  contactNumber?: string;
  showContactNumber?: boolean;
  userTags?: string[];
  profileLink?: string | null;
  accountType?: string;
  userAbout?: string;
  verificationStatus?: string;
  renewalRequired?: boolean;
  renewalPending?: boolean;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  street?: string;
  zipcode?: string;
  country?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  religion?: string;
  penaltyPoints?: number;
  isRestricted?: boolean;
  isOnJob?: boolean;
  isUpdatingJobStatus?: boolean;
};

type UserContextType = {
  user: UserData;
  setUser: React.Dispatch<React.SetStateAction<UserData>>;
  updateUser: (data: Partial<UserData>) => void;
  refreshUserProfile: () => Promise<VerificationStatusResponse | null>;
  refreshVerificationStatus: () => Promise<string | null>;
  getFirstNameOnly: () => string;
  getFullName: () => string;
};

const defaultUser: UserData = {
  id: '',
  token: null,
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  contactNumber: '',
  showContactNumber: false,
  userTags: [],
  street: '',
  city: '',
  province: '',
  zipcode: '',
  country: '',
  nationality: '',
};

const UserContext = createContext<UserContextType | undefined>(undefined);

function parseJWT(token: string) {
  try {
    const base64Url = token.split('.')[1];

    if (!base64Url) {
      return null;
    }

    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) { base64 += '='; }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

    let str = base64.replace(/=+$/, '');
    let output = '';

    for (
      let bc = 0, bs = 0, buffer, i = 0;
      (buffer = str.charAt(i++));
      ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4) ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))) : 0
    ) {
      buffer = chars.indexOf(buffer);
    }

    return JSON.parse(output)
  }
  catch (error) {
    return null
  }
}

export const UserProvider: React.FC<{ children: React.ReactNode, token?: string | null }> = ({ children, token }) => {
  const [user, setUser] = useState<UserData>(defaultUser);
  const session = useMemo(() => {
    const claims = token ? parseJWT(token) : null;
    return { token, claims, userId: String(claims?.user_id || claims?.id || claims?.sub || '') };
  }, [token]);
  const activeSession = useRef<typeof session | null>(session);
  activeSession.current = session;
  const verificationRequest = useRef<{ session: typeof session; promise: Promise<VerificationStatusResponse | null> } | null>(null);

  const refreshUserProfile = useCallback((): Promise<VerificationStatusResponse | null> => {
    if (!session.token || !session.userId || activeSession.current !== session) return Promise.resolve(null);
    if (verificationRequest.current?.session === session) return verificationRequest.current.promise;
    const promise = fetchVerificationStatus(session.token).then(data => {
      if (activeSession.current !== session) return null;
      const status = data?.overall_status;
      if (!['Verified', 'Pending', 'Rejected', 'Unverified'].includes(status)) return null;
      const info = data.user_info;
      setUser(previous => previous.id === session.userId ? {
        ...previous,
        verificationStatus: status,
        renewalRequired: data.renewal_required === true,
        renewalPending: data.renewal_pending === true,
        ...(data.profile_link !== undefined ? { profileLink: data.profile_link } : {}),
        ...(info?.first_name !== undefined ? { firstName: info.first_name ?? '' } : {}),
        ...(info?.middle_name !== undefined ? { middleName: info.middle_name ?? '' } : {}),
        ...(info?.last_name !== undefined ? { lastName: info.last_name ?? '' } : {}),
        ...(info?.date_of_birth !== undefined ? { dateOfBirth: info.date_of_birth || undefined } : {}),
      } : previous);
      return data;
    }).catch(() => null).finally(() => {
      if (verificationRequest.current?.session === session) verificationRequest.current = null;
    });
    verificationRequest.current = { session, promise };
    return promise;
  }, [session]);

  const refreshVerificationStatus = useCallback(async (): Promise<string | null> => {
    const data = await refreshUserProfile();
    return data?.overall_status ?? null;
  }, [refreshUserProfile]);

  useEffect(() => {
    if (token) {
      const decoded = session.claims

      if (decoded) {
        const userId = session.userId;
        setUser((previous) => ({
          id: userId,
          token: token,
          firstName: previous.id === userId ? previous.firstName : decoded.first_name || '',
          middleName: previous.id === userId ? previous.middleName : decoded.middle_name || '',
          lastName: previous.id === userId ? previous.lastName : decoded.last_name || '',
          email: decoded.email || '',
          contactNumber: decoded.contact_number || '',
          showContactNumber: decoded.show_contact_number ?? false,
          userTags: Array.isArray(decoded.user_tags) ? decoded.user_tags : [],
          profileLink: decoded.profile_link || null,
          accountType: decoded.account_type || '',
          verificationStatus: previous.id === userId && previous.verificationStatus
            ? previous.verificationStatus : decoded.verification_status || undefined,
          renewalRequired: previous.id === userId && previous.renewalRequired === true,
          renewalPending: previous.id === userId && previous.renewalPending === true,
          region: decoded.region || '',
          province: decoded.province || '',
          city: decoded.city || '',
          barangay: decoded.barangay || '',
          street: decoded.street || '',
          zipcode: decoded.zipcode || '',
          country: decoded.country || '',
          dateOfBirth: previous.id === userId ? previous.dateOfBirth : decoded.date_of_birth || undefined,
          gender: decoded.gender || undefined,
          nationality: decoded.nationality || '',
          religion: decoded.religion || undefined,
          penaltyPoints: decoded.penalty_points ?? decoded.cancellation_strikes ?? 0,
          isRestricted: decoded.is_restricted ?? false,
          isOnJob: previous.id === userId ? previous.isOnJob : undefined,
          isUpdatingJobStatus: previous.id === userId ? previous.isUpdatingJobStatus : undefined,
        }));

        // Initialize saved jobs store for this specific user
        savedJobsStore.initForUser(userId, token);
      }
      else {
        setUser({ id: '', token: null, firstName: '', middleName: '', lastName: '', email: '', contactNumber: '', showContactNumber: false, userTags: [], profileLink: null, accountType: '', street: '', city: '', province: '', zipcode: '', country: '', nationality: '' });
        savedJobsStore.clearStore();
      }
    }
    else {
      setUser({ id: '', token: null, firstName: '', middleName: '', lastName: '', email: '', contactNumber: '', showContactNumber: false, userTags: [], accountType: '', street: '', city: '', province: '', zipcode: '', country: '', nationality: '' });
      savedJobsStore.clearStore();
    }
  }, [token])

  useEffect(() => {
    activeSession.current = session;
    void refreshVerificationStatus();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshVerificationStatus();
    });
    return () => {
      if (activeSession.current === session) activeSession.current = null;
      subscription.remove();
    };
  }, [session, refreshVerificationStatus]);

  const updateUser = (data: Partial<UserData>) => {
    setUser((prev) => ({ ...prev, ...data }));
  };

  /**
   * Returns only the first word of the user's first name.
   * Example: "Daven Austhine" -> "Daven"
   */
  const getFirstNameOnly = (): string => {
    const raw = user.firstName || '';
    const firstWord = raw.trim().split(' ')[0];
    return firstWord || 'User';
  };

  /**
   * Returns the full name constructed from first, middle, and last name.
   * Example: "Daven Austhine Santos Sumagang" or "Daven Austhine Sumagang"
   */
  const getFullName = (): string => {
    const parts = [user.firstName, user.middleName, user.lastName].map((s) => s?.trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'User';
  };

  return (
    <UserContext.Provider value={{ user, setUser, updateUser, refreshUserProfile, refreshVerificationStatus, getFirstNameOnly, getFullName }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
