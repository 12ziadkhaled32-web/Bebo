import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'حصلت مشكلة مش متوقعة',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = 'حصل عطل مؤقت في الاتصال ببيانات المعسكر.';
      if (this.state.errorMessage.includes('Quota exceeded')) {
        friendlyMsg = 'وصلنا للحد اليومي المجاني لقراءة البيانات. هيرجع يشتغل لوحده بكرة إن شاء الله.';
      } else if (this.state.errorMessage.includes('Missing or insufficient permissions')) {
        friendlyMsg = 'مقدرناش نوصل للمستند ده بسبب صلاحيات الأمان بتاعة المعسكر.';
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-rose-50 via-purple-50 to-cyan-50 dark:from-[#0B0918] dark:via-[#140F2D] dark:to-[#081928]">
          <div className="glass-surface-strong rounded-3xl max-w-md w-full p-8 text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white flex items-center justify-center shadow-lg">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">تنبيه من معسكر مغلق</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{friendlyMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:opacity-95 transition-opacity cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              حمّل الصفحة تاني
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
