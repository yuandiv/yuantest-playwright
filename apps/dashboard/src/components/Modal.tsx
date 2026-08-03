import { ReactNode } from 'react';

interface ModalProps {
  content: ReactNode;
  onClose: () => void;
}

export function Modal({ content, onClose }: ModalProps) {
  if (!content) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-[640px] w-[90%] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
