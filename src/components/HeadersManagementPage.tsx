import React, { useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  BatchHeadItem,
  CustomFeeHead,
  FeeStructureSettings,
  HeaderConfig,
  PaymentRecord,
  REGISTER_STATUS_CATEGORIES,
  RegisterStatusCategory,
  StudentRecord,
} from '../types';
import {
  DEFAULT_STATUS_LABELS,
  formatINR,
  getNextAcademicYear,
} from '../utils/ledgerLogic';

type HeaderSectionTab =
  | 'BATCH_HEADS'
  | 'FEE_YEAR_HEADS'
  | 'RECEIPT_HEADS'
  | 'STATUS_HEADS';

interface HeadersManagementPageProps {
  headerConfig: HeaderConfig;
  feeSettings: FeeStructureSettings;
  students: StudentRecord[];
  payments: PaymentRecord[];
  onSaveBatchHead: (params: {
    batchId: string;
    nextEnrollmentAY: string;
    nextBatchTitle: string;
    nextClassXIHeadName: string;
    nextClassXIIHeadName: string;
  }) => Promise<void>;
  onCreateBatchHead: (params: {
    enrollmentAY: string;
    batchTitle: string;
    classXIHeadName: string;
    classXIIHeadName: string;
  }) => void;
  onUpdateHeaderConfig: (next: HeaderConfig, toastMessage?: string) => void;
  onUpdateFeeSettings: (next: FeeStructureSettings) => void;
}

export const HeadersManagementPage: React.FC<HeadersManagementPageProps> = ({
  headerConfig,
  feeSettings,
  students,
  payments,
  onSaveBatchHead,
  onCreateBatchHead,
  onUpdateHeaderConfig,
  onUpdateFeeSettings,
}) => {
  const [activeTab, setActiveTab] = useState<HeaderSectionTab>('BATCH_HEADS');

  // Batch Head Inline Edit State
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editAY, setEditAY] = useState<string>('');
  const [editBatchTitle, setEditBatchTitle] = useState<string>('');
  const [editXIHead, setEditXIHead] = useState<string>('');
  const [editXIIHead, setEditXIIHead] = useState<string>('');
  const [savingBatch, setSavingBatch] = useState<boolean>(false);
  const [batchFormError, setBatchFormError] = useState<string | null>(null);

  // Create New Batch Head State
  const [showCreateBatch, setShowCreateBatch] = useState<boolean>(false);
  const [newBatchAY, setNewBatchAY] = useState<string>('2029-30');
  const [newBatchTitle, setNewBatchTitle] = useState<string>('Batch 2029-30');
  const [newBatchXIHead, setNewBatchXIHead] = useState<string>(
    'Class XI - Batch 2029-30'
  );
  const [newBatchXIIHead, setNewBatchXIIHead] = useState<string>(
    'Class XII - Batch 2029-30'
  );

  // 1st & 2nd Year Fee Heads State
  const [year1HeadName, setYear1HeadName] = useState<string>(
    headerConfig.year1HeadName
  );
  const [year1ShortLabel, setYear1ShortLabel] = useState<string>(
    headerConfig.year1ShortLabel
  );
  const [year2HeadName, setYear2HeadName] = useState<string>(
    headerConfig.year2HeadName
  );
  const [year2ShortLabel, setYear2ShortLabel] = useState<string>(
    headerConfig.year2ShortLabel
  );
  const [combinedHeadName, setCombinedHeadName] = useState<string>(
    headerConfig.combinedHeadName
  );
  const [xiDefaultFee, setXiDefaultFee] = useState<string>(
    String(feeSettings.classXIDefaultFee)
  );
  const [xiiDefaultFee, setXiiDefaultFee] = useState<string>(
    String(feeSettings.classXIIDefaultFee)
  );

  // New Custom Fee Head State
  const [newHeadCode, setNewHeadCode] = useState<string>('');
  const [newHeadName, setNewHeadName] = useState<string>('');
  const [newHeadApplicable, setNewHeadApplicable] = useState<
    '1st Year (XI)' | '2nd Year (XII)' | 'Both Years (XI + XII)'
  >('Both Years (XI + XII)');
  const [newHeadAmount, setNewHeadAmount] = useState<string>('0');

  // Receipt & Institution Heads State
  const [schoolName, setSchoolName] = useState<string>(
    feeSettings.schoolDisplayName
  );
  const [receiptSubtitle, setReceiptSubtitle] = useState<string>(
    headerConfig.receiptSubtitle
  );
  const [receiptPrefix, setReceiptPrefix] = useState<string>(
    feeSettings.receiptPrefix
  );
  const [officeCopyLabel, setOfficeCopyLabel] = useState<string>(
    headerConfig.officeCopyLabel
  );
  const [parentCopyLabel, setParentCopyLabel] = useState<string>(
    headerConfig.parentCopyLabel
  );

  // Status Labels State
  const [statusLabelsDraft, setStatusLabelsDraft] = useState<
    Record<RegisterStatusCategory, string>
  >({ ...headerConfig.statusLabels });

  // Student & payment counts per enrollmentAY
  const usageByAY = useMemo(() => {
    const map = new Map<string, { students: number; payments: number }>();
    students.forEach((s) => {
      const curr = map.get(s.enrollmentAY) || { students: 0, payments: 0 };
      curr.students += 1;
      map.set(s.enrollmentAY, curr);
    });
    payments.forEach((p) => {
      const curr = map.get(p.enrollmentAY) || { students: 0, payments: 0 };
      curr.payments += 1;
      map.set(p.enrollmentAY, curr);
    });
    return map;
  }, [students, payments]);

  const startEditingBatch = (head: BatchHeadItem) => {
    setBatchFormError(null);
    setEditingBatchId(head.id);
    setEditAY(head.enrollmentAY);
    setEditBatchTitle(head.batchTitle);
    setEditXIHead(head.classXIHeadName);
    setEditXIIHead(head.classXIIHeadName);
  };

  const handleEditAYChange = (nextVal: string, original: BatchHeadItem) => {
    setEditAY(nextVal);
    // Smartly mirror the year token in the head labels if they still contain the previous year string
    const prevToken = editAY.trim();
    const cleanNext = nextVal.trim();
    if (prevToken && cleanNext && prevToken !== cleanNext) {
      if (editBatchTitle.includes(prevToken)) {
        setEditBatchTitle(editBatchTitle.replace(prevToken, cleanNext));
      } else if (editBatchTitle === original.batchTitle) {
        setEditBatchTitle(`Batch ${cleanNext}`);
      }
      if (editXIHead.includes(prevToken)) {
        setEditXIHead(editXIHead.replace(prevToken, cleanNext));
      }
      if (editXIIHead.includes(prevToken)) {
        setEditXIIHead(editXIIHead.replace(prevToken, cleanNext));
      }
    }
  };

  const handleConfirmBatchSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatchId) return;
    const cleanedAY = editAY.trim();
    if (!/^\d{4}-\d{2,4}$/.test(cleanedAY)) {
      setBatchFormError(
        'Enter Academic Year in YYYY-YY format (for example: 2027-28).'
      );
      return;
    }
    setBatchFormError(null);
    setSavingBatch(true);
    try {
      await onSaveBatchHead({
        batchId: editingBatchId,
        nextEnrollmentAY: cleanedAY,
        nextBatchTitle: editBatchTitle.trim() || `Batch ${cleanedAY}`,
        nextClassXIHeadName:
          editXIHead.trim() || `Class XI - Batch ${cleanedAY}`,
        nextClassXIIHeadName:
          editXIIHead.trim() || `Class XII - Batch ${cleanedAY}`,
      });
      setEditingBatchId(null);
    } finally {
      setSavingBatch(false);
    }
  };

  const handleNewBatchAYChange = (val: string) => {
    setNewBatchAY(val);
    const cleaned = val.trim();
    if (cleaned) {
      setNewBatchTitle(`Batch ${cleaned}`);
      setNewBatchXIHead(`Class XI - Batch ${cleaned}`);
      setNewBatchXIIHead(`Class XII - Batch ${cleaned}`);
    }
  };

  const handleCreateBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newBatchAY.trim();
    if (!/^\d{4}-\d{2,4}$/.test(cleaned)) {
      setBatchFormError(
        'Enter new Academic Year in YYYY-YY format (for example: 2029-30).'
      );
      return;
    }
    setBatchFormError(null);
    onCreateBatchHead({
      enrollmentAY: cleaned,
      batchTitle: newBatchTitle.trim() || `Batch ${cleaned}`,
      classXIHeadName: newBatchXIHead.trim() || `Class XI - Batch ${cleaned}`,
      classXIIHeadName: newBatchXIIHead.trim() || `Class XII - Batch ${cleaned}`,
    });
    const followingAY = getNextAcademicYear(cleaned);
    setNewBatchAY(followingAY);
    setNewBatchTitle(`Batch ${followingAY}`);
    setNewBatchXIHead(`Class XI - Batch ${followingAY}`);
    setNewBatchXIIHead(`Class XII - Batch ${followingAY}`);
    setShowCreateBatch(false);
  };

  const handleSaveFeeYearHeads = (e: React.FormEvent) => {
    e.preventDefault();
    const xiVal = Math.max(0, Math.round(Number(xiDefaultFee) || 0));
    const xiiVal = Math.max(0, Math.round(Number(xiiDefaultFee) || 0));
    onUpdateFeeSettings({
      ...feeSettings,
      classXIDefaultFee: xiVal,
      classXIIDefaultFee: xiiVal,
    });
    onUpdateHeaderConfig(
      {
        ...headerConfig,
        year1HeadName:
          year1HeadName.trim() || '1st Year — Class XI Integrated',
        year1ShortLabel: year1ShortLabel.trim() || '1st Year (Class XI)',
        year2HeadName:
          year2HeadName.trim() || '2nd Year — Class XII Integrated',
        year2ShortLabel: year2ShortLabel.trim() || '2nd Year (Class XII)',
        combinedHeadName:
          combinedHeadName.trim() ||
          '1st + 2nd Year Combined (XI & XII Full)',
      },
      'Updated 1st Year & 2nd Year fee heads across the entire app.'
    );
  };

  const handleAddCustomFeeHead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHeadName.trim()) return;
    const item: CustomFeeHead = {
      id: `head_${Date.now()}`,
      code:
        newHeadCode.trim().toUpperCase().slice(0, 16) ||
        `HEAD-${String(headerConfig.customFeeHeads.length + 1).padStart(2, '0')}`,
      name: newHeadName.trim().slice(0, 80),
      applicableTo: newHeadApplicable,
      defaultAmount: Math.max(0, Math.round(Number(newHeadAmount) || 0)),
    };
    onUpdateHeaderConfig(
      {
        ...headerConfig,
        customFeeHeads: [...headerConfig.customFeeHeads, item],
      },
      `Created new fee head "${item.name}".`
    );
    setNewHeadCode('');
    setNewHeadName('');
    setNewHeadAmount('0');
  };

  const handleDeleteCustomFeeHead = (id: string) => {
    onUpdateHeaderConfig(
      {
        ...headerConfig,
        customFeeHeads: headerConfig.customFeeHeads.filter((h) => h.id !== id),
      },
      'Removed custom fee head.'
    );
  };

  const handleSaveReceiptHeads = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPrefix =
      receiptPrefix
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
        .slice(0, 8) || 'SF';

    onUpdateFeeSettings({
      ...feeSettings,
      schoolDisplayName:
        schoolName.trim() || 'SciFee — Integrated Science Program',
      receiptPrefix: cleanPrefix,
    });
    onUpdateHeaderConfig(
      {
        ...headerConfig,
        receiptSubtitle:
          receiptSubtitle.trim() || 'Official Integrated Science Fee Receipt',
        officeCopyLabel: officeCopyLabel.trim() || 'OFFICE / SCHOOL COPY',
        parentCopyLabel: parentCopyLabel.trim() || 'PARENT / STUDENT COPY',
      },
      'Updated receipt & institution headers across all printed copies.'
    );
  };

  const handleSaveStatusLabels = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = { ...DEFAULT_STATUS_LABELS };
    REGISTER_STATUS_CATEGORIES.forEach(({ category }) => {
      cleaned[category] =
        (statusLabelsDraft[category] || '').trim() || category;
    });
    onUpdateHeaderConfig(
      {
        ...headerConfig,
        statusLabels: cleaned,
      },
      'Updated centralized status display labels across all registers.'
    );
  };

  const handleResetStatusLabels = () => {
    setStatusLabelsDraft({ ...DEFAULT_STATUS_LABELS });
    onUpdateHeaderConfig(
      {
        ...headerConfig,
        statusLabels: { ...DEFAULT_STATUS_LABELS },
      },
      'Reset status display labels to defaults.'
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* PAGE HEADER */}
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-[#3e4947]">
            Centralized Registry · Auto-Synced Across All Views
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#131b2e]">
            Headers &amp; Fee Heads
          </h1>
          <p className="mt-1 text-sm text-[#3e4947] max-w-2xl">
            Edit any Batch/Class head, 1st &amp; 2nd Year fee title, receipt
            branding, or status label in one place. Every change automatically
            updates wherever that head is used.
          </p>
        </div>

        {/* SUB-SECTION NAVIGATION TABS */}
        <div
          role="tablist"
          aria-label="Header management sections"
          className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-[#f2f3ff] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'BATCH_HEADS'}
            onClick={() => setActiveTab('BATCH_HEADS')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'BATCH_HEADS'
                ? 'bg-white text-[#131b2e] shadow-2xs'
                : 'text-[#3e4947] hover:text-[#131b2e]'
            }`}
          >
            Batch &amp; Class Heads ({headerConfig.batchHeads.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'FEE_YEAR_HEADS'}
            onClick={() => setActiveTab('FEE_YEAR_HEADS')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'FEE_YEAR_HEADS'
                ? 'bg-white text-[#131b2e] shadow-2xs'
                : 'text-[#3e4947] hover:text-[#131b2e]'
            }`}
          >
            1st &amp; 2nd Year Fee Heads
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'RECEIPT_HEADS'}
            onClick={() => setActiveTab('RECEIPT_HEADS')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'RECEIPT_HEADS'
                ? 'bg-white text-[#131b2e] shadow-2xs'
                : 'text-[#3e4947] hover:text-[#131b2e]'
            }`}
          >
            Receipt &amp; Institution
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'STATUS_HEADS'}
            onClick={() => setActiveTab('STATUS_HEADS')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'STATUS_HEADS'
                ? 'bg-white text-[#131b2e] shadow-2xs'
                : 'text-[#3e4947] hover:text-[#131b2e]'
            }`}
          >
            Status Labels
          </button>
        </div>
      </div>

      {/* SECTION 1: BATCH & CLASS HEADS */}
      {activeTab === 'BATCH_HEADS' && (
        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f2f3ff] pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#131b2e]">
                Batch &amp; Class Heads (Centralized Propagation)
              </h2>
              <p className="text-xs text-[#3e4947] mt-0.5">
                Rename any head (for example, change{' '}
                <span className="font-mono text-[#131b2e]">
                  Class XII - Batch 2025-26
                </span>{' '}
                to{' '}
                <span className="font-mono text-[#131b2e]">
                  Class XII - Batch 2027-28
                </span>
                ) or update its Academic Year — Overview, Fee Collection,
                Ledgers, Reports, and Receipts update automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateBatch((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e] transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Batch Head</span>
            </button>
          </div>

          {batchFormError && (
            <div className="rounded-xl bg-[#ffdad6] px-4 py-2.5 text-xs font-medium text-[#ba1a1a]">
              {batchFormError}
            </div>
          )}

          {/* CREATE NEW BATCH HEAD FORM */}
          {showCreateBatch && (
            <form
              onSubmit={handleCreateBatchSubmit}
              className="rounded-2xl bg-[#faf8ff] border border-[#eaedff] p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-[#131b2e]">
                  New Batch &amp; Session Head
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateBatch(false)}
                  aria-label="Close new batch form"
                  className="text-[#3e4947] hover:text-[#131b2e]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label
                    htmlFor="new-batch-ay"
                    className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                  >
                    1st Year Academic Year *
                  </label>
                  <input
                    id="new-batch-ay"
                    type="text"
                    required
                    value={newBatchAY}
                    onChange={(e) => handleNewBatchAYChange(e.target.value)}
                    placeholder="2029-30"
                    className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs font-bold text-[#131b2e]"
                  />
                  <div className="mt-1 text-[10px] font-mono text-[#3e4947]">
                    2nd Year Auto-Link: {getNextAcademicYear(newBatchAY)}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="new-batch-title"
                    className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                  >
                    Batch Title
                  </label>
                  <input
                    id="new-batch-title"
                    type="text"
                    required
                    value={newBatchTitle}
                    onChange={(e) => setNewBatchTitle(e.target.value)}
                    className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-batch-xi"
                    className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                  >
                    Class XI (1st Year) Head Name
                  </label>
                  <input
                    id="new-batch-xi"
                    type="text"
                    required
                    value={newBatchXIHead}
                    onChange={(e) => setNewBatchXIHead(e.target.value)}
                    className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-batch-xii"
                    className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                  >
                    Class XII (2nd Year) Head Name
                  </label>
                  <input
                    id="new-batch-xii"
                    type="text"
                    required
                    value={newBatchXIIHead}
                    onChange={(e) => setNewBatchXIIHead(e.target.value)}
                    className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateBatch(false)}
                  className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3e4947] hover:text-[#131b2e]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f766e]"
                >
                  <Check className="h-3.5 w-3.5" />
                  Create Batch Head
                </button>
              </div>
            </form>
          )}

          {/* LIST OF CENTRALIZED BATCH HEADS */}
          <div className="divide-y divide-[#f2f3ff] rounded-xl border border-[#f2f3ff] overflow-hidden">
            {headerConfig.batchHeads.map((head) => {
              const usage = usageByAY.get(head.enrollmentAY) || {
                students: 0,
                payments: 0,
              };
              const isEditing = editingBatchId === head.id;

              if (isEditing) {
                const yearChanged = editAY.trim() !== head.enrollmentAY;
                return (
                  <form
                    key={head.id}
                    onSubmit={handleConfirmBatchSave}
                    className="bg-[#faf8ff] p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-display text-sm font-bold text-[#131b2e]">
                          Editing {head.batchTitle}
                        </div>
                        <div className="text-[11px] text-[#3e4947]">
                          Used by{' '}
                          <strong className="font-mono text-[#131b2e]">
                            {usage.students} students
                          </strong>{' '}
                          and{' '}
                          <strong className="font-mono text-[#131b2e]">
                            {usage.payments} receipts
                          </strong>
                          . Saving updates every screen automatically.
                        </div>
                      </div>
                      {yearChanged && (
                        <div className="text-[11px] font-semibold text-[#7d4200]">
                          Year Cascade: {head.enrollmentAY} → {editAY.trim()} (
                          2nd Year: {getNextAcademicYear(editAY.trim())})
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label
                          htmlFor={`edit-ay-${head.id}`}
                          className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                        >
                          Academic Year (1st Year)
                        </label>
                        <input
                          id={`edit-ay-${head.id}`}
                          type="text"
                          required
                          value={editAY}
                          onChange={(e) =>
                            handleEditAYChange(e.target.value, head)
                          }
                          className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs font-bold text-[#131b2e]"
                        />
                        <div className="mt-1 text-[10px] font-mono text-[#3e4947]">
                          2nd Year: {getNextAcademicYear(editAY)}
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor={`edit-title-${head.id}`}
                          className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                        >
                          Batch Display Title
                        </label>
                        <input
                          id={`edit-title-${head.id}`}
                          type="text"
                          required
                          value={editBatchTitle}
                          onChange={(e) => setEditBatchTitle(e.target.value)}
                          className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`edit-xi-${head.id}`}
                          className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                        >
                          Class XI Head Name
                        </label>
                        <input
                          id={`edit-xi-${head.id}`}
                          type="text"
                          required
                          value={editXIHead}
                          onChange={(e) => setEditXIHead(e.target.value)}
                          className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`edit-xii-${head.id}`}
                          className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                        >
                          Class XII Head Name
                        </label>
                        <input
                          id={`edit-xii-${head.id}`}
                          type="text"
                          required
                          value={editXIIHead}
                          onChange={(e) => setEditXIIHead(e.target.value)}
                          className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingBatchId(null)}
                        className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3e4947] hover:text-[#131b2e]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingBatch}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f766e] disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savingBatch ? 'Syncing...' : 'Save & Sync Everywhere'}
                      </button>
                    </div>
                  </form>
                );
              }

              return (
                <div
                  key={head.id}
                  className="p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#faf8ff] transition-colors"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-bold text-[#131b2e]">
                        {head.batchTitle}
                      </span>
                      <span className="text-[#bdc9c6]" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-xs font-semibold text-[#005c55]">
                        {head.enrollmentAY} → {head.progressionAY}
                      </span>
                      <span className="text-[#bdc9c6]" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-xs text-[#3e4947] tabular-nums">
                        {usage.students} students · {usage.payments} receipts
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#3e4947]">
                      <span>
                        1st Year Head:{' '}
                        <strong className="text-[#131b2e]">
                          {head.classXIHeadName}
                        </strong>
                      </span>
                      <span>
                        2nd Year Head:{' '}
                        <strong className="text-[#131b2e]">
                          {head.classXIIHeadName}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => startEditingBatch(head)}
                    aria-label={`Edit head ${head.batchTitle}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#f2f3ff] px-3.5 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff] transition-colors shrink-0 self-start md:self-center whitespace-nowrap"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-[#005c55]" />
                    Edit Head
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: 1ST & 2ND YEAR INTEGRATED FEE HEADS */}
      {activeTab === 'FEE_YEAR_HEADS' && (
        <div className="space-y-5">
          <form
            onSubmit={handleSaveFeeYearHeads}
            className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f2f3ff] pb-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#131b2e]">
                  1st Year &amp; 2nd Year Integrated Fee Heads
                </h2>
                <p className="text-xs text-[#3e4947] mt-0.5">
                  Configure the 1st Year (Class XI — ₹10,000) and 2nd Year
                  (Class XII — ₹10,000) header labels shown inside Fee
                  Collection, Student Ledgers, and Receipts.
                </p>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]"
              >
                <Save className="h-3.5 w-3.5" />
                Save Year Heads
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* 1st Year Head Block */}
              <div className="rounded-xl bg-[#faf8ff] border border-[#eaedff] p-4 space-y-3">
                <div className="font-display text-xs font-bold text-[#005c55]">
                  1st Year Integrated Head (Class XI)
                </div>
                <div>
                  <label
                    htmlFor="year1-head-name"
                    className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                  >
                    Full Head Name (Ledger &amp; Receipts)
                  </label>
                  <input
                    id="year1-head-name"
                    type="text"
                    required
                    value={year1HeadName}
                    onChange={(e) => setYear1HeadName(e.target.value)}
                    className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="year1-short-label"
                      className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                    >
                      Short Table Column Head
                    </label>
                    <input
                      id="year1-short-label"
                      type="text"
                      required
                      value={year1ShortLabel}
                      onChange={(e) => setYear1ShortLabel(e.target.value)}
                      className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="year1-default-fee"
                      className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                    >
                      Standard Fee (₹)
                    </label>
                    <input
                      id="year1-default-fee"
                      type="number"
                      min={0}
                      required
                      value={xiDefaultFee}
                      onChange={(e) => setXiDefaultFee(e.target.value)}
                      className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs font-bold text-[#131b2e]"
                    />
                  </div>
                </div>
              </div>

              {/* 2nd Year Head Block */}
              <div className="rounded-xl bg-[#faf8ff] border border-[#eaedff] p-4 space-y-3">
                <div className="font-display text-xs font-bold text-[#005c55]">
                  2nd Year Integrated Head (Class XII)
                </div>
                <div>
                  <label
                    htmlFor="year2-head-name"
                    className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                  >
                    Full Head Name (Ledger &amp; Receipts)
                  </label>
                  <input
                    id="year2-head-name"
                    type="text"
                    required
                    value={year2HeadName}
                    onChange={(e) => setYear2HeadName(e.target.value)}
                    className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="year2-short-label"
                      className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                    >
                      Short Table Column Head
                    </label>
                    <input
                      id="year2-short-label"
                      type="text"
                      required
                      value={year2ShortLabel}
                      onChange={(e) => setYear2ShortLabel(e.target.value)}
                      className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="year2-default-fee"
                      className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                    >
                      Standard Fee (₹)
                    </label>
                    <input
                      id="year2-default-fee"
                      type="number"
                      min={0}
                      required
                      value={xiiDefaultFee}
                      onChange={(e) => setXiiDefaultFee(e.target.value)}
                      className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs font-bold text-[#131b2e]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-end rounded-xl bg-[#f2f3ff]/60 p-4">
              <div className="sm:col-span-2">
                <label
                  htmlFor="combined-head-name"
                  className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                >
                  Combined 1st + 2nd Year One-Time Payment Head Label
                </label>
                <input
                  id="combined-head-name"
                  type="text"
                  required
                  value={combinedHeadName}
                  onChange={(e) => setCombinedHeadName(e.target.value)}
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                />
              </div>
              <div className="text-right">
                <div className="text-[11px] text-[#3e4947]">
                  Total 2-Year Integrated Package
                </div>
                <div className="font-mono text-lg font-bold text-[#005c55] tabular-nums">
                  {formatINR(
                    (Number(xiDefaultFee) || 0) + (Number(xiiDefaultFee) || 0)
                  )}
                </div>
              </div>
            </div>
          </form>

          {/* ADDITIONAL / FUTURE CUSTOM FEE HEADS */}
          <div className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#131b2e]">
                Additional Custom Fee Heads
              </h2>
              <p className="text-xs text-[#3e4947] mt-0.5">
                Create extra fee heads (such as Lab Fee, Study Material, or Exam
                Fee) centrally for future sessions.
              </p>
            </div>

            <form
              onSubmit={handleAddCustomFeeHead}
              className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end rounded-xl bg-[#faf8ff] border border-[#eaedff] p-4"
            >
              <div className="sm:col-span-2">
                <label
                  htmlFor="custom-head-code"
                  className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                >
                  Code
                </label>
                <input
                  id="custom-head-code"
                  type="text"
                  value={newHeadCode}
                  onChange={(e) => setNewHeadCode(e.target.value)}
                  placeholder="LAB-01"
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs uppercase text-[#131b2e]"
                />
              </div>
              <div className="sm:col-span-4">
                <label
                  htmlFor="custom-head-name"
                  className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                >
                  Fee Head Name *
                </label>
                <input
                  id="custom-head-name"
                  type="text"
                  required
                  value={newHeadName}
                  onChange={(e) => setNewHeadName(e.target.value)}
                  placeholder="e.g. Science Practical / Study Material"
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                />
              </div>
              <div className="sm:col-span-3">
                <label
                  htmlFor="custom-head-year"
                  className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                >
                  Applicable To
                </label>
                <select
                  id="custom-head-year"
                  value={newHeadApplicable}
                  onChange={(e) =>
                    setNewHeadApplicable(
                      e.target.value as
                        | '1st Year (XI)'
                        | '2nd Year (XII)'
                        | 'Both Years (XI + XII)'
                    )
                  }
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
                >
                  <option value="1st Year (XI)">1st Year (XI)</option>
                  <option value="2nd Year (XII)">2nd Year (XII)</option>
                  <option value="Both Years (XI + XII)">
                    Both Years (XI + XII)
                  </option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="custom-head-amt"
                  className="block text-[11px] font-semibold text-[#131b2e] mb-1"
                >
                  Amount (₹)
                </label>
                <input
                  id="custom-head-amt"
                  type="number"
                  min={0}
                  value={newHeadAmount}
                  onChange={(e) => setNewHeadAmount(e.target.value)}
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs font-bold text-[#131b2e]"
                />
              </div>
              <div className="sm:col-span-1">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1 rounded-xl bg-[#005c55] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </form>

            {headerConfig.customFeeHeads.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[#f2f3ff]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-[#faf8ff] border-b border-[#f2f3ff] text-[#3e4947] font-semibold">
                      <th className="py-2.5 px-4">Code</th>
                      <th className="py-2.5 px-3">Head Name</th>
                      <th className="py-2.5 px-3">Applicable To</th>
                      <th className="py-2.5 px-3 text-right font-mono">
                        Standard Fee
                      </th>
                      <th className="py-2.5 px-4 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f2f3ff]">
                    {headerConfig.customFeeHeads.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2.5 px-4 font-mono font-bold text-[#131b2e]">
                          {h.code}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#131b2e]">
                          {h.name}
                        </td>
                        <td className="py-2.5 px-3 text-[#3e4947]">
                          {h.applicableTo}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#131b2e] tabular-nums">
                          {formatINR(h.defaultAmount)}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            aria-label={`Remove ${h.name}`}
                            onClick={() => handleDeleteCustomFeeHead(h.id)}
                            className="rounded-lg p-1.5 text-[#3e4947] hover:bg-[#ffdad6] hover:text-[#ba1a1a]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: RECEIPT & INSTITUTION HEADS */}
      {activeTab === 'RECEIPT_HEADS' && (
        <form
          onSubmit={handleSaveReceiptHeads}
          className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f2f3ff] pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#131b2e]">
                Institution &amp; Two-Copy Receipt Headers
              </h2>
              <p className="text-xs text-[#3e4947] mt-0.5">
                Printed automatically on both the Office Copy and Parent Copy of
                every official fee receipt.
              </p>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]"
            >
              <Save className="h-3.5 w-3.5" />
              Save Receipt Headers
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="school-display-name"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                School / Institution Name
              </label>
              <input
                id="school-display-name"
                type="text"
                required
                maxLength={100}
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
              />
            </div>

            <div>
              <label
                htmlFor="receipt-subtitle"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Official Receipt Subtitle
              </label>
              <input
                id="receipt-subtitle"
                type="text"
                required
                maxLength={100}
                value={receiptSubtitle}
                onChange={(e) => setReceiptSubtitle(e.target.value)}
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs text-[#131b2e]"
              />
            </div>

            <div>
              <label
                htmlFor="office-copy-label"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Top Copy Header Label
              </label>
              <input
                id="office-copy-label"
                type="text"
                required
                maxLength={40}
                value={officeCopyLabel}
                onChange={(e) => setOfficeCopyLabel(e.target.value)}
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs text-[#131b2e]"
              />
            </div>

            <div>
              <label
                htmlFor="parent-copy-label"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Bottom Copy Header Label
              </label>
              <input
                id="parent-copy-label"
                type="text"
                required
                maxLength={40}
                value={parentCopyLabel}
                onChange={(e) => setParentCopyLabel(e.target.value)}
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs text-[#131b2e]"
              />
            </div>

            <div>
              <label
                htmlFor="receipt-series-prefix"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Receipt Number Prefix
              </label>
              <input
                id="receipt-series-prefix"
                type="text"
                maxLength={8}
                value={receiptPrefix}
                onChange={(e) => setReceiptPrefix(e.target.value)}
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs font-bold uppercase text-[#131b2e]"
              />
            </div>

            <div className="rounded-xl bg-[#faf8ff] border border-[#eaedff] p-3.5 flex flex-col justify-center">
              <div className="text-[11px] text-[#3e4947]">
                Live Sequential Receipt Format
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-[#005c55]">
                {(
                  receiptPrefix.trim().replace(/[^a-zA-Z0-9]/g, '') || 'SF'
                ).toUpperCase()}
                /2026-27/0001
              </div>
            </div>
          </div>
        </form>
      )}

      {/* SECTION 4: STATUS DISPLAY LABELS */}
      {activeTab === 'STATUS_HEADS' && (
        <form
          onSubmit={handleSaveStatusLabels}
          className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f2f3ff] pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#131b2e]">
                Fee Status Display Heads
              </h2>
              <p className="text-xs text-[#3e4947] mt-0.5">
                Customize how fee clearance statuses appear across Overview, Fee
                Collection, Student Ledgers, and Reports.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetStatusLabels}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#f2f3ff] px-3.5 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Defaults
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]"
              >
                <Save className="h-3.5 w-3.5" />
                Save Status Labels
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REGISTER_STATUS_CATEGORIES.map(({ category, description }) => (
              <div
                key={category}
                className="rounded-xl bg-[#faf8ff] border border-[#eaedff] p-3.5 space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono font-semibold text-[#3e4947]">
                    System Key: {category}
                  </span>
                </div>
                <input
                  type="text"
                  aria-label={`Display label for ${category}`}
                  value={statusLabelsDraft[category] ?? category}
                  onChange={(e) =>
                    setStatusLabelsDraft((prev) => ({
                      ...prev,
                      [category]: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs font-semibold text-[#131b2e]"
                />
                <p className="text-[11px] text-[#3e4947]">{description}</p>
              </div>
            ))}
          </div>
        </form>
      )}
    </div>
  );
};
