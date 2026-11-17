import { AlertTriangle, X } from 'lucide-react';

export interface PendingSheetMutation {
  title: string;
  description: string;
  targetSheet: string;
  detailLine: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

interface SheetConfirmModalProps {
  mutation: PendingSheetMutation | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onProceed: () => void;
}

export function SheetConfirmModal({
  mutation,
  isSubmitting,
  onCancel,
  onProceed,
}: SheetConfirmModalProps) {
  if (!mutation) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-[#1A1614]/55 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-sheet-title"
    >
      <div className="bg-white border border-[#E8E2DA] rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-[#EFEAE2] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
            <h2
              id="confirm-sheet-title"
              className="font-display text-lg font-bold text-[#1A1614]"
            >
              {mutation.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Tutup dialog konfirmasi"
            className="p-1.5 rounded-lg text-[#6E635C] hover:text-[#1A1614] cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs text-[#1A1614]">
          <p className="leading-relaxed text-[#6E635C]">{mutation.description}</p>

          <div className="bg-[#FAF8F5] border border-[#E8E2DA] rounded-lg p-3 space-y-1">
            <div>
              <span className="text-[#6E635C]">Target Google Sheet: </span>
              <span className="font-semibold">{mutation.targetSheet}</span>
            </div>
            <div>
              <span className="text-[#6E635C]">Perubahan Data: </span>
              <span className="font-mono font-medium text-[#8C3B19]">
                {mutation.detailLine}
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-[#FAF8F5] border-t border-[#EFEAE2] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-[#E2D9CE] bg-white text-xs font-semibold text-[#6E635C] hover:text-[#1A1614] cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onProceed}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg bg-[#C2410C] hover:bg-[#A33609] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
          >
            {isSubmitting ? 'Menyimpan...' : mutation.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
