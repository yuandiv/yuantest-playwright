import { useState, useEffect } from 'react';
import { Lang } from '../i18n';
import { t } from '../i18n';
import { RunDetail, TestAttachment } from '../types';
import * as api from '../services/api';

interface TestDetailModalProps {
  lang: Lang;
  test: RunDetail | null;
  runId: number;
  htmlReportUrl?: string | null;
  onClose: () => void;
}

export function TestDetailModal({ lang, test, runId, htmlReportUrl, onClose }: TestDetailModalProps) {
  const [selectedAttachment, setSelectedAttachment] = useState<TestAttachment | null>(null);
  const [activeTab, setActiveTab] = useState<'error' | 'screenshots' | 'videos' | 'other'>('error');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!test) return null;

  const screenshots = test.attachments?.filter(a => 
    a.contentType?.startsWith('image/') || a.name.toLowerCase().includes('screenshot')
  ) || [];

  const videos = test.attachments?.filter(a => 
    a.contentType?.startsWith('video/') || a.name.toLowerCase().includes('video')
  ) || [];

  const otherAttachments = test.attachments?.filter(a => 
    !screenshots.includes(a) && !videos.includes(a)
  ) || [];

  const hasError = test.status === 'failed' && test.error;
  const hasScreenshots = screenshots.length > 0;
  const hasVideos = videos.length > 0;
  const hasOther = otherAttachments.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                test.status === 'passed' 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                {test.status === 'passed' ? '✅' : '❌'} {test.status.toUpperCase()}
              </span>
              <span className="text-sm text-gray-500">⏱️ {test.duration}s</span>
            </div>
            <h2 className="text-lg font-bold text-gray-800 pr-8">{test.name}</h2>
            {test.file && (
              <p className="text-xs text-gray-500 mt-1">
                📄 {test.file}{test.line ? `:${test.line}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex border-b border-gray-200 bg-gray-50">
          {hasError && (
            <button
              onClick={() => setActiveTab('error')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'error' 
                  ? 'text-red-600 border-b-2 border-red-600 bg-white' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-exclamation-circle mr-1.5"></i>
              {t('errorDebug', lang)}
            </button>
          )}
          {hasScreenshots && (
            <button
              onClick={() => setActiveTab('screenshots')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'screenshots' 
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-image mr-1.5"></i>
              {t('screenshots', lang) || 'Screenshots'} ({screenshots.length})
            </button>
          )}
          {hasVideos && (
            <button
              onClick={() => setActiveTab('videos')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'videos' 
                  ? 'text-purple-600 border-b-2 border-purple-600 bg-white' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-video mr-1.5"></i>
              {t('videos', lang) || 'Videos'} ({videos.length})
            </button>
          )}
          {hasOther && (
            <button
              onClick={() => setActiveTab('other')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'other' 
                  ? 'text-gray-600 border-b-2 border-gray-600 bg-white' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-paperclip mr-1.5"></i>
              {t('otherAttachments', lang) || 'Other'} ({otherAttachments.length})
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'error' && hasError && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fas fa-bug text-red-600"></i>
                  <span className="font-semibold text-red-700">{t('errorMessage', lang) || 'Error Message'}</span>
                </div>
                <pre className="text-sm text-red-600 whitespace-pre-wrap font-mono overflow-x-auto max-h-96">
                  {test.error}
                </pre>
              </div>
              
              {test.error && test.error.includes('Stack trace:') && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-layer-group text-gray-600"></i>
                    <span className="font-semibold text-gray-700">{t('stackTrace', lang) || 'Stack Trace'}</span>
                  </div>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono overflow-x-auto max-h-64">
                    {test.error.split('Stack trace:')[1]?.trim() || ''}
                  </pre>
                </div>
              )}
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fas fa-lightbulb text-blue-600"></i>
                  <span className="font-semibold text-blue-700">{t('suggestions', lang) || 'Suggestions'}</span>
                </div>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• {t('checkSelector', lang) || 'Check if the selector is correct'}</li>
                  <li>• {t('checkElement', lang) || 'Verify the element exists in the DOM'}</li>
                  <li>• {t('checkTimeout', lang) || 'Consider increasing timeout if needed'}</li>
                  <li>• {t('checkNetwork', lang) || 'Check network connectivity and API responses'}</li>
                  <li>• {t('viewScreenshots', lang) || 'View screenshots and videos for visual debugging'}</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'screenshots' && hasScreenshots && (
            <div className="space-y-4">
              {screenshots.map((screenshot, index) => (
                <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      <i className="fas fa-image mr-2 text-blue-500"></i>
                      {screenshot.name}
                    </span>
                    <a
                      href={screenshot.path || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      <i className="fas fa-external-link-alt mr-1"></i>
                      {t('openNewTab', lang) || 'Open in new tab'}
                    </a>
                  </div>
                  <div className="p-2 bg-gray-100">
                    {screenshot.path ? (
                      <img
                        src={screenshot.path}
                        alt={screenshot.name}
                        className="max-w-full h-auto mx-auto rounded shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setSelectedAttachment(screenshot)}
                      />
                    ) : screenshot.body ? (
                      <img
                        src={`data:${screenshot.contentType || 'image/png'};base64,${screenshot.body}`}
                        alt={screenshot.name}
                        className="max-w-full h-auto mx-auto rounded shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setSelectedAttachment(screenshot)}
                      />
                    ) : (
                      <div className="text-center text-gray-400 py-8">
                        <i className="fas fa-image text-4xl mb-2"></i>
                        <p className="text-sm">{t('imageNotAvailable', lang) || 'Image not available'}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'videos' && hasVideos && (
            <div className="space-y-4">
              {videos.map((video, index) => (
                <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      <i className="fas fa-video mr-2 text-purple-500"></i>
                      {video.name}
                    </span>
                    <a
                      href={video.path || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      <i className="fas fa-download mr-1"></i>
                      {t('download', lang) || 'Download'}
                    </a>
                  </div>
                  <div className="p-2 bg-black">
                    {video.path ? (
                      <video
                        src={video.path}
                        controls
                        className="max-w-full h-auto mx-auto"
                        style={{ maxHeight: '400px' }}
                      >
                        {t('videoNotSupported', lang) || 'Your browser does not support the video tag.'}
                      </video>
                    ) : (
                      <div className="text-center text-gray-400 py-8">
                        <i className="fas fa-video text-4xl mb-2"></i>
                        <p className="text-sm">{t('videoNotAvailable', lang) || 'Video not available'}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'other' && hasOther && (
            <div className="space-y-2">
              {otherAttachments.map((attachment, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <i className="fas fa-file text-gray-400 text-lg"></i>
                    <div>
                      <p className="text-sm font-medium text-gray-700">{attachment.name}</p>
                      {attachment.contentType && (
                        <p className="text-xs text-gray-500">{attachment.contentType}</p>
                      )}
                    </div>
                  </div>
                  {attachment.path && (
                    <a
                      href={attachment.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      <i className="fas fa-external-link-alt"></i>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {!hasError && !hasScreenshots && !hasVideos && !hasOther && (
            <div className="text-center py-12 text-gray-400">
              <i className="fas fa-folder-open text-5xl mb-3"></i>
              <p>{t('noAttachments', lang) || 'No attachments available'}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-500">
              {t('runId', lang) || 'Run ID'}: {runId} • {t('testId', lang) || 'Test ID'}: {test.id}
            </div>
            {htmlReportUrl && (
              <a
                href={htmlReportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <i className="fas fa-external-link-alt"></i>
                {t('viewHtmlReport', lang) || 'View HTML Report'}
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            {t('close', lang) || 'Close'}
          </button>
        </div>
      </div>

      {selectedAttachment && (
        <div 
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedAttachment(null)}
        >
          <button
            onClick={() => setSelectedAttachment(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
          >
            <i className="fas fa-times text-2xl"></i>
          </button>
          {selectedAttachment.path ? (
            <img
              src={selectedAttachment.path}
              alt={selectedAttachment.name}
              className="max-w-full max-h-full object-contain"
            />
          ) : selectedAttachment.body ? (
            <img
              src={`data:${selectedAttachment.contentType || 'image/png'};base64,${selectedAttachment.body}`}
              alt={selectedAttachment.name}
              className="max-w-full max-h-full object-contain"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
