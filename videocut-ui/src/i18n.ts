import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import React from 'react';

export type Locale = 'zh' | 'en';

export interface Translations {
  review: string;
  batchExport: string;
  currentTab: string;
  mergeExecute: string;
  mergeProjectCount: string;
  playPause: string;
  selected: string;
  segments: string;
  burnSubtitle: string;
  resetDefault: string;
  executeCut: string;
  instructions: string;
  helpClick: string;
  helpJumpPlay: string;
  helpDblClick: string;
  helpSelectToggle: string;
  helpShiftDrag: string;
  helpBatch: string;
  helpSpace: string;
  helpArrows: string;
  helpJump: string;
  aiPreselect: string;
  confirmedDelete: string;
  cutting: string;
  processing: string;
  estimateCalc: string;
  noProjects: string;
  loadFailed: string;
  lightMode: string;
  darkMode: string;
  almostDone: string;
  selectFirst: string;
  currentProject: string;
  estimatedTime: string;
  clickToStart: string;
  confirmCutTitle: string;
  confirmMergeTitle: string;
  cutDone: string;
  mergeDone: string;
  output: string;
  subtitleOutputLabel: string;
  originalDuration: string;
  newDuration: string;
  deleted: string;
  cutFailed: string;
  mergeFailed: string;
  requestFailed: string;
  ensureServer: string;
  copiedSegments: string;
  formatMin: string;
  formatSec: string;
  estimateRemain: string;
  dialogConfirm: string;
  dialogCancel: string;
  dialogClose: string;
  subtitleStyleTitle: string;
  subtitlePresetLabel: string;
  subtitleJsonLabel: string;
  subtitleJsonHint: string;
  subtitleJsonValid: string;
  subtitleJsonInvalid: string;
  subtitlePromptLabel: string;
  subtitlePromptHint: string;
  subtitleCopyPrompt: string;
  subtitlePromptCopied: string;
  subtitleUpcoming: string;
}

const zh: Translations = {
  review: '审核',
  batchExport: '批量导出',
  currentTab: '当前 Tab',
  mergeExecute: '导出',
  mergeProjectCount: '参与项目',
  playPause: '播放/暂停',
  selected: '',
  segments: '段待删除',
  burnSubtitle: '字幕',
  resetDefault: '恢复默认',
  executeCut: '执行剪辑',
  instructions: '操作说明',
  helpClick: '单击',
  helpJumpPlay: '跳转播放',
  helpDblClick: '双击',
  helpSelectToggle: '选中/取消',
  helpShiftDrag: 'Shift+拖动',
  helpBatch: '批量操作',
  helpSpace: '空格',
  helpArrows: '←→',
  helpJump: '跳转',
  aiPreselect: 'AI预选',
  confirmedDelete: '已确认删除',
  cutting: '🎬 正在剪辑中...',
  processing: '处理中...',
  estimateCalc: '预估剩余: 计算中...',
  noProjects: '暂无项目，请先运行剪口播流程生成数据。',
  loadFailed: '加载失败:',
  lightMode: '浅色',
  darkMode: '深色',
  almostDone: '即将完成...',
  selectFirst: '请先选择要删除的内容',
  currentProject: '当前项目',
  estimatedTime: '预计耗时',
  clickToStart: '点击确定开始',
  confirmCutTitle: '确认执行剪辑？',
  confirmMergeTitle: '确认合并导出？',
  cutDone: '剪辑完成！',
  mergeDone: '合并导出完成！',
  output: '输出',
  subtitleOutputLabel: '字幕输出',
  originalDuration: '原时长',
  newDuration: '新时长',
  deleted: '删减',
  cutFailed: '剪辑失败',
  mergeFailed: '合并导出失败',
  requestFailed: '请求失败',
  ensureServer: '请确保使用 videocut review-server 启动服务',
  copiedSegments: '个删除片段已复制到剪贴板',
  formatMin: '分',
  formatSec: '秒',
  estimateRemain: '预估剩余',
  dialogConfirm: '确认',
  dialogCancel: '取消',
  dialogClose: '知道了',
  subtitleStyleTitle: '字幕样式',
  subtitlePresetLabel: '内置预设',
  subtitleJsonLabel: 'AI JSON 样式',
  subtitleJsonHint: '直接粘贴 AI 返回的 JSON，校验通过后会立即应用。',
  subtitleJsonValid: 'JSON 校验通过，已应用当前样式。',
  subtitleJsonInvalid: 'JSON 校验失败',
  subtitlePromptLabel: '给 AI 的提示词模板',
  subtitlePromptHint: '让 AI 只返回 schema JSON，不要自由文本。',
  subtitleCopyPrompt: '复制提示词',
  subtitlePromptCopied: '提示词已复制',
  subtitleUpcoming: '内置自然语言生成样式将在下一阶段接入。',
};

const en: Translations = {
  review: 'Review',
  batchExport: 'Batch Export',
  currentTab: 'Current Tab',
  mergeExecute: 'Export',
  mergeProjectCount: 'Projects',
  playPause: 'Play / Pause',
  selected: '',
  segments: 'segment(s) to delete',
  burnSubtitle: 'Subtitle',
  resetDefault: 'Reset',
  executeCut: 'Execute Cut',
  instructions: 'Help',
  helpClick: 'Click',
  helpJumpPlay: 'jump & play',
  helpDblClick: 'Double-click',
  helpSelectToggle: 'select / deselect',
  helpShiftDrag: 'Shift+Drag',
  helpBatch: 'batch select',
  helpSpace: 'Space',
  helpArrows: '←→',
  helpJump: 'seek',
  aiPreselect: 'AI pre-selected',
  confirmedDelete: 'Confirmed delete',
  cutting: '🎬 Cutting video...',
  processing: 'Processing...',
  estimateCalc: 'Estimated remaining: calculating...',
  noProjects: 'No projects found. Please run the clipping workflow first.',
  loadFailed: 'Failed to load:',
  lightMode: 'Light',
  darkMode: 'Dark',
  almostDone: 'Almost done...',
  selectFirst: 'Please select content to delete first',
  currentProject: 'Project',
  estimatedTime: 'Estimated time',
  clickToStart: 'Click OK to start',
  confirmCutTitle: 'Confirm cut?',
  confirmMergeTitle: 'Confirm merge export?',
  cutDone: 'Cut complete!',
  mergeDone: 'Merge export complete!',
  output: 'Output',
  subtitleOutputLabel: 'Subtitle output',
  originalDuration: 'Original',
  newDuration: 'New',
  deleted: 'Deleted',
  cutFailed: 'Cut failed',
  mergeFailed: 'Merge export failed',
  requestFailed: 'Request failed',
  ensureServer: 'Make sure videocut review-server is running',
  copiedSegments: 'delete segment(s) copied to clipboard',
  formatMin: 'm',
  formatSec: 's',
  estimateRemain: 'Estimated remaining',
  dialogConfirm: 'Confirm',
  dialogCancel: 'Cancel',
  dialogClose: 'Close',
  subtitleStyleTitle: 'Subtitle Style',
  subtitlePresetLabel: 'Presets',
  subtitleJsonLabel: 'AI JSON Style',
  subtitleJsonHint: 'Paste AI-generated JSON. Valid input is applied immediately.',
  subtitleJsonValid: 'JSON is valid and has been applied.',
  subtitleJsonInvalid: 'JSON validation failed',
  subtitlePromptLabel: 'Prompt Template for AI',
  subtitlePromptHint: 'Ask the model to return schema JSON only.',
  subtitleCopyPrompt: 'Copy Prompt',
  subtitlePromptCopied: 'Prompt copied',
  subtitleUpcoming: 'Built-in natural language style generation will land in the next phase.',
};

const locales: Record<Locale, Translations> = { zh, en };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translations;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'zh',
  setLocale: () => {},
  t: zh,
});

function getStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('videocut-locale');
  if (stored === 'zh' || stored === 'en') return stored;
  return null;
}

function detectLocale(): Locale {
  const stored = getStoredLocale();
  if (stored) return stored;
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language || '';
    if (lang.startsWith('zh')) return 'zh';
  }
  return 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('videocut-locale', l);
  }, []);

  const value: LocaleContextValue = {
    locale,
    setLocale,
    t: locales[locale],
  };

  return React.createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale() {
  return useContext(LocaleContext);
}
