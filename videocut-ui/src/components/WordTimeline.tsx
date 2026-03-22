import React, { memo } from 'react';
import type { Word } from '../types';

interface WordItemProps {
  word: Word;
  index: number;
  isGap: boolean;
  isSelected: boolean;
  isAuto: boolean;
  isCurrent: boolean;
  isEditing: boolean;
  wordRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  onWordClick: (word: Word) => void;
  onToggleWord: (index: number) => void;
  onWordMouseDown: (e: React.MouseEvent, index: number) => void;
  onWordMouseEnter: (index: number) => void;
  onStartEdit: (index: number) => void;
  onCommitEdit: (index: number, nextText: string) => void;
  onCancelEdit: () => void;
}

const WordItem = memo<WordItemProps>(
  ({
    word,
    index,
    isGap,
    isSelected,
    isAuto,
    isCurrent,
    isEditing,
    wordRefs,
    onWordClick,
    onToggleWord,
    onWordMouseDown,
    onWordMouseEnter,
    onStartEdit,
    onCommitEdit,
    onCancelEdit,
  }) => {
    const className = `${isGap ? 'gap' : 'word'} ${isSelected ? 'selected' : ''} ${!isSelected && isAuto ? 'ai-selected' : ''} ${isCurrent ? 'current' : ''}`.trim();

    return (
      <div
        ref={(el) => {
          wordRefs.current[index] = el;
        }}
        className={className}
        onClick={() => {
          if (!isEditing) onWordClick(word);
        }}
        onDoubleClick={() => {
          if (!isEditing) onToggleWord(index);
        }}
        onMouseDown={(e) => {
          if (!isEditing) onWordMouseDown(e, index);
        }}
        onMouseEnter={() => {
          if (!isEditing) onWordMouseEnter(index);
        }}
        onContextMenu={(e) => {
          if (isGap) return;
          e.preventDefault();
          onStartEdit(index);
        }}
      >
        {isGap ? (
          `⏸ ${(word.end - word.start).toFixed(1)}s`
        ) : isEditing ? (
          <input
            autoFocus
            className="word-inline-input"
            defaultValue={word.text}
            size={Math.max(1, word.text.length)}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => {
              e.currentTarget.select();
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.size = Math.max(1, el.value.length);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitEdit(index, e.currentTarget.value);
              if (e.key === 'Escape') onCancelEdit();
            }}
            onBlur={(e) => onCommitEdit(index, e.currentTarget.value)}
          />
        ) : (
          word.text
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.word === next.word &&
    prev.isSelected === next.isSelected &&
    prev.isAuto === next.isAuto &&
    prev.isCurrent === next.isCurrent &&
    prev.isEditing === next.isEditing
);

interface WordTimelineProps {
  words: Word[];
  selected: Set<number>;
  autoSelected: Set<number>;
  currentWordIndex: number;
  editingIndex: number | null;
  wordRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  onWordClick: (word: Word) => void;
  onToggleWord: (index: number) => void;
  onWordMouseDown: (e: React.MouseEvent, index: number) => void;
  onWordMouseEnter: (index: number) => void;
  onStartEdit: (index: number) => void;
  onCommitEdit: (index: number, nextText: string) => void;
  onCancelEdit: () => void;
}

export function WordTimeline({
  words,
  selected,
  autoSelected,
  currentWordIndex,
  editingIndex,
  wordRefs,
  onWordClick,
  onToggleWord,
  onWordMouseDown,
  onWordMouseEnter,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: WordTimelineProps) {
  return (
    <div className="content">
      {words.map((word, i) => (
        <WordItem
          key={i}
          word={word}
          index={i}
          isGap={!word.text || word.opt === 'blank'}
          isSelected={selected.has(i)}
          isAuto={autoSelected.has(i)}
          isCurrent={i === currentWordIndex}
          isEditing={editingIndex === i}
          wordRefs={wordRefs}
          onWordClick={onWordClick}
          onToggleWord={onToggleWord}
          onWordMouseDown={onWordMouseDown}
          onWordMouseEnter={onWordMouseEnter}
          onStartEdit={onStartEdit}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
        />
      ))}
    </div>
  );
}
