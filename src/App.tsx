import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  WriteBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Cloud,
  Database,
  FileSpreadsheet,
  IndianRupee,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  AllocationTarget,
  ClassLevel,
  DEFAULT_ACADEMIC_YEARS,
  DEFAULT_FEE_STRUCTURE_SETTINGS,
  FeeStructureSettings,
  HeaderConfig,
  ImportConflictRow,
  PaymentMode,
  PaymentRecord,
  RegisterStatusCategory,
  StudentRecord,
  WorkspaceBackupPayload,
} from './types';
import {
  buildOpeningPaymentsForStudent,
  createInitialSeedData,
  formatINR,
  generateNextReceiptNo,
  getNextAcademicYear,
  normalizeHeaderConfig,
  resolveStudentInAcademicYear,
  safeJsonParse,
  sanitizePaymentPayload,
  sanitizeStudentPayload,
  updateBatchHeadWithCascade,
} from './utils/ledgerLogic';
import {
  exportWorkspaceBackupJSON,
  MAX_BACKUP_PAYMENT_ROWS,
  MAX_IMPORT_STUDENT_ROWS,
  parseWorkspaceBackupJSON,
} from './utils/excelUtils';
import { DashboardOverview } from './components/DashboardOverview';
import { FeeCollectionTable } from './components/FeeCollectionTable';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { StudentFormModal } from './components/StudentFormModal';
import { StudentFeeLedgerPage } from './components/StudentFeeLedgerPage';
import { MastersManagementPage } from './components/MastersManagementPage';
import { HeadersManagementPage } from './components/HeadersManagementPage';
import { ReportsSection } from './components/ReportsSection';
import { CollectionAnalyticsPage } from './components/CollectionAnalyticsPage';
import { AddStudentPage } from './components/AddStudentPage';

type ActiveMenuSection =
  | 'dashboard'
  | 'collect_fee'
  | 'collection_analytics'
  | 'students_master'
  | 'excel_tools'
  | 'add_student'
  | 'headers'
  | 'reports'
  | 'student_ledger';

const LOCAL_STORAGE_STUDENTS_KEY = 'eduledger_mis_v3_students';
const LOCAL_STORAGE_PAYMENTS_KEY = 'eduledger_mis_v3_payments';
const LOCAL_STORAGE_AYS_KEY = 'eduledger_mis_v3_ays';
const LOCAL_STORAGE_FEE_SETTINGS_KEY = 'eduledger_mis_v3_fee_settings';
const LOCAL_STORAGE_HEADERS_KEY = 'eduledger_mis_v3_headers';
const LOCAL_STORAGE_DIRTY_KEY = 'eduledger_mis_v3_local_dirty';

const FIRESTORE_CHUNK_LIMIT = 380;

async function commitOperationsInChunks<T>(
  items: T[],
  applyOp: (batch: WriteBatch, item: T) => void
): Promise<void> {
  for (let i = 0; i < items.length; i += FIRESTORE_CHUNK_LIMIT) {
    const slice = items.slice(i, i + FIRESTORE_CHUNK_LIMIT);
    const batch = writeBatch(db);
    slice.forEach((item) => applyOp(batch, item));
    await batch.commit();
  }
}

export default function App() {
  // Authentication State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Local dirty tracking & Cloud merge prompt on Sign-In
  const [localDirty, setLocalDirty] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_DIRTY_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [pendingCloudMerge, setPendingCloudMerge] = useState<{
    cloudStudents: StudentRecord[];
    cloudPayments: PaymentRecord[];
  } | null>(null);
  const mergePromptHandledRef = useRef<boolean>(false);

  // Navigation State (Ultra-Simple 4-Item Sidebar + Detail Ledger View)
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [activeMenu, setActiveMenu] = useState<ActiveMenuSection>('dashboard');
  const [addStudentReturnMenu, setAddStudentReturnMenu] =
    useState<ActiveMenuSection>('students_master');
  const [activeMasterTab, setActiveMasterTab] = useState<
    'BATCH_MASTER' | 'FEE_HEAD_MASTER' | 'EXCEL_IMPORT'
  >('EXCEL_IMPORT');

  // Clean Year-Only Academic Year State (2025-26, 2026-27, 2027-28, 2028-29...)
  const [availableAYs, setAvailableAYs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_AYS_KEY);
      if (saved) {
        const parsed = safeJsonParse<unknown>(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter(
            (y): y is string =>
              typeof y === 'string' && /^\d{4}-\d{2,4}$/.test(y)
          );
          if (valid.length > 0) return Array.from(new Set(valid)).slice(0, 50);
        }
      }
    } catch {
      // ignore
    }
    return [...DEFAULT_ACADEMIC_YEARS];
  });

  // Centralized Headers Configuration (Batch/Class Heads, 1st/2nd Year Fee Heads, Receipt & Status Labels)
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_HEADERS_KEY);
      if (saved) {
        const parsed = safeJsonParse<Partial<HeaderConfig>>(saved);
        return normalizeHeaderConfig(parsed, availableAYs);
      }
    } catch {
      // ignore
    }
    return normalizeHeaderConfig(undefined, availableAYs);
  });

  // Configurable Fee Head & Receipt Settings
  const [feeSettings, setFeeSettings] = useState<FeeStructureSettings>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_FEE_SETTINGS_KEY);
      if (saved) {
        const parsed = safeJsonParse<Record<string, unknown>>(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const cleanName =
            typeof parsed.schoolDisplayName === 'string'
              ? parsed.schoolDisplayName
                  .replace(/[\x00-\x1F\x7F]/g, '')
                  .trim()
                  .slice(0, 100)
              : '';
          const cleanPrefix =
            typeof parsed.receiptPrefix === 'string'
              ? parsed.receiptPrefix
                  .replace(/[^a-zA-Z0-9]/g, '')
                  .toUpperCase()
                  .slice(0, 8)
              : '';
          return {
            schoolDisplayName:
              cleanName || DEFAULT_FEE_STRUCTURE_SETTINGS.schoolDisplayName,
            classXIDefaultFee: Math.min(
              10000000,
              Math.max(
                0,
                Math.round(
                  Number(parsed.classXIDefaultFee) ||
                    DEFAULT_FEE_STRUCTURE_SETTINGS.classXIDefaultFee
                )
              )
            ),
            classXIIDefaultFee: Math.min(
              10000000,
              Math.max(
                0,
                Math.round(
                  Number(parsed.classXIIDefaultFee) ||
                    DEFAULT_FEE_STRUCTURE_SETTINGS.classXIIDefaultFee
                )
              )
            ),
            receiptPrefix:
              cleanPrefix || DEFAULT_FEE_STRUCTURE_SETTINGS.receiptPrefix,
          };
        }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_FEE_STRUCTURE_SETTINGS };
  });

  // Default to 2026-27 (shows all 143 active students: 83 Class XI + 60 promoted Class XII)
  const [selectedAY, setSelectedAY] = useState<string>('2026-27');

  // Data State (143 Real Students from User's Integrated Fees Register)
  const [students, setStudents] = useState<StudentRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_STUDENTS_KEY);
      if (saved) {
        const parsed = safeJsonParse<unknown>(saved);
        if (Array.isArray(parsed) && parsed.length >= 1) {
          const clean = parsed
            .slice(0, MAX_IMPORT_STUDENT_ROWS)
            .filter(
              (item): item is Record<string, unknown> =>
                Boolean(item && typeof item === 'object' && !Array.isArray(item))
            )
            .map((item) => sanitizeStudentPayload(item));
          if (clean.length >= 1) return clean;
        }
      }
    } catch {
      // ignore
    }
    return createInitialSeedData('local_workspace').students;
  });

  const [payments, setPayments] = useState<PaymentRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_PAYMENTS_KEY);
      if (saved) {
        const parsed = safeJsonParse<unknown>(saved);
        if (Array.isArray(parsed) && parsed.length >= 1) {
          return parsed
            .slice(0, MAX_BACKUP_PAYMENT_ROWS)
            .filter(
              (item): item is Record<string, unknown> =>
                Boolean(item && typeof item === 'object' && !Array.isArray(item))
            )
            .map((item) => sanitizePaymentPayload(item));
        }
      }
    } catch {
      // ignore
    }
    return createInitialSeedData('local_workspace').payments;
  });

  // Shared Collection / Directory Filter State
  const [classTab, setClassTab] = useState<'ALL' | ClassLevel | 'PENDING'>('ALL');
  const [batchFilter, setBatchFilter] = useState<string>('ALL');
  const [remarkFilter, setRemarkFilter] = useState<
    'ALL' | RegisterStatusCategory
  >('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Student for Individual Student Fee Ledger
  const [activeLedgerStudentId, setActiveLedgerStudentId] =
    useState<string>('stu_reg_001');

  // Modals
  const [paymentModalStudent, setPaymentModalStudent] =
    useState<StudentRecord | null>(null);
  const [studentFormModalOpen, setStudentFormModalOpen] =
    useState<boolean>(false);
  const [studentFormDefaultTab, setStudentFormDefaultTab] = useState<
    'single' | 'bulk'
  >('single');
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(
    null
  );
  const [deletingStudent, setDeletingStudent] = useState<StudentRecord | null>(
    null
  );
  const [pendingRestoreBackup, setPendingRestoreBackup] =
    useState<WorkspaceBackupPayload | null>(null);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  const studentsRef = useRef(students);
  const paymentsRef = useRef(payments);
  const localDirtyRef = useRef(localDirty);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    paymentsRef.current = payments;
  }, [payments]);

  useEffect(() => {
    localDirtyRef.current = localDirty;
    try {
      localStorage.setItem(LOCAL_STORAGE_DIRTY_KEY, String(localDirty));
    } catch {
      // ignore
    }
  }, [localDirty]);

  const markLocalEditIfOffline = () => {
    if (!user) {
      setLocalDirty(true);
    }
  };

  const showToast = (msg: string) => {
    setToastBanner(msg);
    window.setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // Global Escape Key Handler for Modals & Mobile Drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDeletingStudent(null);
        setPendingRestoreBackup(null);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_STUDENTS_KEY,
        JSON.stringify(students)
      );
    } catch {
      // ignore
    }
  }, [students]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_PAYMENTS_KEY,
        JSON.stringify(payments)
      );
    } catch {
      // ignore
    }
  }, [payments]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_AYS_KEY,
        JSON.stringify(availableAYs)
      );
    } catch {
      // ignore
    }
  }, [availableAYs]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_FEE_SETTINGS_KEY,
        JSON.stringify(feeSettings)
      );
    } catch {
      // ignore
    }
  }, [feeSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_HEADERS_KEY,
        JSON.stringify(headerConfig)
      );
    } catch {
      // ignore
    }
  }, [headerConfig]);

  // Listen to Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        mergePromptHandledRef.current = false;
        setPendingCloudMerge(null);
      }
    });
    return () => unsub();
  }, []);

  // Helper: Two-phase chunked write to Firestore (students FIRST so payment exists() rule succeeds!)
  const pushWorkspaceToFirestore = async (
    uid: string,
    targetStudents: StudentRecord[],
    targetPayments: PaymentRecord[]
  ) => {
    // Phase 1: Write all student docs first in chunks <= 380
    await commitOperationsInChunks(targetStudents, (batch, st) => {
      const sanitized = sanitizeStudentPayload({ ...st, ownerId: uid });
      batch.set(doc(db, 'students', sanitized.studentId), {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    // Phase 2: Write all payment docs after students exist in Firestore
    const validStudentIds = new Set(targetStudents.map((s) => s.studentId));
    const safePayments = targetPayments.filter((p) =>
      validStudentIds.has(p.studentId)
    );
    await commitOperationsInChunks(safePayments, (batch, pay) => {
      const sanitizedPay = sanitizePaymentPayload({ ...pay, ownerId: uid });
      batch.set(doc(db, 'payments', sanitizedPay.paymentId), {
        ...sanitizedPay,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  };

  // Firestore Real-time Sync (Two-Phase Chunked Seed + Local-to-Cloud Merge Guard)
  useEffect(() => {
    if (!authReady || !user) return;

    const studentsQuery = query(
      collection(db, 'students'),
      where('ownerId', '==', user.uid)
    );
    const paymentsQuery = query(
      collection(db, 'payments'),
      where('ownerId', '==', user.uid)
    );

    let latestCloudPayments: PaymentRecord[] = [];
    let isSeeding = false;

    const unsubStudents = onSnapshot(
      studentsQuery,
      async (snapshot) => {
        const hasOldFormat = snapshot.docs.some(
          (d) =>
            d.id.startsWith('stu_2025_10') ||
            d.id.startsWith('stu_2024_20') ||
            (d.data().rollNo && String(d.data().rollNo).startsWith('SR-'))
        );

        if ((snapshot.empty || hasOldFormat) && !isSeeding) {
          isSeeding = true;
          try {
            // Delete legacy docs if migrating
            const oldRefs = snapshot.docs.filter(
              (oldDoc) => !oldDoc.id.startsWith('stu_reg_')
            );
            if (oldRefs.length > 0) {
              await commitOperationsInChunks(oldRefs, (batch, oldDoc) => {
                batch.delete(oldDoc.ref);
              });
            }

            // If user made local edits before signing in, upload their local workspace directly!
            if (localDirtyRef.current && studentsRef.current.length > 0) {
              await pushWorkspaceToFirestore(
                user.uid,
                studentsRef.current,
                paymentsRef.current
              );
              setLocalDirty(false);
            } else {
              const seeded = createInitialSeedData(user.uid);
              await pushWorkspaceToFirestore(
                user.uid,
                seeded.students,
                seeded.payments
              );
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, 'students');
          } finally {
            isSeeding = false;
          }
          return;
        }

        const cloudDocs = snapshot.docs
          .map((d) => d.data() as StudentRecord)
          .sort((a, b) => a.studentId.localeCompare(b.studentId));

        // If user edited locally offline and cloud already has existing data, ask before overwriting!
        if (localDirtyRef.current && !mergePromptHandledRef.current) {
          mergePromptHandledRef.current = true;
          setPendingCloudMerge({
            cloudStudents: cloudDocs,
            cloudPayments: latestCloudPayments,
          });
          return;
        }

        setStudents(cloudDocs);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'students');
      }
    );

    const unsubPayments = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as PaymentRecord);
        latestCloudPayments = docs;
        if (localDirtyRef.current && !mergePromptHandledRef.current) {
          return;
        }
        if (pendingCloudMerge) {
          setPendingCloudMerge((prev) =>
            prev ? { ...prev, cloudPayments: docs } : null
          );
          return;
        }
        setPayments(docs);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'payments');
      }
    );

    return () => {
      unsubStudents();
      unsubPayments();
    };
  }, [authReady, user]);

  // Resolve Local-to-Cloud Merge Prompt
  const handleAcceptCloudData = () => {
    if (!pendingCloudMerge) return;
    setStudents(pendingCloudMerge.cloudStudents);
    setPayments(pendingCloudMerge.cloudPayments);
    setLocalDirty(false);
    setPendingCloudMerge(null);
    showToast('Loaded your saved Cloud Firestore register.');
  };

  const handleUploadLocalToCloud = async () => {
    if (!user) return;
    try {
      await pushWorkspaceToFirestore(user.uid, students, payments);
      setLocalDirty(false);
      setPendingCloudMerge(null);
      showToast('Uploaded your local workspace changes to Cloud Firestore.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'students');
    }
  };

  // Auth Handlers
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast(
        'Signed in with Google. All Student Ledgers synced with Cloud Firestore.'
      );
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Google Sign-In could not complete.'
      );
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    showToast('Signed out. Working in local browser session.');
  };

  // Add New Academic Year
  const handleAddBatchAY = (newAY: string) => {
    const cleaned = newAY.trim();
    if (!/^\d{4}-\d{2,4}$/.test(cleaned)) {
      showToast('Enter Academic Year in YYYY-YY format (e.g. 2029-30).');
      return;
    }
    const nextAY = getNextAcademicYear(cleaned);
    const updated = Array.from(
      new Set([...availableAYs, cleaned, nextAY])
    ).sort();
    setAvailableAYs(updated);
    setHeaderConfig((prev) => normalizeHeaderConfig(prev, updated));
    setSelectedAY(cleaned);
    showToast(`Added Academic Year ${cleaned} (linked to ${nextAY}).`);
  };

  // Centralized Header Update (Fee Heads, Receipt Labels, Status Labels)
  const handleUpdateHeaderConfig = (
    next: HeaderConfig,
    toastMessage?: string
  ) => {
    setHeaderConfig(normalizeHeaderConfig(next, availableAYs));
    if (toastMessage) showToast(toastMessage);
  };

  // Centralized Batch Head Save + Automatic Cascade Across Students, Payments & Available Years
  const handleSaveBatchHead = async (params: {
    batchId: string;
    nextEnrollmentAY: string;
    nextBatchTitle: string;
    nextClassXIHeadName: string;
    nextClassXIIHeadName: string;
  }) => {
    const result = updateBatchHeadWithCascade({
      headerConfig,
      students,
      payments,
      availableAYs,
      batchId: params.batchId,
      nextEnrollmentAY: params.nextEnrollmentAY,
      nextBatchTitle: params.nextBatchTitle,
      nextClassXIHeadName: params.nextClassXIHeadName,
      nextClassXIIHeadName: params.nextClassXIIHeadName,
    });

    setHeaderConfig(result.nextHeaderConfig);
    setAvailableAYs(result.nextAvailableAYs);

    const yearChanged = result.oldEnrollmentAY !== result.newEnrollmentAY;
    if (yearChanged) {
      setStudents(result.nextStudents);
      setPayments(result.nextPayments);
      if (selectedAY === result.oldEnrollmentAY) {
        setSelectedAY(result.newEnrollmentAY);
      }
      if (batchFilter === result.oldEnrollmentAY) {
        setBatchFilter(result.newEnrollmentAY);
      }
      markLocalEditIfOffline();

      if (user) {
        try {
          if (result.updatedStudents.length > 0) {
            await commitOperationsInChunks(
              result.updatedStudents,
              (batch, st) => {
                batch.update(doc(db, 'students', st.studentId), {
                  enrollmentAY: st.enrollmentAY,
                  progressionAY: st.progressionAY,
                  centerName: st.centerName,
                  updatedAt: serverTimestamp(),
                });
              }
            );
          }
          if (result.updatedPayments.length > 0) {
            await commitOperationsInChunks(
              result.updatedPayments,
              (batch, p) => {
                batch.update(doc(db, 'payments', p.paymentId), {
                  enrollmentAY: p.enrollmentAY,
                  progressionAY: p.progressionAY,
                  recordedInAY: p.recordedInAY,
                  updatedAt: serverTimestamp(),
                });
              }
            );
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'students');
        }
      }

      showToast(
        `Updated batch head ${result.oldEnrollmentAY} → ${result.newEnrollmentAY}. Cascaded to ${result.updatedStudents.length} students & ${result.updatedPayments.length} receipts everywhere.`
      );
    } else {
      showToast(
        `Updated "${params.nextBatchTitle}" & Class XI/XII head labels across all screens.`
      );
    }
  };

  // Create New Centralized Batch & Class Head
  const handleCreateBatchHead = (params: {
    enrollmentAY: string;
    batchTitle: string;
    classXIHeadName: string;
    classXIIHeadName: string;
  }) => {
    const cleanedAY = params.enrollmentAY.trim();
    const progressionAY = getNextAcademicYear(cleanedAY);
    const updatedAYs = Array.from(
      new Set([...availableAYs, cleanedAY, progressionAY])
    ).sort();
    setAvailableAYs(updatedAYs);

    const nextHead = {
      id: `batch_${cleanedAY.replace(/[^0-9]/g, '_')}_${Date.now()}`,
      enrollmentAY: cleanedAY,
      progressionAY,
      batchTitle: params.batchTitle.trim() || `Batch ${cleanedAY}`,
      classXIHeadName:
        params.classXIHeadName.trim() || `Class XI - Batch ${cleanedAY}`,
      classXIIHeadName:
        params.classXIIHeadName.trim() || `Class XII - Batch ${cleanedAY}`,
    };

    const nextBatchHeads = [
      ...headerConfig.batchHeads.filter((b) => b.enrollmentAY !== cleanedAY),
      nextHead,
    ];
    setHeaderConfig(
      normalizeHeaderConfig(
        { ...headerConfig, batchHeads: nextBatchHeads },
        updatedAYs
      )
    );
    showToast(
      `Created centralized head "${nextHead.batchTitle}" (${cleanedAY} → ${progressionAY}).`
    );
  };

  // Update Fee Structure Defaults
  const handleUpdateFeeSettings = (next: FeeStructureSettings) => {
    setFeeSettings(next);
    showToast(
      `Saved default fee settings (${formatINR(next.classXIDefaultFee)} XI / ${formatINR(next.classXIIDefaultFee)} XII, prefix ${next.receiptPrefix}).`
    );
  };

  // Save Single Student Ledger (with opening PaymentRecord for newly created pre-paid students)
  const handleSaveStudent = async (
    rawStudent: Omit<StudentRecord, 'createdAt' | 'updatedAt'>,
    isEdit: boolean
  ) => {
    const ownerId = user ? user.uid : 'local_workspace';
    const sanitized = sanitizeStudentPayload({ ...rawStudent, ownerId });

    const openingPayments = !isEdit
      ? buildOpeningPaymentsForStudent(
          sanitized,
          payments,
          feeSettings.receiptPrefix
        )
      : [];

    setStudents((prev) => {
      const exists = prev.some((s) => s.studentId === sanitized.studentId);
      if (exists) {
        return prev.map((s) =>
          s.studentId === sanitized.studentId ? { ...s, ...sanitized } : s
        );
      }
      return [...prev, sanitized];
    });

    if (openingPayments.length > 0) {
      setPayments((prev) => [...openingPayments, ...prev]);
    }
    markLocalEditIfOffline();

    if (user) {
      const docRef = doc(db, 'students', sanitized.studentId);
      try {
        const batch = writeBatch(db);
        if (isEdit) {
          batch.update(docRef, {
            rollNo: sanitized.rollNo,
            fullName: sanitized.fullName,
            fatherName: sanitized.fatherName,
            phone: sanitized.phone,
            stream: sanitized.stream,
            centerName: sanitized.centerName,
            enrollmentAY: sanitized.enrollmentAY,
            progressionAY: sanitized.progressionAY,
            admissionClass: sanitized.admissionClass,
            classXIFee: sanitized.classXIFee,
            classXIIFee: sanitized.classXIIFee,
            scholarshipDiscount: sanitized.scholarshipDiscount,
            totalIntegratedFee: sanitized.totalIntegratedFee,
            paidClassXI: sanitized.paidClassXI,
            paidClassXII: sanitized.paidClassXII,
            totalPaid: sanitized.totalPaid,
            xiPaymentDate: sanitized.xiPaymentDate,
            xiiPaymentDate: sanitized.xiiPaymentDate,
            status: sanitized.status,
            remarks: sanitized.remarks,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(docRef, {
            ...sanitized,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();

        // Phase 2: write opening payments after student exists
        if (openingPayments.length > 0) {
          await commitOperationsInChunks(openingPayments, (pBatch, pay) => {
            const cleanPay = sanitizePaymentPayload({
              ...pay,
              ownerId: user.uid,
            });
            pBatch.set(doc(db, 'payments', cleanPay.paymentId), {
              ...cleanPay,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
        }
      } catch (err) {
        handleFirestoreError(
          err,
          isEdit ? OperationType.UPDATE : OperationType.CREATE,
          `students/${sanitized.studentId}`
        );
      }
    }

    showToast(
      isEdit
        ? `Updated ledger for ${sanitized.fullName} (${sanitized.enrollmentAY}).`
        : `Added ${sanitized.fullName} to ${sanitized.enrollmentAY} (auto-synced to ${sanitized.progressionAY} Class XII).`
    );
  };

  // Delete Student Ledger (Confirmed via Accessible Modal)
  const handleConfirmDeleteStudent = async () => {
    if (!deletingStudent) return;
    const target = deletingStudent;
    setDeletingStudent(null);

    const relatedPayments = payments.filter(
      (p) => p.studentId === target.studentId
    );
    setStudents((prev) => prev.filter((s) => s.studentId !== target.studentId));
    setPayments((prev) => prev.filter((p) => p.studentId !== target.studentId));
    markLocalEditIfOffline();

    if (activeLedgerStudentId === target.studentId) {
      const remaining = students.find((s) => s.studentId !== target.studentId);
      if (remaining) setActiveLedgerStudentId(remaining.studentId);
    }

    if (user) {
      try {
        // Delete related payments first, then student doc
        await commitOperationsInChunks(relatedPayments, (batch, p) => {
          batch.delete(doc(db, 'payments', p.paymentId));
        });
        const sBatch = writeBatch(db);
        sBatch.delete(doc(db, 'students', target.studentId));
        await sBatch.commit();
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
          `students/${target.studentId}`
        );
      }
    }

    showToast(`Deleted ledger for ${target.fullName} (${target.rollNo}).`);
  };

  // Duplicate-Safe Bulk Import Students from Excel
  const handleBulkImportStudents = async (
    conflicts: ImportConflictRow[],
    duplicateStrategy: 'skip' | 'update'
  ) => {
    const ownerId = user ? user.uid : 'local_workspace';

    const toCreate: StudentRecord[] = [];
    const toUpdate: StudentRecord[] = [];
    let skippedCount = 0;

    conflicts.forEach((row) => {
      if (row.matchType === 'new') {
        toCreate.push(sanitizeStudentPayload({ ...row.incoming, ownerId }));
      } else if (duplicateStrategy === 'update' && row.existingStudent) {
        // Preserve existing studentId when updating duplicate row
        toUpdate.push(
          sanitizeStudentPayload({
            ...row.incoming,
            studentId: row.existingStudent.studentId,
            ownerId,
          })
        );
      } else {
        skippedCount += 1;
      }
    });

    // Generate opening payment records for newly created pre-paid students
    const runningPayments = [...payments];
    const newOpeningPayments: PaymentRecord[] = [];
    toCreate.forEach((st) => {
      const ops = buildOpeningPaymentsForStudent(
        st,
        runningPayments,
        feeSettings.receiptPrefix
      );
      ops.forEach((p) => {
        newOpeningPayments.push(p);
        runningPayments.push(p);
      });
    });

    const updateMap = new Map(toUpdate.map((s) => [s.studentId, s]));
    setStudents((prev) => [
      ...prev.map((s) => updateMap.get(s.studentId) || s),
      ...toCreate,
    ]);
    if (newOpeningPayments.length > 0) {
      setPayments((prev) => [...newOpeningPayments, ...prev]);
    }
    markLocalEditIfOffline();

    if (user) {
      try {
        // Phase 1: Create new students & update existing ones in chunks
        if (toCreate.length > 0) {
          await commitOperationsInChunks(toCreate, (batch, st) => {
            batch.set(doc(db, 'students', st.studentId), {
              ...st,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
        }
        if (toUpdate.length > 0) {
          await commitOperationsInChunks(toUpdate, (batch, st) => {
            batch.update(doc(db, 'students', st.studentId), {
              rollNo: st.rollNo,
              fullName: st.fullName,
              fatherName: st.fatherName,
              phone: st.phone,
              stream: st.stream,
              centerName: st.centerName,
              enrollmentAY: st.enrollmentAY,
              progressionAY: st.progressionAY,
              admissionClass: st.admissionClass,
              classXIFee: st.classXIFee,
              classXIIFee: st.classXIIFee,
              scholarshipDiscount: st.scholarshipDiscount,
              totalIntegratedFee: st.totalIntegratedFee,
              paidClassXI: st.paidClassXI,
              paidClassXII: st.paidClassXII,
              totalPaid: st.totalPaid,
              xiPaymentDate: st.xiPaymentDate,
              xiiPaymentDate: st.xiiPaymentDate,
              status: st.status,
              remarks: st.remarks,
              updatedAt: serverTimestamp(),
            });
          });
        }
        // Phase 2: Opening payments for newly created students
        if (newOpeningPayments.length > 0) {
          await commitOperationsInChunks(newOpeningPayments, (batch, pay) => {
            const cleanPay = sanitizePaymentPayload({
              ...pay,
              ownerId: user.uid,
            });
            batch.set(doc(db, 'payments', cleanPay.paymentId), {
              ...cleanPay,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'students');
      }
    }

    const parts: string[] = [];
    if (toCreate.length > 0) parts.push(`${toCreate.length} added`);
    if (toUpdate.length > 0) parts.push(`${toUpdate.length} updated`);
    if (skippedCount > 0) parts.push(`${skippedCount} duplicates skipped`);
    showToast(`Excel import complete: ${parts.join(', ')}.`);
  };

  // Record Fee Payment & Generate Receipt (with Fine support + Sequential Receipt No)
  const handleRecordPayment = async (payload: {
    student: StudentRecord;
    amount: number;
    fineAmount: number;
    targetClass: AllocationTarget;
    allocatedToXI: number;
    allocatedToXII: number;
    newPaidClassXI: number;
    newPaidClassXII: number;
    newTotalPaid: number;
    newXiDate: string;
    newXiiDate: string;
    newRemark: string;
    paymentDate: string;
    paymentMode: PaymentMode;
    referenceNo: string;
    receiptNo: string;
    installmentLabel: string;
    notes: string;
    recordedInAY: string;
  }) => {
    const ownerId = user ? user.uid : 'local_workspace';
    const paymentId = `pay_${Date.now()}_${Math.floor(
      100 + Math.random() * 899
    )}`;

    const newPayment: PaymentRecord = sanitizePaymentPayload({
      paymentId,
      studentId: payload.student.studentId,
      ownerId,
      studentName: payload.student.fullName,
      rollNo: payload.student.rollNo,
      stream: payload.student.stream,
      enrollmentAY: payload.student.enrollmentAY,
      progressionAY: payload.student.progressionAY,
      recordedInAY: payload.recordedInAY,
      targetClass: payload.targetClass,
      amount: payload.amount,
      allocatedToXI: payload.allocatedToXI,
      allocatedToXII: payload.allocatedToXII,
      paymentDate: payload.paymentDate,
      paymentMode: payload.paymentMode,
      referenceNo: payload.referenceNo,
      receiptNo: payload.receiptNo,
      installmentLabel: payload.installmentLabel,
      notes: payload.notes || `Status updated to ${payload.newRemark}`,
      fineAmount: payload.fineAmount,
      receiptStatus: 'active',
    });

    setStudents((prev) =>
      prev.map((s) =>
        s.studentId === payload.student.studentId
          ? {
              ...s,
              paidClassXI: payload.newPaidClassXI,
              paidClassXII: payload.newPaidClassXII,
              totalPaid: payload.newTotalPaid,
              xiPaymentDate: payload.newXiDate,
              xiiPaymentDate: payload.newXiiDate,
              remarks: payload.newRemark,
            }
          : s
      )
    );
    setPayments((prev) => [newPayment, ...prev]);
    markLocalEditIfOffline();

    if (user) {
      try {
        const batch = writeBatch(db);
        const studentRef = doc(db, 'students', payload.student.studentId);
        const paymentRef = doc(db, 'payments', paymentId);

        batch.update(studentRef, {
          paidClassXI: payload.newPaidClassXI,
          paidClassXII: payload.newPaidClassXII,
          totalPaid: payload.newTotalPaid,
          xiPaymentDate: payload.newXiDate,
          xiiPaymentDate: payload.newXiiDate,
          status: payload.student.status,
          remarks: payload.newRemark,
          updatedAt: serverTimestamp(),
        });

        batch.set(paymentRef, {
          ...newPayment,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'payments');
      }
    }

    showToast(
      `Receipt ${newPayment.receiptNo} (${formatINR(newPayment.amount)}${
        newPayment.fineAmount && newPayment.fineAmount > 0
          ? ` + ${formatINR(newPayment.fineAmount)} fine`
          : ''
      }) saved for ${payload.student.fullName}.`
    );
  };

  // Persistent Soft-Reverse / Cancel Receipt (retains audit trail across reload & Firestore)
  const handleReversePayment = async (
    payment: PaymentRecord,
    student: StudentRecord,
    reason: string
  ) => {
    const newPaidClassXI = Math.max(
      0,
      student.paidClassXI - payment.allocatedToXI
    );
    const newPaidClassXII = Math.max(
      0,
      student.paidClassXII - payment.allocatedToXII
    );
    const newTotalPaid = newPaidClassXI + newPaidClassXII;
    const newXiDate = newPaidClassXI === 0 ? '-' : student.xiPaymentDate;
    const newXiiDate = newPaidClassXII === 0 ? '-' : student.xiiPaymentDate;

    const updatedTemp = sanitizeStudentPayload({
      ...student,
      paidClassXI: newPaidClassXI,
      paidClassXII: newPaidClassXII,
      totalPaid: newTotalPaid,
      xiPaymentDate: newXiDate,
      xiiPaymentDate: newXiiDate,
    });

    const reversedAt = new Date().toISOString().slice(0, 19);
    const cleanReason = reason.trim().slice(0, 200) || 'Cancelled by staff';

    setPayments((prev) =>
      prev.map((p) =>
        p.paymentId === payment.paymentId
          ? {
              ...p,
              receiptStatus: 'reversed',
              reversedAt,
              reversalReason: cleanReason,
            }
          : p
      )
    );
    setStudents((prev) =>
      prev.map((s) =>
        s.studentId === student.studentId ? { ...s, ...updatedTemp } : s
      )
    );
    markLocalEditIfOffline();

    if (user) {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'payments', payment.paymentId), {
          receiptStatus: 'reversed',
          reversedAt,
          reversalReason: cleanReason,
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'students', student.studentId), {
          paidClassXI: updatedTemp.paidClassXI,
          paidClassXII: updatedTemp.paidClassXII,
          totalPaid: updatedTemp.totalPaid,
          xiPaymentDate: updatedTemp.xiPaymentDate,
          xiiPaymentDate: updatedTemp.xiiPaymentDate,
          status: updatedTemp.status,
          remarks: updatedTemp.remarks,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `payments/${payment.paymentId}`
        );
      }
    }

    showToast(
      `Receipt ${payment.receiptNo} (${formatINR(
        payment.amount
      )}) reversed for ${student.fullName}. Audit record preserved.`
    );
  };

  // Full Workspace JSON Backup & Restore
  const handleExportBackupJSON = () => {
    exportWorkspaceBackupJSON({
      version: 1,
      exportedAt: new Date().toISOString(),
      availableAYs,
      feeSettings,
      headerConfig,
      students,
      payments,
    });
    showToast(
      `Downloaded JSON backup (${students.length} students, ${payments.length} receipts).`
    );
  };

  const handleSelectRestoreBackupFile = async (file: File) => {
    try {
      const payload = await parseWorkspaceBackupJSON(file);
      setPendingRestoreBackup(payload);
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Could not read the selected JSON backup file.'
      );
    }
  };

  const handleConfirmRestoreBackup = async () => {
    if (!pendingRestoreBackup) return;
    const backup = pendingRestoreBackup;
    setPendingRestoreBackup(null);

    const ownerId = user ? user.uid : 'local_workspace';
    const cleanStudents = backup.students.map((s) =>
      sanitizeStudentPayload({ ...s, ownerId })
    );
    const cleanPayments = backup.payments.map((p) =>
      sanitizePaymentPayload({ ...p, ownerId })
    );

    setAvailableAYs(backup.availableAYs);
    setFeeSettings(backup.feeSettings);
    if (backup.headerConfig) {
      setHeaderConfig(
        normalizeHeaderConfig(backup.headerConfig, backup.availableAYs)
      );
    }
    setStudents(cleanStudents);
    setPayments(cleanPayments);
    markLocalEditIfOffline();

    if (user) {
      try {
        await pushWorkspaceToFirestore(user.uid, cleanStudents, cleanPayments);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'students');
      }
    }

    showToast(
      `Restored backup: ${cleanStudents.length} students and ${cleanPayments.length} receipts loaded.`
    );
  };

  // Sequential Next Receipt Number
  const nextReceiptNo = useMemo(
    () => generateNextReceiptNo(payments, selectedAY, feeSettings.receiptPrefix),
    [payments, selectedAY, feeSettings.receiptPrefix]
  );

  // Resolve students active in the selected Academic Year
  const studentsInSelectedAY = useMemo(() => {
    return students
      .map((s) => resolveStudentInAcademicYear(s, selectedAY))
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [students, selectedAY]);

  // Active Student for Individual Student Fee Ledger
  const activeLedgerStudent = useMemo(
    () =>
      students.find((s) => s.studentId === activeLedgerStudentId) ||
      students[0],
    [students, activeLedgerStudentId]
  );

  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  const navigateToSection = (section: ActiveMenuSection) => {
    setActiveMenu(section);
    setMobileMenuOpen(false);
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openStudentLedger = (studentId: string) => {
    setActiveLedgerStudentId(studentId);
    navigateToSection('student_ledger');
  };

  const handleNavigateToCollectionWithFilters = (filters?: {
    classTab?: 'ALL' | 'XI' | 'XII' | 'PENDING';
    remarkFilter?: 'ALL' | RegisterStatusCategory;
    batchFilter?: string;
  }) => {
    setClassTab(filters?.classTab || 'ALL');
    setRemarkFilter(filters?.remarkFilter || 'ALL');
    if (filters?.batchFilter) {
      setBatchFilter(filters.batchFilter);
      if (
        filters.batchFilter !== 'ALL' &&
        selectedAY !== filters.batchFilter &&
        selectedAY !== getNextAcademicYear(filters.batchFilter)
      ) {
        setSelectedAY(filters.batchFilter);
      }
    } else {
      setBatchFilter('ALL');
    }
    navigateToSection('collect_fee');
  };

  const openAddStudentPage = (
    studentToEdit: StudentRecord | null = null,
    returnTo: ActiveMenuSection = 'students_master'
  ) => {
    setEditingStudent(studentToEdit);
    setAddStudentReturnMenu(returnTo);
    setActiveMenu('add_student');
    setMobileMenuOpen(false);
  };

  const navItems: {
    id: Exclude<ActiveMenuSection, 'student_ledger' | 'add_student'>;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'dashboard',
      label: 'Overview',
      icon: <LayoutGrid className="h-[18px] w-[18px] shrink-0" />,
    },
    {
      id: 'collect_fee',
      label: 'Fee Collection',
      icon: <IndianRupee className="h-[18px] w-[18px] shrink-0" />,
    },
    {
      id: 'collection_analytics',
      label: 'Collection',
      icon: <CalendarRange className="h-[18px] w-[18px] shrink-0" />,
    },
    {
      id: 'students_master',
      label: 'Students',
      icon: <Users className="h-[18px] w-[18px] shrink-0" />,
    },
    {
      id: 'excel_tools',
      label: 'Excel',
      icon: <FileSpreadsheet className="h-[18px] w-[18px] shrink-0" />,
    },
    {
      id: 'headers',
      label: 'Headers',
      icon: <SlidersHorizontal className="h-[18px] w-[18px] shrink-0" />,
    },
    {
      id: 'reports',
      label: 'Reports & Pending',
      icon: <BarChart3 className="h-[18px] w-[18px] shrink-0" />,
    },
  ];

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-white text-[#0f172a] select-none border-r border-[#dce4ee]">
      <div className="flex flex-col">
        {/* Brand Header (SciFee — Integrated Science) */}
        <div className="h-14 px-4 flex items-center justify-between gap-2.5 border-b border-[#e2e8f0]">
          <button
            type="button"
            onClick={() => navigateToSection('dashboard')}
            className="flex items-center gap-2.5 min-w-0 text-left"
          >
            <div className="h-8 w-8 rounded-xl bg-[#005c55] flex items-center justify-center text-white shrink-0 shadow-xs">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 17L10 7L14 13L20 5"
                  stroke="currentColor"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="20" cy="5" r="2.2" fill="#9cf2e8" />
                <path
                  d="M4 20H20"
                  stroke="#9cf2e8"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="font-display text-[15px] font-bold tracking-tight text-[#005c55] leading-none truncate">
                SciFee
              </div>
              <div className="text-[11px] font-medium text-[#3e4947] mt-0.5 truncate">
                Integrated Science
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden rounded-lg p-1.5 text-[#3e4947] hover:bg-[#f2f3ff] hover:text-[#131b2e]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Ultra-Simple 4-Item Primary Navigation */}
        <nav
          aria-label="Main navigation"
          className="px-3 pt-4 flex flex-col gap-1"
        >
          {navItems.map((item) => {
            const isActive =
              activeMenu === item.id ||
              (activeMenu === 'student_ledger' && item.id === 'collect_fee') ||
              (activeMenu === 'add_student' && item.id === 'students_master');
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  if (item.id === 'excel_tools') {
                    setActiveMasterTab('EXCEL_IMPORT');
                  }
                  navigateToSection(item.id);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#005c55] text-white font-semibold shadow-xs'
                    : 'text-[#3e4947] font-medium hover:bg-[#f2f3ff] hover:text-[#131b2e]'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Real Session Switcher & Quick Cloud Sync Action */}
      <div className="p-3 m-3 rounded-xl bg-[#f2f3ff] space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <label
            htmlFor="sidebar-session-select"
            className="font-semibold text-[#005c55] shrink-0"
          >
            Session
          </label>
          <select
            id="sidebar-session-select"
            aria-label="Switch Active Academic Session"
            value={selectedAY}
            onChange={(e) => {
              setSelectedAY(e.target.value);
              setClassTab('ALL');
              setBatchFilter('ALL');
            }}
            className="rounded-lg bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-[#131b2e] border border-[#bdc9c6]/40 focus:outline-none cursor-pointer"
          >
            {availableAYs.map((ay) => (
              <option key={ay} value={ay}>
                {ay}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between text-[11px] text-[#3e4947]">
          <span>Active cohort</span>
          <span className="font-mono font-bold text-[#131b2e] tabular-nums">
            {studentsInSelectedAY.length} students
          </span>
        </div>
        <div className="text-[11px] text-[#3e4947] leading-snug">
          Auto-syncs {headerConfig.year1ShortLabel} ({selectedAY}) →{' '}
          {headerConfig.year2ShortLabel} ({getNextAcademicYear(selectedAY)})
        </div>
        {user ? (
          <div className="pt-1 border-t border-[#bdc9c6]/40 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#006c49] truncate">
              <Cloud className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {user.displayName || 'Cloud Synced'}
              </span>
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign Out"
              className="rounded-lg p-1 text-[#3e4947] hover:bg-white hover:text-[#131b2e] transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#131b2e] shadow-2xs hover:bg-[#eaedff] transition-colors"
          >
            <LogIn className="h-3.5 w-3.5 text-[#005c55]" />
            <span>Sign In for Cloud Sync</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen flex bg-[#eef2f6] text-[#0f172a] font-sans overflow-hidden print:h-auto print:overflow-visible">
      {/* DESKTOP FIXED-WIDTH LIGHT SIDEBAR (220px — stays pinned while right pane scrolls) */}
      <aside className="hidden lg:block w-[220px] shrink-0 h-screen overflow-y-auto no-print">
        {renderSidebarContent()}
      </aside>

      {/* MOBILE SLIDE-OVER DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden no-print">
          <button
            type="button"
            aria-label="Close sidebar overlay"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-[#131b2e]/40 backdrop-blur-xs"
          />
          <aside className="relative z-10 w-[240px] max-w-[82vw] h-full shadow-2xl">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* MAIN WORKSPACE COLUMN (Scrolls independently while sidebar stays fixed) */}
      <div
        ref={mainScrollRef}
        className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto overflow-x-hidden print:h-auto print:overflow-visible"
      >
        {/* TOP BAR: ONLY ON OVERVIEW (Clean Academic Year selector only — no Search, +Year, Export Excel, or +Add Student) */}
        {activeMenu === 'dashboard' ? (
          <header className="sticky top-0 z-30 h-14 bg-white/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(19,27,46,0.05)] px-4 sm:px-6 flex items-center justify-between gap-3 no-print">
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="lg:hidden rounded-xl bg-[#f2f3ff] p-2 text-[#131b2e] hover:bg-[#e2e7ff] transition-colors"
              >
                <Menu className="h-4 w-4" />
              </button>

              {/* Clean Year-Only Academic Year Dropdown */}
              <div className="flex items-center bg-[#f2f3ff] rounded-xl px-3 py-1.5">
                <label
                  htmlFor="header-academic-year-select"
                  className="text-xs font-medium text-[#3e4947] mr-1.5"
                >
                  Year:
                </label>
                <select
                  id="header-academic-year-select"
                  aria-label="Select Academic Year"
                  value={selectedAY}
                  onChange={(e) => {
                    setSelectedAY(e.target.value);
                    setClassTab('ALL');
                    setBatchFilter('ALL');
                  }}
                  className="bg-transparent font-mono text-xs sm:text-[13px] font-bold text-[#131b2e] focus:outline-none cursor-pointer pr-1"
                >
                  {availableAYs.map((ay) => (
                    <option key={ay} value={ay}>
                      {ay}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </header>
        ) : (
          /* Minimal Mobile-Only Drawer Trigger when on non-Overview screens (NO desktop top header bar) */
          <div className="lg:hidden sticky top-0 z-30 h-12 bg-white/90 backdrop-blur-xl border-b border-[#f2f3ff] px-4 flex items-center gap-2.5 no-print">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-xl bg-[#f2f3ff] p-2 text-[#131b2e] hover:bg-[#e2e7ff] transition-colors"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="font-display text-sm font-bold text-[#005c55]">
              SciFee
            </span>
          </div>
        )}

        {/* TOAST NOTIFICATION BANNER */}
        {toastBanner && (
          <div
            role="status"
            aria-live="polite"
            className="bg-[#131b2e] text-white px-4 sm:px-6 py-2.5 text-xs font-medium no-print"
          >
            <div className="mx-auto max-w-[1360px] flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#9cf2e8] shrink-0" />
                <span>{toastBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastBanner(null)}
                className="text-white/70 hover:text-white text-xs shrink-0"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {authError && (
          <div
            role="alert"
            className="bg-[#ffdad6] text-[#ba1a1a] px-4 sm:px-6 py-2 text-xs font-medium no-print"
          >
            <div className="mx-auto max-w-[1360px] flex items-center justify-between">
              <span>{authError}</span>
              <button
                type="button"
                onClick={() => setAuthError(null)}
                className="underline font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 min-w-0">
          {/* SCREEN 1: ACADEMIC OVERVIEW */}
          {activeMenu === 'dashboard' && (
            <DashboardOverview
              allStudents={students}
              studentsInSelectedAY={studentsInSelectedAY}
              payments={payments}
              selectedAY={selectedAY}
              availableAYs={availableAYs}
              headerConfig={headerConfig}
              onNavigateToCollection={handleNavigateToCollectionWithFilters}
              onNavigateToReports={() => navigateToSection('reports')}
              onOpenStudentLedger={openStudentLedger}
              onOpenQuickCollect={(st) => openStudentLedger(st.studentId)}
              onOpenCreateStudent={(tab) => {
                if (tab === 'bulk') {
                  setActiveMasterTab('EXCEL_IMPORT');
                  navigateToSection('excel_tools');
                } else {
                  openAddStudentPage(null, 'dashboard');
                }
              }}
            />
          )}

          {/* SCREEN 2: FEE COLLECTION */}
          {activeMenu === 'collect_fee' && (
            <FeeCollectionTable
              mode="collect_fee"
              selectedAY={selectedAY}
              availableAYs={availableAYs}
              headerConfig={headerConfig}
              payments={payments}
              studentsInSelectedAY={studentsInSelectedAY}
              classTab={classTab}
              onChangeClassTab={setClassTab}
              batchFilter={batchFilter}
              onChangeBatchFilter={setBatchFilter}
              remarkFilter={remarkFilter}
              onChangeRemarkFilter={setRemarkFilter}
              searchQuery={searchQuery}
              onChangeSearchQuery={setSearchQuery}
              onOpenStudentLedger={openStudentLedger}
              onOpenQuickCollect={(st) => openStudentLedger(st.studentId)}
              onEditStudent={(st) => openAddStudentPage(st, 'collect_fee')}
              onRequestDeleteStudent={(st) => setDeletingStudent(st)}
              onOpenCreateStudent={() => openAddStudentPage(null, 'collect_fee')}
            />
          )}

          {/* SCREEN 2B: DAILY COLLECTION */}
          {activeMenu === 'collection_analytics' && (
            <CollectionAnalyticsPage
              payments={payments}
              students={students}
              availableAYs={availableAYs}
              headerConfig={headerConfig}
              onOpenStudentLedger={openStudentLedger}
            />
          )}

          {/* SCREEN 3: STUDENTS (DEDICATED STUDENTS DIRECTORY ONLY) */}
          {activeMenu === 'students_master' && (
            <FeeCollectionTable
              mode="students_master"
              selectedAY={selectedAY}
              availableAYs={availableAYs}
              headerConfig={headerConfig}
              payments={payments}
              studentsInSelectedAY={studentsInSelectedAY}
              classTab={classTab}
              onChangeClassTab={setClassTab}
              batchFilter={batchFilter}
              onChangeBatchFilter={setBatchFilter}
              remarkFilter={remarkFilter}
              onChangeRemarkFilter={setRemarkFilter}
              searchQuery={searchQuery}
              onChangeSearchQuery={setSearchQuery}
              onOpenStudentLedger={openStudentLedger}
              onOpenQuickCollect={(st) => openStudentLedger(st.studentId)}
              onEditStudent={(st) => openAddStudentPage(st, 'students_master')}
              onRequestDeleteStudent={(st) => setDeletingStudent(st)}
              onOpenCreateStudent={() =>
                openAddStudentPage(null, 'students_master')
              }
            />
          )}

          {/* SCREEN 3B: DEDICATED ADD / EDIT STUDENT PAGE */}
          {activeMenu === 'add_student' && (
            <AddStudentPage
              key={editingStudent?.studentId || 'new_student'}
              initialStudent={editingStudent}
              feeSettings={feeSettings}
              headerConfig={headerConfig}
              selectedAY={selectedAY}
              availableAYs={availableAYs}
              nextSrNo={students.length + 1}
              ownerId={user ? user.uid : 'local_workspace'}
              onCancel={() => {
                setEditingStudent(null);
                setActiveMenu(addStudentReturnMenu);
              }}
              onSaveStudent={handleSaveStudent}
            />
          )}

          {/* SCREEN 3C: DEDICATED EXCEL IMPORT, BACKUP & BATCH TOOLS PAGE */}
          {activeMenu === 'excel_tools' && (
            <MastersManagementPage
              students={students}
              availableAYs={availableAYs}
              feeSettings={feeSettings}
              activeMasterTab={activeMasterTab}
              onChangeMasterTab={setActiveMasterTab}
              onAddBatchAY={handleAddBatchAY}
              onUpdateFeeSettings={handleUpdateFeeSettings}
              onSelectBatchAndGoToCollect={(ay, cls = 'ALL') => {
                setSelectedAY(ay);
                setClassTab(cls);
                setBatchFilter('ALL');
                navigateToSection('collect_fee');
              }}
              onOpenAddStudentForBatch={(batchAY) => {
                setSelectedAY(batchAY);
                openAddStudentPage(null, 'students_master');
              }}
              onBulkImportStudents={handleBulkImportStudents}
              onExportBackupJSON={handleExportBackupJSON}
              onRestoreBackupFile={handleSelectRestoreBackupFile}
            />
          )}

          {/* SCREEN 4: CENTRALIZED HEADERS MANAGEMENT */}
          {activeMenu === 'headers' && (
            <HeadersManagementPage
              headerConfig={headerConfig}
              feeSettings={feeSettings}
              students={students}
              payments={payments}
              onSaveBatchHead={handleSaveBatchHead}
              onCreateBatchHead={handleCreateBatchHead}
              onUpdateHeaderConfig={handleUpdateHeaderConfig}
              onUpdateFeeSettings={handleUpdateFeeSettings}
            />
          )}

          {/* DETAIL VIEW: INDIVIDUAL STUDENT FEE LEDGER (1ST YEAR & 2ND YEAR INTEGRATED) */}
          {activeMenu === 'student_ledger' && activeLedgerStudent && (
            <StudentFeeLedgerPage
              student={activeLedgerStudent}
              selectedAY={selectedAY}
              availableAYs={availableAYs}
              headerConfig={headerConfig}
              payments={payments}
              feeSettings={feeSettings}
              defaultReceiptNo={nextReceiptNo}
              onBackToCollection={() => navigateToSection('collect_fee')}
              onEditStudent={(st) => openAddStudentPage(st, 'student_ledger')}
              onRecordPayment={handleRecordPayment}
              onReversePayment={handleReversePayment}
            />
          )}

          {/* SCREEN 5: REPORTS, DAILY CASHBOOK & PENDING LIST */}
          {activeMenu === 'reports' && (
            <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 py-6">
              <ReportsSection
                students={students}
                payments={payments}
                selectedAY={selectedAY}
                availableAYs={availableAYs}
                headerConfig={headerConfig}
                feeSettings={feeSettings}
                onSwitchAY={(ay) => setSelectedAY(ay)}
                onOpenRecordPayment={(st) => openStudentLedger(st.studentId)}
                onOpenStudentLedger={(st) => openStudentLedger(st.studentId)}
              />
            </div>
          )}
        </main>
      </div>

      {/* QUICK FEE COLLECTION MODAL */}
      {paymentModalStudent && (
        <RecordPaymentModal
          student={paymentModalStudent}
          selectedAY={selectedAY}
          defaultReceiptNo={nextReceiptNo}
          onClose={() => setPaymentModalStudent(null)}
          onSubmitPayment={handleRecordPayment}
        />
      )}

      {/* CREATE / EDIT STUDENT LEDGER & EXCEL IMPORT MODAL */}
      {studentFormModalOpen && (
        <StudentFormModal
          initialStudent={editingStudent}
          existingStudents={students}
          feeSettings={feeSettings}
          selectedAY={selectedAY}
          availableAYs={availableAYs}
          nextSrNo={students.length + 1}
          ownerId={user ? user.uid : 'local_workspace'}
          defaultTab={studentFormDefaultTab}
          onClose={() => {
            setStudentFormModalOpen(false);
            setEditingStudent(null);
          }}
          onSaveStudent={handleSaveStudent}
          onBulkImportStudents={handleBulkImportStudents}
        />
      )}

      {/* INLINE DELETE CONFIRMATION MODAL */}
      {deletingStudent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-student-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#131b2e]/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[#ffdad6] p-2.5 text-[#ba1a1a] shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="delete-student-title"
                  className="font-display text-sm font-bold text-[#131b2e]"
                >
                  Delete Student Ledger?
                </h2>
                <p className="mt-1 text-xs text-[#3e4947] leading-relaxed">
                  Are you sure you want to permanently remove{' '}
                  <strong className="text-[#131b2e]">
                    {deletingStudent.fullName}
                  </strong>{' '}
                  (<span className="font-mono">{deletingStudent.rollNo}</span>,
                  Batch {deletingStudent.enrollmentAY}) and their recorded fee
                  receipts?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingStudent(null)}
                className="rounded-xl bg-[#f2f3ff] px-4 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStudent}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#ba1a1a] px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON BACKUP RESTORE CONFIRMATION MODAL */}
      {pendingRestoreBackup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-backup-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#131b2e]/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[#f2f3ff] p-2.5 text-[#005c55] shrink-0">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="restore-backup-title"
                  className="font-display text-sm font-bold text-[#131b2e]"
                >
                  Restore Workspace Backup?
                </h2>
                <p className="mt-1 text-xs text-[#3e4947] leading-relaxed">
                  This backup contains{' '}
                  <strong className="font-mono text-[#131b2e]">
                    {pendingRestoreBackup.students.length} students
                  </strong>{' '}
                  and{' '}
                  <strong className="font-mono text-[#131b2e]">
                    {pendingRestoreBackup.payments.length} receipts
                  </strong>{' '}
                  (exported{' '}
                  {pendingRestoreBackup.exportedAt.slice(0, 10)}). Restoring
                  will replace your current register view.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPendingRestoreBackup(null)}
                className="rounded-xl bg-[#f2f3ff] px-4 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestoreBackup}
                className="rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]"
              >
                Restore Backup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOCAL-TO-CLOUD SIGN-IN MERGE MODAL */}
      {pendingCloudMerge && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cloud-merge-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#131b2e]/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[#e6f7ef] p-2.5 text-[#005c55] shrink-0">
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="cloud-merge-title"
                  className="font-display text-sm font-bold text-[#131b2e]"
                >
                  Unsynced Local Changes Found
                </h2>
                <p className="mt-1 text-xs text-[#3e4947] leading-relaxed">
                  You made changes in this browser ({students.length} students,{' '}
                  {payments.length} receipts), while Cloud Firestore already has{' '}
                  {pendingCloudMerge.cloudStudents.length} students. Which
                  version would you like to keep?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleAcceptCloudData}
                className="rounded-xl bg-[#f2f3ff] px-4 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
              >
                Load Cloud Register
              </button>
              <button
                type="button"
                onClick={handleUploadLocalToCloud}
                className="rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]"
              >
                Upload Local Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
