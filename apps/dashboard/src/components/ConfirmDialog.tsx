import { Lang } from '../i18n';
import { t } from '../i18n';

interface ConfirmDialogProps {
  lang: Lang;
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  lang,
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const confirmBtnClass = confirmVariant === 'danger'
    ? 'bg-red-500 hover:bg-red-600 text-white'
    : 'bg-indigo-500 hover:bg-indigo-600 text-white';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onCancel}>
      <div 
        className="bg-white rounded-2xl p-6 max-w-[400px] w-[90%] shadow-2xl animate-[fadeIn_0.2s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            confirmVariant === 'danger' ? 'bg-red-100' : 'bg-indigo-100'
          }`}>
            <i className={`fas ${confirmVariant === 'danger' ? 'fa-exclamation-triangle text-red-500' : 'fa-question-circle text-indigo-500'}`}></i>
          </div>
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        </div>
        
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">{message}</p>
        
        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            onClick={onCancel}
          >
            {cancelText || t('cancel', lang) || '取消'}
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${confirmBtnClass}`}
            onClick={onConfirm}
          >
            {confirmText || t('confirm', lang) || '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
